import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListPartsCommand,
  PutObjectCommand,
  UploadPartCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { httpStatusOf, s3ErrorCode } from '@/core/s3/s3-error';
import { linkedAbortController, runAllOrAbort } from '@/core/util/abort';
import type { Semaphore } from '@/core/util/semaphore';
import { partRange, planUpload } from './part-planner';
import { DEFAULT_RETRY, withRetry, type RetryOptions } from './retry';
import {
  uploadStateId,
  type FileFingerprint,
  type UploadedPart,
  type UploadState,
  type UploadStateStore,
  type UploadTarget,
} from './upload-state-store';

/** What the uploader needs from a `File`: its fingerprint and lazy byte ranges. */
export interface UploadSource extends FileFingerprint {
  type?: string;
  slice(start: number, end: number): Blob;
}

export interface UploadFileOptions {
  store: UploadStateStore;
  /** Shared limit on in-flight requests; each holds at most one part in memory. */
  limiter: Semaphore;
  signal?: AbortSignal;
  retry?: Omit<RetryOptions, 'signal'>;
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}

export interface UploadOutcome {
  etag?: string;
  /** Parts already on the server when the upload started (resumed upload). */
  resumedParts: number;
}

export class FileTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`File is larger than ${maxBytes} bytes`);
    this.name = 'FileTooLargeError';
  }
}

function fingerprint(source: UploadSource): FileFingerprint {
  return { name: source.name, size: source.size, lastModified: source.lastModified };
}

function isMissingUpload(error: unknown): boolean {
  return s3ErrorCode(error) === 'NoSuchUpload' || httpStatusOf(error) === 404;
}

/** Every part the server already holds for `uploadId`, following `ListParts` pagination. */
export async function listUploadedParts(
  client: S3Client,
  target: Pick<UploadTarget, 'bucket' | 'key'>,
  uploadId: string,
  signal?: AbortSignal,
): Promise<Array<UploadedPart & { Size: number }>> {
  const parts: Array<UploadedPart & { Size: number }> = [];
  let marker: string | undefined;
  for (;;) {
    const page = await client.send(
      new ListPartsCommand({
        Bucket: target.bucket,
        Key: target.key,
        UploadId: uploadId,
        PartNumberMarker: marker,
      }),
      { abortSignal: signal },
    );
    for (const part of page.Parts ?? []) {
      if (part.PartNumber !== undefined && part.ETag !== undefined) {
        parts.push({ PartNumber: part.PartNumber, ETag: part.ETag, Size: part.Size ?? 0 });
      }
    }
    if (!page.IsTruncated || page.NextPartNumberMarker === undefined) return parts;
    marker = page.NextPartNumberMarker;
  }
}

/**
 * Finds a saved upload for this exact file and target and checks it against the server.
 * Only parts the server reports with the expected size count as done.
 */
async function resumeOrCreate(
  client: S3Client,
  source: UploadSource,
  target: UploadTarget,
  partSize: number,
  options: UploadFileOptions,
): Promise<UploadState> {
  const id = uploadStateId(target, fingerprint(source));
  const saved = await options.store.get(id);
  if (saved && saved.partSize === partSize) {
    try {
      const serverParts = await listUploadedParts(client, target, saved.uploadId, options.signal);
      const parts = serverParts
        .filter((part) => {
          const { start, end } = partRange(part.PartNumber, partSize, source.size);
          return part.Size === end - start;
        })
        .map(({ PartNumber, ETag }) => ({ PartNumber, ETag }));
      const state = { ...saved, parts, updatedAt: Date.now() };
      await options.store.put(state);
      return state;
    } catch (error) {
      if (!isMissingUpload(error)) throw error;
      await options.store.delete(id);
    }
  }
  const created = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: target.bucket,
      Key: target.key,
      ContentType: source.type || undefined,
    }),
    { abortSignal: options.signal },
  );
  if (!created.UploadId) throw new Error('Server returned no UploadId');
  const now = Date.now();
  const state: UploadState = {
    ...target,
    id,
    file: fingerprint(source),
    uploadId: created.UploadId,
    partSize,
    parts: [],
    createdAt: now,
    updatedAt: now,
  };
  await options.store.put(state);
  return state;
}

