/**
 * The S3 server the e2e suite runs against, plus helpers shared by the specs.
 * Defaults to the local SeaweedFS container (docker compose up); any other S3-compatible
 * server works through E2E_S3_ENDPOINT / E2E_S3_ACCESS_KEY_ID / E2E_S3_SECRET_ACCESS_KEY.
 */
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect } from './fixtures';

interface Identity {
  name: string;
  credentials: { accessKey: string; secretKey: string }[];
}
const fixture = JSON.parse(
  readFileSync(new URL('../../docker/seaweedfs-s3.json', import.meta.url), 'utf8'),
) as { identities: Identity[] };
const fixtureKeys = (name: string) =>
  fixture.identities.find((identity) => identity.name === name)?.credentials[0];

export const endpoint = process.env.E2E_S3_ENDPOINT ?? 'http://localhost:8333';
export const region = process.env.E2E_S3_REGION ?? 'us-east-1';
export const accessKeyId =
  process.env.E2E_S3_ACCESS_KEY_ID ?? fixtureKeys('local-test')?.accessKey ?? '';
export const secretAccessKey =
  process.env.E2E_S3_SECRET_ACCESS_KEY ?? fixtureKeys('local-test')?.secretKey ?? '';

/**
 * A key limited to one bucket. The SeaweedFS fixture has one for bucket `e2e-scoped`; other
 * servers supply their own through E2E_S3_SCOPED_* or skip the scenarios that need it.
 */
export const scoped = process.env.E2E_S3_ENDPOINT
  ? process.env.E2E_S3_SCOPED_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.E2E_S3_SCOPED_ACCESS_KEY_ID,
        secretAccessKey: process.env.E2E_S3_SCOPED_SECRET_ACCESS_KEY ?? '',
        bucket: process.env.E2E_S3_SCOPED_BUCKET ?? '',
      }
    : undefined
  : {
      accessKeyId: fixtureKeys('scoped-test')?.accessKey ?? '',
      secretAccessKey: fixtureKeys('scoped-test')?.secretKey ?? '',
      bucket: 'e2e-scoped',
    };

export const admin = new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
  requestChecksumCalculation: 'WHEN_REQUIRED',
});

export async function createBucket(bucket: string): Promise<void> {
  await admin.send(new CreateBucketCommand({ Bucket: bucket }));
}

/** Deletes every object (all pages), then the bucket unless `keepBucket` is set. */
export async function removeBucket(bucket: string, keepBucket = false): Promise<void> {
  for (;;) {
    const page = await admin.send(new ListObjectsV2Command({ Bucket: bucket }));
    const objects = (page.Contents ?? []).map((item) => ({ Key: item.Key }));
    if (objects.length === 0) break;
    await admin.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } }));
  }
  if (!keepBucket) await admin.send(new DeleteBucketCommand({ Bucket: bucket }));
}

/** Uploads small objects, a few at a time. */
export async function putObjects(
  bucket: string,
  objects: Record<string, string | Buffer>,
  extra: { ContentType?: string; Metadata?: Record<string, string> } = {},
): Promise<void> {
  const entries = Object.entries(objects);
  for (let i = 0; i < entries.length; i += 16) {
    await Promise.all(
      entries
        .slice(i, i + 16)
        .map(([Key, Body]) =>
          admin.send(new PutObjectCommand({ Bucket: bucket, Key, Body, ...extra })),
        ),
    );
  }
}

export async function listKeys(bucket: string, prefix = ''): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await admin.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    keys.push(...(page.Contents ?? []).flatMap((item) => (item.Key ? [item.Key] : [])));
    token = page.NextContinuationToken;
  } while (token);
  return keys.sort();
}

export interface ConnectionInput {
  name: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

/** Fills the connection form and runs "Test connection" (host access is pre-granted). */
export async function fillConnection(page: Page, input: ConnectionInput): Promise<void> {
  await page.getByTestId('profile-add').click();
  await page.getByTestId('profile-name').locator('input').fill(input.name);
  await page.getByTestId('profile-endpoint').locator('input').fill(endpoint);
  if (process.env.E2E_S3_REGION) {
    await page.getByTestId('profile-region').locator('input').fill(region);
  }
  if (input.bucket) {
    await page.getByTestId('profile-default-bucket').locator('input').fill(input.bucket);
  }
  await page
    .getByTestId('profile-access-key')
    .locator('input')
    .fill(input.accessKeyId ?? accessKeyId);
  await page
    .getByTestId('profile-secret-key')
    .locator('input')
    .fill(input.secretAccessKey ?? secretAccessKey);
  await page.getByTestId('profile-test').click();
}

/** Adds a tested connection and opens it. */
export async function addConnection(page: Page, input: ConnectionInput): Promise<void> {
  await fillConnection(page, input);
  await expect(page.getByTestId('profile-test-result')).toBeVisible();
  await page.getByTestId('profile-save').click();
  await page.getByTestId(`profile-item-${input.name}`).click();
}

/** Opens a bucket from the bucket list of the active connection. */
export async function openBucket(page: Page, bucket: string): Promise<void> {
  await page.getByTestId('bucket-list').getByText(bucket, { exact: true }).click();
  await expect(page.getByTestId('crumb-bucket')).toHaveText(bucket);
}

/** Opens a folder of the current listing. */
export async function openFolder(page: Page, name: string): Promise<void> {
  await page.getByTestId(`entry-${name}`).getByRole('button', { name }).click();
}

/** Picks an action from the "more actions" menu of a listed entry. */
export async function entryAction(page: Page, name: string, action: string): Promise<void> {
  await page.getByTestId(`menu-${name}`).click();
  // Menus opened earlier stay in the DOM, hidden; only the open one is clickable.
  await page.locator('.v-overlay--active').getByTestId(`action-${action}`).click();
}
