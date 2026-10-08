/**
 * Store screenshots (1280×800) in Vietnamese and English, written to docs/store/screenshots.
 * Uses sample data on the local S3 server only; no real endpoint ever appears.
 */
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { chromium, expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const endpoint = process.env.SCREENSHOT_S3_ENDPOINT ?? 'http://localhost:8333';
const identity = JSON.parse(
  readFileSync(new URL('../../docker/seaweedfs-s3.json', import.meta.url), 'utf8'),
) as { identities: { credentials: { accessKey: string; secretKey: string }[] }[] };
const keys = identity.identities[0]?.credentials[0];
const accessKeyId = keys?.accessKey ?? '';
const secretAccessKey = keys?.secretKey ?? '';
const extensionPath = fileURLToPath(new URL('../../.output/chrome-mv3-e2e', import.meta.url));
const outDir = fileURLToPath(new URL('../../docs/store/screenshots', import.meta.url));
const bucket = 'demo-library';
const MiB = 1024 * 1024;

const admin = new S3Client({
  endpoint,
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
  requestChecksumCalculation: 'WHEN_REQUIRED',
});

const demoObjects: Record<string, number> = {
  'bao-cao/bao-cao-quy-3.pdf': Math.round(2.4 * MiB),
  'bao-cao/so-lieu-2026.xlsx': Math.round(0.8 * MiB),
  'hinh-anh/anh-bia.jpg': Math.round(3.1 * MiB),
  'sao-luu/database-2026-10-01.sql.gz': 18 * MiB,
  'gioi-thieu-san-pham.mp4': 24 * MiB,
  'hop-dong-mau.docx': Math.round(0.2 * MiB),
  'ke-hoach-q4.md': 12_000,
};

async function emptyBucket() {
  const page = await admin.send(new ListObjectsV2Command({ Bucket: bucket }));
  const objects = (page.Contents ?? []).map((item) => ({ Key: item.Key }));
  if (objects.length) {
    await admin.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } }));
  }
}

test.beforeAll(async () => {
  await admin.send(new CreateBucketCommand({ Bucket: bucket })).catch(() => undefined);
  await emptyBucket();
  for (const [key, size] of Object.entries(demoObjects)) {
    await admin.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.alloc(size, 7) }),
    );
  }
});

test.afterAll(async () => {
  await emptyBucket();
  await admin.send(new DeleteBucketCommand({ Bucket: bucket }));
});

const copy = {
  vi: { profile: 'Kho tài liệu', theme: /sáng\/tối/ },
  en: { profile: 'Document storage', theme: /light\/dark/ },
} as const;

for (const lang of ['vi', 'en'] as const) {
  test(`screenshots (${lang})`, async () => {
    mkdirSync(outDir, { recursive: true });
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      locale: lang === 'vi' ? 'vi-VN' : 'en-US',
      viewport: { width: 1280, height: 800 },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        `--lang=${lang}`,
      ],
    });
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const page: Page = await context.newPage();
    await page.goto(`chrome-extension://${new URL(worker.url()).host}/manager.html`);
    const shot = async (name: string) => {
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(outDir, `${lang}-${name}.png`) });
    };

    await page.getByTestId('vault-passphrase').locator('input').fill('a long demo passphrase');
    await page
      .getByTestId('vault-passphrase-confirm')
      .locator('input')
      .fill('a long demo passphrase');
    await shot('1-passphrase');
    await page.getByTestId('vault-create').click();

    await page.getByTestId('profile-add').click();
    await page.getByTestId('profile-name').locator('input').fill(copy[lang].profile);
    await page.getByTestId('profile-endpoint').locator('input').fill(endpoint);
    await page.getByTestId('profile-access-key').locator('input').fill(accessKeyId);
    await page.getByTestId('profile-secret-key').locator('input').fill(secretAccessKey);
    await page.getByTestId('profile-test').click();
    await expect(page.getByTestId('profile-test-result')).toBeVisible();
    await shot('2-connection');
    await page.getByTestId('profile-save').click();

    await page.getByTestId(`profile-item-${copy[lang].profile}`).click();
    await page.getByTestId('bucket-open-by-name').click();
    await page.getByTestId('bucket-name-input').locator('input').fill(bucket);
    await page.getByTestId('bucket-name-input').locator('input').press('Enter');
    await expect(page.getByTestId('entry-hop-dong-mau.docx')).toBeVisible();
    await page.waitForTimeout(4000); // let the "saved" snackbar disappear
    await shot('3-browser');

    const uploadDir = join(tmpdir(), `s3om-shots-${lang}`);
    mkdirSync(uploadDir, { recursive: true });
    const files = ['bien-ban-hop.pdf', 'du-toan-2027.xlsx'].map((name) => {
      const path = join(uploadDir, name);
      writeFileSync(path, Buffer.alloc(3 * MiB, 1));
      return path;
    });
    await page.getByTestId('file-input').setInputFiles(files);
    await expect(page.getByTestId('upload-status-du-toan-2027.xlsx')).toHaveAttribute(
      'data-status',
      'done',
    );
    await shot('4-uploads');
    await page.getByTestId('upload-queue-close').click();

    await page.getByTestId('menu-gioi-thieu-san-pham.mp4').click();
    await page.getByTestId('action-share').click();
    await expect(page.getByTestId('share-url')).toBeVisible();
    await shot('5-share');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: copy[lang].theme }).click();
    await shot('6-dark');
    await context.close();
  });
}
