/**
 * Provider checks against a real S3-compatible endpoint, with the same client factory and
 * operations the extension uses. Skipped unless S3_TEST_ENDPOINT is set, e.g.:
 *
 *   S3_TEST_ENDPOINT=http://localhost:8333 pnpm test:integration
 *
 * Variables: S3_TEST_ENDPOINT, S3_TEST_ACCESS_KEY_ID, S3_TEST_SECRET_ACCESS_KEY,
 * S3_TEST_REGION (us-east-1), S3_TEST_ADDRESSING (path|virtual), S3_TEST_BUCKET (an existing
 * bucket; when unset a temporary one is created and removed). Keys default to the local
 * test identity in docker/seaweedfs-s3.json.
 */
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { FetchHttpHandler } from '@smithy/fetch-http-handler';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Addressing } from '@/core/profiles/profile.types';
import { collectKeys } from '@/core/s3/operations/list-keys';
import { copyObject, moveObject, transferPrefix } from '@/core/s3/operations/copy-object';
import { deleteFolders, deleteKeys } from '@/core/s3/operations/delete-objects';
import { presignGetObject } from '@/core/s3/operations/presign';
import { testConnection } from '@/core/s3/operations/test-connection';
import { createS3Client } from '@/core/s3/s3-client-factory';
import { listServerUploads, uploadFile, abortUpload } from '@/core/upload/multipart-uploader';
import { MiB } from '@/core/upload/part-planner';
import type { UploadState, UploadStateStore } from '@/core/upload/upload-state-store';
import { Semaphore } from '@/core/util/semaphore';

const endpoint = process.env.S3_TEST_ENDPOINT;
const localIdentity = JSON.parse(
  readFileSync(new URL('../../docker/seaweedfs-s3.json', import.meta.url), 'utf8'),
) as { identities: { credentials: { accessKey: string; secretKey: string }[] }[] };
const localKeys = localIdentity.identities[0]?.credentials[0];

function memoryStore(): UploadStateStore {
  const states = new Map<string, UploadState>();
  return {
    get: async (id) => states.get(id),
    put: async (state) => void states.set(state.id, structuredClone(state)),
    delete: async (id) => void states.delete(id),
    list: async () => [...states.values()],
  };
}

/** A File-like source with deterministic content, sliced lazily like a real File. */
function patternFile(size: number, name: string) {
  const content = new Uint8Array(size);
  for (let i = 0; i < size; i++) content[i] = (i * 31 + 7) % 251;
  return {
    name,
    size,
    lastModified: 1_700_000_000_000,
    type: 'application/octet-stream',
    content,
    slice: (start: number, end: number) => new Blob([content.slice(start, end)]),
  };
}

