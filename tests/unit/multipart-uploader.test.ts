import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { MiB } from '@/core/upload/part-planner';
import { abortUpload, uploadFile, type UploadSource } from '@/core/upload/multipart-uploader';
import {
  createIndexedDbUploadStateStore,
  uploadStateId,
  type UploadState,
  type UploadStateStore,
} from '@/core/upload/upload-state-store';
import { Semaphore } from '@/core/util/semaphore';
import { fakeS3Client, s3Error } from '../support/fake-s3-client';

const target = { profileId: 'p1', bucket: 'bucket', key: 'big.bin' };
const fastRetry = { retries: 3, baseDelayMs: 1 };

/** A file of `size` bytes that never materialises its content. */
function fakeFile(size: number, name = 'big.bin'): UploadSource & { slices: number } {
  const source = {
    name,
    size,
    lastModified: 1_700_000_000_000,
    type: 'application/octet-stream',
    slices: 0,
    slice(start: number, end: number) {
      source.slices++;
      return new Blob([new Uint8Array(end - start)]);
    },
  };
  return source;
}

/** In-memory store that records every saved snapshot. */
function recordingStore(): UploadStateStore & { snapshots: UploadState[] } {
  const states = new Map<string, UploadState>();
  const snapshots: UploadState[] = [];
  return {
    snapshots,
    async get(id) {
      return states.get(id);
    },
    async put(state) {
      snapshots.push(structuredClone(state));
      states.set(state.id, structuredClone(state));
    },
    async delete(id) {
      states.delete(id);
    },
    async list() {
      return [...states.values()];
    },
  };
}

function multipartHandlers(
  overrides: Record<string, (input: Record<string, unknown>, i: number) => unknown> = {},
) {
  return {
    CreateMultipartUploadCommand: () => ({ UploadId: 'upload-1' }),
    UploadPartCommand: (input: Record<string, unknown>) => ({
      ETag: `"etag-${String(input.PartNumber)}"`,
    }),
    CompleteMultipartUploadCommand: () => ({ ETag: '"final-etag-3"' }),
    ...overrides,
  };
}

