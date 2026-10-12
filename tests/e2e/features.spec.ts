/**
 * Feature scenarios beyond the main flow: connections, browsing, uploads (pause, cancel,
 * resume after a reload, folders), copy/move, multi-select delete, properties, share links,
 * settings and error messages.
 */
import {
  AbortMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListPartsCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  addConnection,
  admin,
  createBucket,
  entryAction,
  fillConnection,
  listKeys,
  openBucket,
  openFolder,
  putObjects,
  removeBucket,
  scoped,
  secretAccessKey,
} from './s3-env';

declare const chrome: {
  storage: { local: { get(keys: null): Promise<Record<string, unknown>> } };
  downloads: { search(query: object): Promise<{ url: string; state: string }[]> };
};

const bucket = `e2e-${Date.now()}-f`;
const MiB = 1024 * 1024;
const workDir = mkdtempSync(join(tmpdir(), 's3om-features-'));

function makeFile(name: string, size: number, seed = 1): string {
  const path = join(workDir, name);
  const content = Buffer.alloc(size);
  for (let i = 0; i < size; i += 512) content[i] = (i / 512 + seed) % 251;
  writeFileSync(path, content);
  return path;
}

const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

async function sha256Of(key: string): Promise<string> {
  const object = await admin.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return sha256((await object.Body?.transformToByteArray()) ?? new Uint8Array());
}

/** Slows every part upload down so pause/cancel/reload can land mid-upload. */
async function throttleParts(context: BrowserContext, delayMs: number): Promise<void> {
  await context.route(/[?&]partNumber=/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    // A reload or unroute may drop the request while it waits.
    await route.continue().catch(() => undefined);
  });
}

async function setConcurrency(page: Page, value: number): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).click();
  const slider = page.getByRole('slider');
  await slider.focus();
  await slider.press('Home');
  for (let i = 1; i < value; i += 1) await slider.press('ArrowRight');
  await page.getByRole('button', { name: 'Close' }).click();
}

async function pendingUploads(key: string): Promise<number> {
  const listed = await admin.send(new ListMultipartUploadsCommand({ Bucket: bucket, Prefix: key }));
  return (listed.Uploads ?? []).filter((upload) => upload.Key === key).length;
}

test.beforeAll(async () => {
  await createBucket(bucket);
});

test.afterAll(async () => {
  const listed = await admin.send(new ListMultipartUploadsCommand({ Bucket: bucket }));
  for (const upload of listed.Uploads ?? []) {
    await admin.send(
      new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: upload.Key,
        UploadId: upload.UploadId,
      }),
    );
  }
  await removeBucket(bucket);
});