describe.skipIf(!endpoint)('S3 provider compatibility', () => {
  let client: S3Client;
  let bucket: string;
  let createdBucket = false;
  const run = `it-${Date.now()}`;

  beforeAll(async () => {
    client = createS3Client(
      {
        endpoint: endpoint ?? '',
        region: process.env.S3_TEST_REGION || 'us-east-1',
        addressing: (process.env.S3_TEST_ADDRESSING as Addressing | undefined) || 'path',
        accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID || localKeys?.accessKey || '',
        secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY || localKeys?.secretKey || '',
      },
      // Same HTTP stack as the browser build.
      { requestHandler: new FetchHttpHandler() },
    );
    bucket = process.env.S3_TEST_BUCKET || run;
    if (!process.env.S3_TEST_BUCKET) {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
      createdBucket = true;
    }
  });

  afterAll(async () => {
    if (!client) return;
    const leftovers = await collectKeys(client, bucket, `${run}/`);
    await deleteKeys(
      client,
      bucket,
      leftovers.map((k) => k.key),
    );
    if (createdBucket) await client.send(new DeleteBucketCommand({ Bucket: bucket }));
  });

  async function folderNames(prefix: string): Promise<string[]> {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: '/' }),
    );
    return (page.CommonPrefixes ?? []).flatMap((p) => (p.Prefix ? [p.Prefix] : []));
  }

  it('tests the connection', async () => {
    const result = await testConnection(client, bucket);
    expect(['listBuckets', 'defaultBucketOnly']).toContain(result.kind);
  });

  it('uploads a small object in one request', async () => {
    const file = patternFile(1000, 'small.bin');
    await uploadFile(
      client,
      file,
      { profileId: 't', bucket, key: `${run}/small.bin` },
      {
        store: memoryStore(),
        limiter: new Semaphore(4),
      },
    );
    const head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: `${run}/small.bin` }),
    );
    expect(head.ContentLength).toBe(1000);
  });

  it('resumes an interrupted multipart upload and only sends missing parts', async () => {
    const file = patternFile(40 * MiB + 123, 'big.bin'); // 6 parts of 8 MiB
    const target = { profileId: 't', bucket, key: `${run}/big.bin` };
    const store = memoryStore();
    const controller = new AbortController();
    let partsDone = 0;
    await expect(
      uploadFile(client, file, target, {
        store,
        limiter: new Semaphore(1),
        signal: controller.signal,
        onProgress: () => {
          partsDone++;
          if (partsDone === 3) controller.abort(); // initial progress call + 2 parts
        },
      }),
    ).rejects.toThrow();
    const [saved] = await store.list();
    expect(saved?.parts.length).toBe(2);
    expect((await listServerUploads(client, bucket)).map((u) => u.uploadId)).toContain(
      saved?.uploadId,
    );

    const outcome = await uploadFile(client, file, target, { store, limiter: new Semaphore(4) });
    expect(outcome.resumedParts).toBe(2);
    expect(await store.list()).toEqual([]);

    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: target.key }));
    const bytes = await object.Body?.transformToByteArray();
    expect(bytes?.length).toBe(file.size);
    expect(Buffer.from(bytes ?? []).equals(Buffer.from(file.content))).toBe(true);
  });

  it('cancels a multipart upload on the server', async () => {
    const file = patternFile(20 * MiB, 'cancel.bin');
    const target = { profileId: 't', bucket, key: `${run}/cancel.bin` };
    const store = memoryStore();
    const controller = new AbortController();
    await expect(
      uploadFile(client, file, target, {
        store,
        limiter: new Semaphore(1),
        signal: controller.signal,
        onProgress: (bytes) => {
          if (bytes > 0) controller.abort();
        },
      }),
    ).rejects.toThrow();
    const [saved] = await store.list();
    expect(saved).toBeDefined();
    if (!saved) return;
    await abortUpload(client, saved, store);
    expect((await listServerUploads(client, bucket)).map((u) => u.uploadId)).not.toContain(
      saved.uploadId,
    );
  });

  it('presigns a link that works without credentials', async () => {
    const { url } = await presignGetObject(client, bucket, `${run}/small.bin`, 3600);
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBe(1000);
  });

  it('copies, renames and handles keys with Vietnamese characters and spaces', async () => {
    const key = `${run}/thư mục/tệp có dấu + khoảng trắng.txt`;
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'xin chào' }));
    await copyObject(client, { bucket, key }, { bucket, key: `${run}/copy.txt` });
    await moveObject(
      client,
      { bucket, key: `${run}/copy.txt` },
      { bucket, key: `${run}/moved.txt` },
    );
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: `${run}/` }),
    );
    const keys = (listed.Contents ?? []).map((c) => c.Key);
    expect(keys).toContain(key);
    expect(keys).toContain(`${run}/moved.txt`);
    expect(keys).not.toContain(`${run}/copy.txt`);
  });

  it('renames a folder object by object', async () => {
    for (const name of ['a.txt', 'b.txt', 'sub/c.txt']) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: `${run}/folder/${name}`, Body: name }),
      );
    }
    const result = await transferPrefix(
      client,
      bucket,
      `${run}/folder/`,
      `${run}/renamed/`,
      'move',
    );
    expect(result.remaining).toEqual([]);
    const keys = (await collectKeys(client, bucket, `${run}/renamed/`)).map((k) => k.key).sort();
    expect(keys).toEqual([
      `${run}/renamed/a.txt`,
      `${run}/renamed/b.txt`,
      `${run}/renamed/sub/c.txt`,
    ]);
    expect(await collectKeys(client, bucket, `${run}/folder/`)).toEqual([]);
    expect(await folderNames(`${run}/`)).not.toContain(`${run}/folder/`);
  });

  it('deletes a folder so that it no longer shows up in the listing', async () => {
    const keys = [`${run}/gone/`, `${run}/gone/a.txt`, `${run}/gone/sub/b.txt`];
    for (const key of keys) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: key }));
    }
    const result = await deleteFolders(client, bucket, [`${run}/gone/`], keys);
    expect(result).toEqual({ deleted: 3, failures: [] });
    expect(await folderNames(`${run}/`)).not.toContain(`${run}/gone/`);
  });

  it('never deletes objects under a folder key that is deleted on its own', async () => {
    const keys = [`${run}/keep/`, `${run}/keep/a.txt`, `${run}/keep/sub/b.txt`];
    for (const key of keys) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: key }));
    }
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: `${run}/keep/` }));
    const left = (await collectKeys(client, bucket, `${run}/keep/`)).map((k) => k.key).sort();
    expect(left).toEqual([`${run}/keep/a.txt`, `${run}/keep/sub/b.txt`]);
  });

  it('deletes a batch with DeleteObjects (Content-MD5)', async () => {
    const keys = [1, 2, 3].map((i) => `${run}/batch/${i}.txt`);
    for (const key of keys) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: key }));
    }
    const result = await deleteKeys(client, bucket, keys);
    expect(result).toEqual({ deleted: 3, failures: [] });
    expect(await collectKeys(client, bucket, `${run}/batch/`)).toEqual([]);
  });
});