async function uploadMultipart(
  client: S3Client,
  source: UploadSource,
  target: UploadTarget,
  plan: { partSize: number; partCount: number },
  options: UploadFileOptions,
): Promise<UploadOutcome> {
  const state = await resumeOrCreate(client, source, target, plan.partSize, options);
  const resumedParts = state.parts.length;
  const done = new Map(state.parts.map((part) => [part.PartNumber, part]));
  const partBytes = (partNumber: number) => {
    const { start, end } = partRange(partNumber, plan.partSize, source.size);
    return end - start;
  };
  let uploadedBytes = [...done.keys()].reduce((sum, n) => sum + partBytes(n), 0);
  options.onProgress?.(uploadedBytes, source.size);

  // Saves are chained so the stored part list only ever grows, in order.
  let saving = Promise.resolve();
  const saveProgress = () => {
    const snapshot: UploadState = { ...state, parts: [...done.values()], updatedAt: Date.now() };
    saving = saving.then(() => options.store.put(snapshot));
    return saving;
  };

  const controller = linkedAbortController(options.signal);
  const signal = controller.signal;
  const missing = Array.from({ length: plan.partCount }, (_, i) => i + 1).filter(
    (partNumber) => !done.has(partNumber),
  );
  await runAllOrAbort(
    controller,
    options.limiter,
    missing.map((partNumber) => async () => {
      const { start, end } = partRange(partNumber, plan.partSize, source.size);
      const response = await withRetry(
        () =>
          client.send(
            new UploadPartCommand({
              Bucket: target.bucket,
              Key: target.key,
              UploadId: state.uploadId,
              PartNumber: partNumber,
              // Read only this part, right before sending it.
              Body: source.slice(start, end),
              ContentLength: end - start,
            }),
            { abortSignal: signal },
          ),
        { ...(options.retry ?? DEFAULT_RETRY), signal },
      );
      if (!response.ETag) throw new Error(`Server returned no ETag for part ${partNumber}`);
      done.set(partNumber, { PartNumber: partNumber, ETag: response.ETag });
      uploadedBytes += end - start;
      options.onProgress?.(uploadedBytes, source.size);
      await saveProgress();
    }),
  );
  await saving;

  let attempt = 0;
  const completed = await withRetry(
    async () => {
      attempt++;
      try {
        return await client.send(
          new CompleteMultipartUploadCommand({
            Bucket: target.bucket,
            Key: target.key,
            UploadId: state.uploadId,
            MultipartUpload: {
              Parts: [...done.values()].sort((a, b) => a.PartNumber - b.PartNumber),
            },
          }),
          { abortSignal: options.signal },
        );
      } catch (error) {
        // A retried Complete whose first attempt succeeded (response lost) finds the upload
        // gone: the object is there if it has the expected size.
        if (attempt > 1 && isMissingUpload(error)) {
          const head = await client.send(
            new HeadObjectCommand({ Bucket: target.bucket, Key: target.key }),
          );
          if (head.ContentLength === source.size) return { ETag: head.ETag };
        }
        throw error;
      }
    },
    { ...(options.retry ?? DEFAULT_RETRY), signal: options.signal },
  );
  await options.store.delete(state.id);
  return { etag: completed.ETag, resumedParts };
}

/**
 * Uploads one file: a single `PutObject` up to 16 MiB, resumable multipart above that.
 * When `signal` aborts, the saved multipart state is kept so the upload can be resumed.
 */
export async function uploadFile(
  client: S3Client,
  source: UploadSource,
  target: UploadTarget,
  options: UploadFileOptions,
): Promise<UploadOutcome> {
  const plan = planUpload(source.size);
  if (plan.kind === 'tooLarge') throw new FileTooLargeError(plan.maxBytes);
  if (plan.kind === 'multipart') return uploadMultipart(client, source, target, plan, options);

  const response = await options.limiter.run(() =>
    withRetry(
      () =>
        client.send(
          new PutObjectCommand({
            Bucket: target.bucket,
            Key: target.key,
            Body: source.slice(0, source.size),
            ContentLength: source.size,
            ContentType: source.type || undefined,
          }),
          { abortSignal: options.signal },
        ),
      { ...(options.retry ?? DEFAULT_RETRY), signal: options.signal },
    ),
  );
  options.onProgress?.(source.size, source.size);
  return { etag: response.ETag, resumedParts: 0 };
}

/** Cancels for good: tells the server to drop the parts and forgets the saved state. */
export async function abortUpload(
  client: S3Client,
  upload: { bucket: string; key: string; uploadId: string; id?: string },
  store: UploadStateStore,
): Promise<void> {
  try {
    await client.send(
      new AbortMultipartUploadCommand({
        Bucket: upload.bucket,
        Key: upload.key,
        UploadId: upload.uploadId,
      }),
    );
  } catch (error) {
    if (!isMissingUpload(error)) throw error;
  }
  if (upload.id) await store.delete(upload.id);
  else {
    const saved = (await store.list()).find((state) => state.uploadId === upload.uploadId);
    if (saved) await store.delete(saved.id);
  }
}

export interface ServerUpload {
  key: string;
  uploadId: string;
  initiated?: Date;
}

/** Unfinished multipart uploads on the server; many providers bill their stored parts. */
export async function listServerUploads(client: S3Client, bucket: string): Promise<ServerUpload[]> {
  const uploads: ServerUpload[] = [];
  let keyMarker: string | undefined;
  let uploadIdMarker: string | undefined;
  for (;;) {
    const page = await client.send(
      new ListMultipartUploadsCommand({
        Bucket: bucket,
        KeyMarker: keyMarker,
        UploadIdMarker: uploadIdMarker,
      }),
    );
    for (const upload of page.Uploads ?? []) {
      if (upload.Key !== undefined && upload.UploadId !== undefined) {
        uploads.push({ key: upload.Key, uploadId: upload.UploadId, initiated: upload.Initiated });
      }
    }
    // Stop on a truncated page without markers instead of asking for the same page forever.
    if (!page.IsTruncated || (!page.NextKeyMarker && !page.NextUploadIdMarker)) return uploads;
    keyMarker = page.NextKeyMarker;
    uploadIdMarker = page.NextUploadIdMarker;
  }
}