describe('multipart-uploader', () => {
  it('retries a failing part and completes; progress is saved after every part', async () => {
    const file = fakeFile(20 * MiB); // 3 parts of 8 MiB
    let part3Failures = 0;
    const { client, calls } = fakeS3Client(
      multipartHandlers({
        UploadPartCommand: (input) => {
          if (input.PartNumber === 3 && part3Failures < 2) {
            part3Failures++;
            throw s3Error('InternalError', 500);
          }
          return { ETag: `"etag-${String(input.PartNumber)}"` };
        },
      }),
    );
    const store = recordingStore();
    const outcome = await uploadFile(client, file, target, {
      store,
      limiter: new Semaphore(1),
      retry: fastRetry,
    });

    expect(outcome.etag).toBe('"final-etag-3"');
    expect(part3Failures).toBe(2);
    expect(calls.filter((c) => c.command === 'UploadPartCommand')).toHaveLength(5);
    const complete = calls.find((c) => c.command === 'CompleteMultipartUploadCommand');
    expect(complete?.input.MultipartUpload).toEqual({
      Parts: [
        { PartNumber: 1, ETag: '"etag-1"' },
        { PartNumber: 2, ETag: '"etag-2"' },
        { PartNumber: 3, ETag: '"etag-3"' },
      ],
    });
    // Initial state + one save per part, each with one more part than the last.
    expect(store.snapshots.map((s) => s.parts.length)).toEqual([0, 1, 2, 3]);
    expect(await store.list()).toEqual([]);
  });

  it('does not retry auth errors and keeps the saved state for a later resume', async () => {
    const file = fakeFile(20 * MiB);
    const { client, calls } = fakeS3Client(
      multipartHandlers({
        UploadPartCommand: (input) => {
          if (input.PartNumber === 2) throw s3Error('AccessDenied', 403);
          return { ETag: `"etag-${String(input.PartNumber)}"` };
        },
      }),
    );
    const store = recordingStore();
    await expect(
      uploadFile(client, file, target, { store, limiter: new Semaphore(1), retry: fastRetry }),
    ).rejects.toMatchObject({ name: 'AccessDenied' });
    expect(calls.filter((c) => c.command === 'UploadPartCommand')).toHaveLength(2);
    const saved = await store.list();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.parts).toEqual([{ PartNumber: 1, ETag: '"etag-1"' }]);
  });

  it('resumes from parts the server confirms and only sends the missing ones', async () => {
    const file = fakeFile(20 * MiB);
    const store = recordingStore();
    const id = uploadStateId(target, file);
    await store.put({
      ...target,
      id,
      file: { name: file.name, size: file.size, lastModified: file.lastModified },
      uploadId: 'upload-1',
      partSize: 8 * MiB,
      parts: [{ PartNumber: 1, ETag: '"etag-1"' }],
      createdAt: 1,
      updatedAt: 1,
    });
    const { client, calls } = fakeS3Client(
      multipartHandlers({
        // The server has parts 1 and 2 (part 2 finished after the last local save).
        ListPartsCommand: () => ({
          Parts: [
            { PartNumber: 1, ETag: '"etag-1"', Size: 8 * MiB },
            { PartNumber: 2, ETag: '"etag-2"', Size: 8 * MiB },
          ],
          IsTruncated: false,
        }),
      }),
    );
    const outcome = await uploadFile(client, file, target, {
      store,
      limiter: new Semaphore(2),
      retry: fastRetry,
    });
    expect(outcome.resumedParts).toBe(2);
    expect(calls.some((c) => c.command === 'CreateMultipartUploadCommand')).toBe(false);
    const sent = calls
      .filter((c) => c.command === 'UploadPartCommand')
      .map((c) => c.input.PartNumber);
    expect(sent).toEqual([3]);
    expect(file.slices).toBe(1);
  });

  it('starts over when the server no longer knows the saved upload', async () => {
    const file = fakeFile(20 * MiB);
    const store = recordingStore();
    await store.put({
      ...target,
      id: uploadStateId(target, file),
      file: { name: file.name, size: file.size, lastModified: file.lastModified },
      uploadId: 'expired',
      partSize: 8 * MiB,
      parts: [{ PartNumber: 1, ETag: '"x"' }],
      createdAt: 1,
      updatedAt: 1,
    });
    const { client, calls } = fakeS3Client(
      multipartHandlers({
        ListPartsCommand: () => {
          throw s3Error('NoSuchUpload', 404);
        },
      }),
    );
    await uploadFile(client, file, target, { store, limiter: new Semaphore(4), retry: fastRetry });
    expect(calls.filter((c) => c.command === 'UploadPartCommand')).toHaveLength(3);
    expect(calls.some((c) => c.command === 'CreateMultipartUploadCommand')).toBe(true);
  });

  it('treats a retried Complete that finds the upload gone as done when the object is there', async () => {
    const file = fakeFile(20 * MiB);
    const { client } = fakeS3Client(
      multipartHandlers({
        CompleteMultipartUploadCommand: (_input, i) => {
          // First attempt: completed on the server but the response was lost.
          if (i === 0) throw s3Error('InternalError', 500);
          throw s3Error('NoSuchUpload', 404);
        },
        HeadObjectCommand: () => ({ ContentLength: 20 * MiB, ETag: '"done-3"' }),
      }),
    );
    const outcome = await uploadFile(client, file, target, {
      store: recordingStore(),
      limiter: new Semaphore(2),
      retry: fastRetry,
    });
    expect(outcome.etag).toBe('"done-3"');
  });

  it('uses one PutObject for small files', async () => {
    const file = fakeFile(MiB, 'small.txt');
    const { client, calls } = fakeS3Client({ PutObjectCommand: () => ({ ETag: '"small"' }) });
    const outcome = await uploadFile(
      client,
      file,
      { ...target, key: 'small.txt' },
      {
        store: recordingStore(),
        limiter: new Semaphore(4),
      },
    );
    expect(outcome.etag).toBe('"small"');
    expect(calls.map((c) => c.command)).toEqual(['PutObjectCommand']);
  });

  it('keeps at most `limit` parts in flight', async () => {
    const file = fakeFile(80 * MiB); // 10 parts
    let inFlight = 0;
    let peak = 0;
    const { client } = fakeS3Client(
      multipartHandlers({
        UploadPartCommand: async (input) => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 2));
          inFlight--;
          return { ETag: `"etag-${String(input.PartNumber)}"` };
        },
      }),
    );
    await uploadFile(client, file, target, { store: recordingStore(), limiter: new Semaphore(4) });
    expect(peak).toBe(4);
  });

  it('abort removes the server upload and the saved state', async () => {
    const store = createIndexedDbUploadStateStore();
    const state: UploadState = {
      ...target,
      id: 'state-1',
      file: { name: 'a', size: 1, lastModified: 1 },
      uploadId: 'upload-9',
      partSize: 8 * MiB,
      parts: [],
      createdAt: 1,
      updatedAt: 1,
    };
    await store.put(state);
    const { client, calls } = fakeS3Client({ AbortMultipartUploadCommand: () => ({}) });
    await abortUpload(client, state, store);
    expect(calls[0]?.input).toMatchObject({ UploadId: 'upload-9', Key: 'big.bin' });
    expect(await store.get('state-1')).toBeUndefined();
  });
});
