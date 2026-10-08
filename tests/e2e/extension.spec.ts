import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const endpoint = process.env.E2E_S3_ENDPOINT ?? 'http://localhost:8333';
const identity = JSON.parse(
  readFileSync(new URL('../../docker/seaweedfs-s3.json', import.meta.url), 'utf8'),
) as { identities: { credentials: { accessKey: string; secretKey: string }[] }[] };
const keys = identity.identities[0]?.credentials[0];
const accessKeyId = process.env.E2E_S3_ACCESS_KEY_ID ?? keys?.accessKey ?? '';
const secretAccessKey = process.env.E2E_S3_SECRET_ACCESS_KEY ?? keys?.secretKey ?? '';

/** The extension APIs used inside `page.evaluate` (runs in the extension page). */
declare const chrome: {
  storage: { local: StorageArea; session: StorageArea };
  downloads: {
    search(query: object): Promise<{ url: string; state: string; bytesReceived: number }[]>;
  };
};
interface StorageArea {
  get(keys: null): Promise<Record<string, unknown>>;
}

const PASSPHRASE = 'e2e passphrase for the vault';
const bucket = `e2e-${Date.now()}`;
const FILE_SIZE = 50 * 1024 * 1024; // multipart: 7 parts of 8 MiB

const admin = new S3Client({
  endpoint,
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

test.beforeAll(async () => {
  await admin.send(new CreateBucketCommand({ Bucket: bucket }));
});

test.afterAll(async () => {
  const { Contents = [] } = await admin.send(new ListObjectsV2Command({ Bucket: bucket }));
  if (Contents.length) {
    await admin.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: Contents.map((item) => ({ Key: item.Key })) },
      }),
    );
  }
  await admin.send(new DeleteBucketCommand({ Bucket: bucket }));
});

/** Sets the passphrase and adds a tested connection to the local server. */
async function createVaultAndConnection(page: Page) {
  await page.getByTestId('vault-passphrase').locator('input').fill(PASSPHRASE);
  await page.getByTestId('vault-passphrase-confirm').locator('input').fill(PASSPHRASE);
  await page.getByTestId('vault-create').click();

  // Host access to localhost is pre-granted in the e2e build.
  await page.getByTestId('profile-add').click();
  await page.getByTestId('profile-name').locator('input').fill('Local S3');
  await page.getByTestId('profile-endpoint').locator('input').fill(endpoint);
  await page.getByTestId('profile-default-bucket').locator('input').fill(bucket);
  await page.getByTestId('profile-access-key').locator('input').fill(accessKeyId);
  await page.getByTestId('profile-secret-key').locator('input').fill(secretAccessKey);
  await page.getByTestId('profile-test').click();
  await expect(page.getByTestId('profile-test-result')).toBeVisible();
  await page.getByTestId('profile-save').click();
}

test('full flow against a local S3 server', async ({ manager: page, pageErrors }) => {
  const workDir = join(tmpdir(), `s3om-e2e-${Date.now()}`);
  mkdirSync(join(workDir, 'upload'), { recursive: true });
  const bigFile = join(workDir, 'upload', 'big.bin');
  const content = Buffer.alloc(FILE_SIZE);
  for (let i = 0; i < FILE_SIZE; i += 4096) content[i] = i % 251;
  writeFileSync(bigFile, content);

  await createVaultAndConnection(page);

  // Credentials are never stored in clear text.
  const stored = await page.evaluate(() => chrome.storage.local.get(null));
  expect(JSON.stringify(stored)).not.toContain(secretAccessKey);

  // Open the bucket.
  await page.getByTestId('profile-item-Local S3').click();
  await page.getByTestId('bucket-list').getByText(bucket).click();
  await expect(page.getByTestId('crumb-bucket')).toHaveText(bucket);

  // Create a folder and open it.
  await page.getByTestId('new-folder').click();
  await page.getByTestId('new-folder-name').locator('input').fill('docs');
  await page.getByTestId('new-folder-create').click();
  await page.getByTestId('entry-docs/').getByRole('button', { name: 'docs/' }).click();

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

  // Lock, then unlock again with the passphrase.
  await page.getByTestId('lock-now').click();
  await expect(page.getByTestId('vault-unlock')).toBeVisible();
  const session = await page.evaluate(() => chrome.storage.session.get(null));
  expect(Object.keys(session)).not.toContain('vaultKey');
  await page.getByTestId('vault-passphrase').locator('input').fill(PASSPHRASE);
  await page.getByTestId('vault-unlock').click();
  await expect(page.getByTestId('profile-item-Local S3')).toBeVisible();

  // No CSP violations or uncaught errors in the extension page.
  expect(pageErrors).toEqual([]);
});

test('uploads keep running after the upload panel is closed', async ({ manager: page }) => {
  const dir = join(tmpdir(), `s3om-e2e-many-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const files = Array.from({ length: 260 }, (_, i) => {
    const path = join(dir, `file-${String(i).padStart(3, '0')}.txt`);
    writeFileSync(path, `content ${i}\n`.repeat(50));
    return path;
  });

  await createVaultAndConnection(page);
  await page.getByTestId('profile-item-Local S3').click();
  await page.getByTestId('bucket-list').getByText(bucket).click();
  await page.getByTestId('new-folder').click();
  await page.getByTestId('new-folder-name').locator('input').fill('many');
  await page.getByTestId('new-folder-create').click();
  await page.getByTestId('entry-many/').getByRole('button', { name: 'many/' }).click();

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
