import { HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import {
  addConnection,
  admin,
  createBucket,
  openBucket,
  openFolder,
  removeBucket,
  secretAccessKey,
} from './s3-env';

/** The extension APIs used inside `page.evaluate` (runs in the extension page). */
declare const chrome: {
  storage: { local: StorageArea };
  downloads: {
    search(query: object): Promise<{ url: string; state: string; bytesReceived: number }[]>;
  };
};
interface StorageArea {
  get(keys: null): Promise<Record<string, unknown>>;
}

const bucket = `e2e-${Date.now()}`;
const FILE_SIZE = 50 * 1024 * 1024; // multipart: 7 parts of 8 MiB

test.beforeAll(async () => {
  await createBucket(bucket);
});

test.afterAll(async () => {
  await removeBucket(bucket);
});

test('full flow against a local S3 server', async ({ manager: page, pageErrors }) => {
  const workDir = mkdtempSync(join(tmpdir(), 's3om-e2e-'));
  mkdirSync(join(workDir, 'upload'));
  const bigFile = join(workDir, 'upload', 'big.bin');
  const content = Buffer.alloc(FILE_SIZE);
  for (let i = 0; i < FILE_SIZE; i += 4096) content[i] = i % 251;
  writeFileSync(bigFile, content);

  await addConnection(page, { name: 'Local S3', bucket });

  // Credentials are never stored in clear text.
  const stored = await page.evaluate(() => chrome.storage.local.get(null));
  expect(JSON.stringify(stored)).not.toContain(secretAccessKey);

  await openBucket(page, bucket);

  // Create a folder and open it.
  await page.getByTestId('new-folder').click();
  await page.getByTestId('new-folder-name').locator('input').fill('docs');
  await page.getByTestId('new-folder-create').click();
  await openFolder(page, 'docs/');

  // Upload 50 MB (multipart) into docs/.
  await page.getByTestId('file-input').setInputFiles(bigFile);
  await expect(page.getByTestId('upload-status-big.bin')).toHaveAttribute('data-status', 'done', {
    timeout: 120_000,
  });
  const head = await admin.send(new HeadObjectCommand({ Bucket: bucket, Key: 'docs/big.bin' }));
  expect(head.ContentLength).toBe(FILE_SIZE);
  expect(head.ETag).toMatch(/-7"$/); // multipart ETag: 7 parts
  await page.getByTestId('upload-queue-close').click();

  // Browse: the uploaded file is listed.
  await page.getByTestId('refresh').click();
  await expect(page.getByTestId('entry-big.bin')).toBeVisible();

  // Rename it.
  await page.getByTestId('menu-big.bin').click();
  await page.getByTestId('action-rename').click();
  await page.getByTestId('transfer-target').locator('input').fill('docs/renamed.bin');
  await page.getByTestId('transfer-next').click();
  await expect(page.getByTestId('entry-renamed.bin')).toBeVisible();
  await expect(page.getByTestId('entry-big.bin')).toHaveCount(0);

  // Presign, then fetch the link from outside the extension.
  await page.getByTestId('menu-renamed.bin').click();
  await page.getByTestId('action-share').click();
  const url = await page.getByTestId('share-url').locator('input').inputValue();
  expect(url).toContain('X-Amz-Signature=');
  const response = await fetch(url);
  expect(response.status).toBe(200);
  expect((await response.arrayBuffer()).byteLength).toBe(FILE_SIZE);
  await page.keyboard.press('Escape');

  // Download through the browser's download manager.
  await page.getByTestId('menu-renamed.bin').click();
  await page.getByTestId('action-download').click();
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          // Playwright stores downloads under generated names, so match on the URL.
          const items = await chrome.downloads.search({});
          const item = items.find((download) => download.url.includes('renamed.bin'));
          return item ? `${item.state}:${item.bytesReceived}` : 'none';
        }),
      { timeout: 60_000 },
    )
    .toBe(`complete:${FILE_SIZE}`);

  // Delete the whole folder: the confirmation states the exact object count.
  await page.getByTestId('crumb-bucket').click();
  await page.getByTestId('menu-docs/').click();
  await page.getByTestId('action-delete').click();
  await expect(page.getByTestId('delete-count')).toContainText('2');
  await page.getByTestId('delete-confirm').click();
  await expect(page.getByTestId('entry-docs/')).toHaveCount(0);

  // Saved connections survive a reload with nothing to type.
  await page.reload();
  await expect(page.getByTestId('profile-item-Local S3')).toBeVisible();

  // No CSP violations or uncaught errors in the extension page.
  expect(pageErrors).toEqual([]);
});

test('uploads keep running after the upload panel is closed', async ({ manager: page }) => {
  const dir = mkdtempSync(join(tmpdir(), 's3om-e2e-many-'));
  const files = Array.from({ length: 260 }, (_, i) => {
    const path = join(dir, `file-${String(i).padStart(3, '0')}.txt`);
    writeFileSync(path, `content ${i}\n`.repeat(50));
    return path;
  });

  await addConnection(page, { name: 'Local S3', bucket });
  await openBucket(page, bucket);
  await page.getByTestId('new-folder').click();
  await page.getByTestId('new-folder-name').locator('input').fill('many');
  await page.getByTestId('new-folder-create').click();
  await openFolder(page, 'many/');

  await page.getByTestId('file-input').setInputFiles(files);
  await page.getByTestId('upload-queue-close').click();
  // A closed drawer stays in the DOM, slid out of view.
  await expect(page.getByTestId('upload-queue-drawer')).not.toHaveClass(
    /v-navigation-drawer--active/,
  );

  // With the panel closed, every file still reaches the server.
  await expect
    .poll(
      async () => {
        const listed = await admin.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: 'many/file-', MaxKeys: 1000 }),
        );
        return listed.KeyCount ?? 0;
      },
      { timeout: 120_000, intervals: [1000] },
    )
    .toBe(files.length);
});