test.describe('connections', () => {
  test('wrong keys are explained in plain language', async ({ manager: page }) => {
    await fillConnection(page, { name: 'Wrong secret', secretAccessKey: `${secretAccessKey}x` });
    await expect(page.getByText('Request signature is not valid')).toBeVisible();
    await expect(page.getByTestId('profile-test-result')).toHaveCount(0);

    await page.getByTestId('profile-access-key').locator('input').fill('NOSUCHACCESSKEY0000');
    await page.getByTestId('profile-test').click();
    await expect(
      page.getByText(/Access key does not exist|Request signature is not valid|Access denied/),
    ).toBeVisible();
  });

  test('unsafe or malformed endpoints are refused before any request', async ({
    manager: page,
  }) => {
    await page.getByTestId('profile-add').click();
    const field = page.getByTestId('profile-endpoint');
    const cases: [string, string][] = [
      ['http://s3.example.com', 'http:// only works with localhost'],
      ['ftp://s3.example.com', 'Only https:// is supported'],
      ['javascript:alert(1)', 'Only https:// is supported'],
      ['https://user:pass@s3.example.com', 'Not a valid address'],
      ['not a url', 'Not a valid address'],
    ];
    for (const [value, message] of cases) {
      await field.locator('input').fill(value);
      await expect(field).toContainText(message);
      await expect(page.getByTestId('profile-save')).toBeDisabled();
      await expect(page.getByTestId('profile-test')).toBeDisabled();
    }
  });

  test('edit, switch and delete connections', async ({ manager: page }) => {
    await addConnection(page, { name: 'First', bucket });
    await addConnection(page, { name: 'Second', bucket });
    await expect(page.getByTestId('profile-item-First')).toBeVisible();

    // Rename "Second" through the edit form; the keys stay as they were.
    await page
      .getByTestId('profile-item-Second')
      .getByRole('button', { name: 'More actions' })
      .click();
    await page.locator('.v-overlay--active').getByText('Edit', { exact: true }).click();
    await page.getByTestId('profile-name').locator('input').fill('Renamed');
    await page.getByTestId('profile-save').click();
    await page.getByTestId('profile-item-Renamed').click();
    await openBucket(page, bucket);

    // Delete "First": it is gone after a reload and its secret is not left behind.
    await page
      .getByTestId('profile-item-First')
      .getByRole('button', { name: 'More actions' })
      .click();
    await page.locator('.v-overlay--active').getByText('Delete', { exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await page.reload();
    await expect(page.getByTestId('profile-item-First')).toHaveCount(0);
    await expect(page.getByTestId('profile-item-Renamed')).toBeVisible();
    const stored = await page.evaluate(() => chrome.storage.local.get(null));
    expect(JSON.stringify(stored)).not.toContain(secretAccessKey);
  });

  test('a key limited to one bucket works through the default bucket', async ({
    manager: page,
  }) => {
    test.skip(!scoped, 'no bucket-scoped key for this server');
    if (!scoped) return;
    await createBucket(scoped.bucket).catch(() => undefined);
    await putObjects(scoped.bucket, { 'scoped.txt': 'only this bucket' });
    try {
      await fillConnection(page, {
        name: 'Scoped',
        bucket: scoped.bucket,
        accessKeyId: scoped.accessKeyId,
        secretAccessKey: scoped.secretAccessKey,
      });
      // Servers either refuse ListBuckets for such a key or list only the buckets it may use.
      await expect(page.getByTestId('profile-test-result')).toContainText(
        new RegExp(`${scoped.bucket}|sees 1 bucket`),
      );
      await page.getByTestId('profile-save').click();
      await page.getByTestId('profile-item-Scoped').click();
      // A key that may list its own bucket gets the bucket list; others open the bucket directly.
      const crumb = page.getByTestId('crumb-bucket');
      await expect(crumb.or(page.getByTestId('bucket-list'))).toBeVisible();
      if (!(await crumb.isVisible())) await openBucket(page, scoped.bucket);
      await expect(crumb).toHaveText(scoped.bucket);
      await expect(page.getByTestId('entry-scoped.txt')).toBeVisible();

      // Going back to the bucket list on purpose stays there (no bounce to the default bucket).
      const allBuckets = page.getByRole('button', { name: 'All buckets' });
      if (await allBuckets.isVisible()) {
        await allBuckets.click();
        await page.waitForTimeout(1500);
        await expect(crumb).toHaveCount(0);
        await expect(page.getByText('Buckets', { exact: true })).toBeVisible();
      }
    } finally {
      // The bucket stays: on other servers its access is granted by a policy set up outside.
      await removeBucket(scoped.bucket, true);
    }
  });

  test('a missing bucket opened by name gets a clear message', async ({ manager: page }) => {
    await addConnection(page, { name: 'Local S3' });
    await page.getByTestId('bucket-open-by-name').click();
    const input = page.getByTestId('bucket-name-input').locator('input');
    await input.fill(`no-such-bucket-${Date.now()}`);
    await input.press('Enter');
    await expect(page.getByText('Bucket does not exist')).toBeVisible();
  });
});

test.describe('browsing', () => {
  test('pages of 1,000 keys, name filter and breadcrumbs', async ({ manager: page }) => {
    const many = Object.fromEntries(
      Array.from({ length: 1050 }, (_, i) => [
        `paging/item-${String(i).padStart(4, '0')}.txt`,
        'x',
      ]),
    );
    await putObjects(bucket, { ...many, 'paging/deep/er/leaf.txt': 'leaf' });

    await addConnection(page, { name: 'Local S3', bucket });
    await openBucket(page, bucket);
    await openFolder(page, 'paging/');
    // The first page holds 1,000 keys; the `deep/` folder sorts after them.
    await expect(page.getByText('1000 items loaded · 1 list requests')).toBeVisible();
    const rows = page.getByTestId('object-rows');
    await expect
      .poll(
        async () => {
          await rows.evaluate((element) => element.scrollTo(0, element.scrollHeight));
          return page.getByText('1051 items loaded · 2 list requests').count();
        },
        { timeout: 30_000 },
      )
      .toBe(1);

    // The filter is a name prefix sent to the server.
    await page.getByTestId('filter').locator('input').fill('item-104');
    await expect(page.getByText('10 items loaded')).toBeVisible();
    await expect(page.getByTestId('entry-item-1049.txt')).toBeVisible();
    await page.getByTestId('filter').locator('input').fill('');

    // Breadcrumbs lead back up the tree.
    await openFolder(page, 'deep/');
    await openFolder(page, 'er/');
    await expect(page.getByTestId('entry-leaf.txt')).toBeVisible();
    const crumbs = page.getByRole('navigation', { name: 'Current location' });
    await crumbs.getByRole('button', { name: 'deep' }).click();
    await expect(page.getByTestId('entry-er/')).toBeVisible();
    await page.getByTestId('crumb-bucket').click();
    await expect(page.getByTestId('entry-paging/')).toBeVisible();

    await removeBucket(bucket, true);
  });
});

test.describe('uploads', () => {
  test('several small files arrive byte for byte', async ({ manager: page }) => {
    const files = ['a.txt', 'b.bin', 'c d (1).txt'].map((name, i) =>
      makeFile(name, 1000 + i * 7777, i),
    );
    await addConnection(page, { name: 'Local S3', bucket });
    await openBucket(page, bucket);
    await page.getByTestId('file-input').setInputFiles(files);
    for (const name of ['a.txt', 'b.bin', 'c d (1).txt']) {
      await expect(page.getByTestId(`upload-status-${name}`)).toHaveAttribute(
        'data-status',
        'done',
      );
      expect(await sha256Of(name)).toBe(sha256(readFileSync(join(workDir, name))));
    }
    await expect(page.getByTestId('upload-summary')).toContainText('Done 3/3');
  });

  test('pause and resume a multipart upload', async ({ context, manager: page }) => {
    const file = makeFile('pause.bin', 40 * MiB, 3);
    await throttleParts(context, 700);
    await addConnection(page, { name: 'Local S3', bucket });
    await setConcurrency(page, 1);
    await openBucket(page, bucket);
    await page.getByTestId('file-input').setInputFiles(file);
    const status = page.getByTestId('upload-status-pause.bin');
    await expect(status).toHaveAttribute('data-status', 'running');
    const job = page.getByTestId('upload-job-pause.bin');
    await job.getByRole('button', { name: 'Pause' }).click();
    await expect(status).toHaveAttribute('data-status', 'paused');
    await job.getByRole('button', { name: 'Resume' }).click();
    await expect(status).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
    const head = await admin.send(new HeadObjectCommand({ Bucket: bucket, Key: 'pause.bin' }));
    expect(head.ContentLength).toBe(40 * MiB);
    expect(head.ETag).toMatch(/-5"$/);
    expect(await pendingUploads('pause.bin')).toBe(0);
  });

  test('cancelling an upload removes its parts from the server', async ({
    context,
    manager: page,
  }) => {
    const file = makeFile('cancel.bin', 40 * MiB, 4);
    await throttleParts(context, 700);
    await addConnection(page, { name: 'Local S3', bucket });
    await setConcurrency(page, 1);
    await openBucket(page, bucket);
    await page.getByTestId('file-input').setInputFiles(file);
    const status = page.getByTestId('upload-status-cancel.bin');
    await expect(status).toHaveAttribute('data-status', 'running');
    await expect.poll(() => pendingUploads('cancel.bin')).toBe(1);
    await page
      .getByTestId('upload-job-cancel.bin')
      .getByRole('button', { name: 'Cancel upload' })
      .click();
    await expect(status).toHaveAttribute('data-status', 'cancelled');
    await expect.poll(() => pendingUploads('cancel.bin'), { timeout: 20_000 }).toBe(0);
    await expect
      .poll(() =>
        admin.send(new HeadObjectCommand({ Bucket: bucket, Key: 'cancel.bin' })).then(
          () => 'exists',
          () => 'missing',
        ),
      )
      .toBe('missing');
  });

  test('an upload interrupted by a reload resumes from the parts on the server', async ({
    context,
    manager: page,
  }) => {
    const file = makeFile('resume.bin', 40 * MiB, 5);
    await throttleParts(context, 700);
    await addConnection(page, { name: 'Local S3', bucket });
    await setConcurrency(page, 1);
    await openBucket(page, bucket);
    await page.getByTestId('file-input').setInputFiles(file);
    await expect(page.getByTestId('upload-job-resume.bin')).toContainText(/MB|MiB/);
    // Wait until at least one part is on the server, then pull the plug.
    await expect
      .poll(
        async () => {
          const listed = await admin.send(new ListMultipartUploadsCommand({ Bucket: bucket }));
          const upload = (listed.Uploads ?? []).find((item) => item.Key === 'resume.bin');
          if (!upload) return 0;
          const parts = await admin.send(
            new ListPartsCommand({ Bucket: bucket, Key: 'resume.bin', UploadId: upload.UploadId }),
          );
          return parts.Parts?.length ?? 0;
        },
        { timeout: 60_000 },
      )
      .toBeGreaterThan(0);
    await page.reload();
    await context.unroute(/[?&]partNumber=/);

    await page.getByTestId('profile-item-Local S3').click();
    await openBucket(page, bucket);
    await page.getByRole('button', { name: 'Unfinished uploads' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Can be resumed')).toBeVisible();

    // The wrong file is refused…
    const wrong = makeFile('resume.bin.other', 1 * MiB);
    let chooser = page.waitForEvent('filechooser');
    await dialog.getByRole('button', { name: 'Pick the file again' }).click();
    await (await chooser).setFiles(wrong);
    await expect(page.getByText(/does not match/)).toBeVisible();

    // …the right one resumes and only uploads the missing parts.
    chooser = page.waitForEvent('filechooser');
    await dialog.getByRole('button', { name: 'Pick the file again' }).click();
    await (await chooser).setFiles(file);
    await page.keyboard.press('Escape');
    // The upload panel opens by itself when the job is queued.
    await expect(page.getByTestId('upload-status-resume.bin')).toHaveAttribute(
      'data-status',
      'done',
      { timeout: 60_000 },
    );
    await expect(page.getByTestId('upload-job-resume.bin')).toContainText(/resumed from \d+ part/);
    expect(await sha256Of('resume.bin')).toBe(sha256(readFileSync(file)));
  });

  test('unfinished uploads on the server can be listed and discarded', async ({
    manager: page,
  }) => {
    const key = 'orphan.bin';
    const created = await admin.send(
      new CreateMultipartUploadCommand({ Bucket: bucket, Key: key }),
    );
    await admin.send(
      new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: created.UploadId,
        PartNumber: 1,
        Body: Buffer.alloc(5 * MiB, 1),
      }),
    );
    await addConnection(page, { name: 'Local S3', bucket });
    await openBucket(page, bucket);
    await page.getByRole('button', { name: 'Unfinished uploads' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(key)).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel and delete parts' }).click();
    await expect.poll(() => pendingUploads(key), { timeout: 20_000 }).toBe(0);
  });

  test('a whole folder uploads with its structure', async ({ manager: page }) => {
    const dir = join(workDir, 'album');
    mkdirSync(join(dir, 'nested'), { recursive: true });
    writeFileSync(join(dir, 'one.txt'), 'one');
    writeFileSync(join(dir, 'nested', 'two.txt'), 'two');
    await addConnection(page, { name: 'Local S3', bucket });
    await openBucket(page, bucket);
    await page.locator('input[webkitdirectory]').setInputFiles(dir);
    await expect(page.getByTestId('upload-status-two.txt')).toHaveAttribute('data-status', 'done');
    await expect
      .poll(() => listKeys(bucket, 'album/'))
      .toEqual(['album/nested/two.txt', 'album/one.txt']);
  });
});

test.describe('object operations', () => {
  test.beforeEach(async () => {
    await removeBucket(bucket, true);
    await putObjects(bucket, {
      'src/a.txt': 'alpha',
      'src/b.txt': 'beta',
      'src/sub/c.txt': 'gamma',
      'note.txt': 'note',
      'other.txt': 'other',
    });
  });

  test('copy an object and a folder', async ({ manager: page }) => {
    await addConnection(page, { name: 'Local S3', bucket });
    await openBucket(page, bucket);

    await entryAction(page, 'note.txt', 'copy');
    await page.getByTestId('transfer-target').locator('input').fill('copies/note-copy.txt');
    await page.getByTestId('transfer-next').click();
    await expect(page.getByTestId('entry-copies/')).toBeVisible();

    await entryAction(page, 'src/', 'copy');
    await page.getByTestId('transfer-target').locator('input').fill('backup/');
    await page.getByTestId('transfer-next').click();
    await expect(page.getByText('3 objects will be copied.')).toBeVisible();
    await page.getByTestId('transfer-confirm').click();
    // The dialog closes by itself once every object is done.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect
      .poll(() => listKeys(bucket, 'backup/'))
      .toEqual(['backup/a.txt', 'backup/b.txt', 'backup/sub/c.txt']);
    expect(await listKeys(bucket, 'src/')).toHaveLength(3);
    expect(await listKeys(bucket, 'copies/')).toEqual(['copies/note-copy.txt']);
  });

  test('move a folder, with overwrite warning and invalid targets refused', async ({
    manager: page,
  }) => {
    await putObjects(bucket, { 'dest/a.txt': 'old alpha' });
    await addConnection(page, { name: 'Local S3', bucket });
    await openBucket(page, bucket);

    await entryAction(page, 'src/', 'rename');
    const target = page.getByTestId('transfer-target').locator('input');
    await target.fill('src/inner/');
    await expect(page.getByText('A folder cannot be moved into itself')).toBeVisible();
    await expect(page.getByTestId('transfer-next')).toBeDisabled();

    await target.fill('dest/');
    await page.getByTestId('transfer-next').click();
    await expect(page.getByText('3 objects will be moved.')).toBeVisible();
    await expect(page.getByText('1 object at the target will be overwritten.')).toBeVisible();
    await page.getByTestId('transfer-confirm').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => listKeys(bucket, 'src/')).toEqual([]);
    expect(await listKeys(bucket, 'dest/')).toEqual(['dest/a.txt', 'dest/b.txt', 'dest/sub/c.txt']);
    expect(await sha256Of('dest/a.txt')).toBe(sha256('alpha'));

    await entryAction(page, 'note.txt', 'rename');
    await target.fill('note.txt');
    await expect(page.getByText('The target is the same as the source')).toBeVisible();
    await target.fill('folder/');
    await expect(page.getByText('An object path cannot end with /')).toBeVisible();
    await expect(page.getByTestId('transfer-next')).toBeDisabled();
  });

  test('select several entries and delete them together', async ({ manager: page }) => {
    await addConnection(page, { name: 'Local S3', bucket });
    await openBucket(page, bucket);
    await page.getByRole('checkbox', { name: 'Select note.txt' }).check();
    await page.getByRole('checkbox', { name: 'Select other.txt' }).check();
    await page.getByRole('checkbox', { name: 'Select src/' }).check();
    await page.getByTestId('delete-selected').click();
    await expect(page.getByTestId('delete-count')).toContainText('5');
    await page.getByTestId('delete-confirm').click();
    await expect(page.getByTestId('entry-note.txt')).toHaveCount(0);
    expect(await listKeys(bucket)).toEqual([]);
  });

  test('new folder names are validated', async ({ manager: page }) => {
    await addConnection(page, { name: 'Local S3', bucket });
    await openBucket(page, bucket);
    await page.getByTestId('new-folder').click();
    await page.getByTestId('new-folder-name').locator('input').fill('a/b');
    await expect(page.getByText('A folder name cannot contain /')).toBeVisible();
    await expect(page.getByTestId('new-folder-create')).toBeDisabled();
  });

  test('properties show type, size and metadata', async ({ manager: page }) => {
    await putObjects(
      bucket,
      { 'report.csv': 'a,b\n1,2\n' },
      { ContentType: 'text/csv', Metadata: { owner: 'finance' } },
    );
    await addConnection(page, { name: 'Local S3', bucket });
    await openBucket(page, bucket);
    await entryAction(page, 'report.csv', 'properties');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Object properties');
    await expect(dialog).toContainText('report.csv');
    await expect(dialog).toContainText('text/csv');
    await expect(dialog).toContainText('owner');
    await expect(dialog).toContainText('finance');
  });

  test('share links for 1 hour, 1 day and 7 days', async ({ manager: page }) => {
    await addConnection(page, { name: 'Local S3', bucket });
    await openBucket(page, bucket);
    await entryAction(page, 'note.txt', 'share');
    const dialog = page.getByRole('dialog');
    const url = dialog.getByTestId('share-url').locator('input');
    const expectations: [string | undefined, number][] = [
      // One day is the default.
      [undefined, 86400],
      ['1 hour', 3600],
      ['7 days (maximum)', 604800],
    ];
    for (const [choice, seconds] of expectations) {
      if (choice) {
        await dialog.locator('.v-select').click();
        await page.getByRole('option', { name: choice }).click();
      }
      await expect(url).toHaveValue(new RegExp(`X-Amz-Expires=${seconds}(&|$)`));
      const response = await fetch(await url.inputValue());
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('note');
    }
  });

  test('download several selected objects', async ({ manager: page }) => {
    await addConnection(page, { name: 'Local S3', bucket });
    await openBucket(page, bucket);
    await page.getByRole('checkbox', { name: 'Select note.txt' }).check();
    await page.getByRole('checkbox', { name: 'Select other.txt' }).check();
    await page.getByRole('button', { name: 'Download (2)' }).click();
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const items = await chrome.downloads.search({});
            return items.filter((item) => item.state === 'complete').length;
          }),
        { timeout: 30_000 },
      )
      .toBe(2);
  });
});

test.describe('settings', () => {
  test('language, theme and upload concurrency persist', async ({ manager: page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('.v-select').first().click();
    await page.getByRole('option', { name: 'Tiếng Việt' }).click();
    await expect(dialog).toContainText('Cài đặt');
    await dialog.locator('.v-select').nth(1).click();
    await page.getByRole('option', { name: 'Tối' }).click();
    const slider = dialog.getByRole('slider');
    await slider.focus();
    await slider.press('End');
    const max = await slider.getAttribute('aria-valuenow');
    await page.getByRole('button', { name: 'Đóng' }).click();

    await page.reload();
    await expect(page.getByTestId('profile-add')).toContainText('Thêm kết nối');
    await expect(page.locator('.v-application.v-theme--appDark')).toBeVisible();
    await page.getByRole('button', { name: 'Cài đặt' }).click();
    await expect(page.getByRole('dialog').getByRole('slider')).toHaveAttribute(
      'aria-valuenow',
      max ?? '',
    );
  });
});
