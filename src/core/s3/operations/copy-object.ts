import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  UploadPartCopyCommand,
  type CompletedPart,
  type S3Client,
} from '@aws-sdk/client-s3';
import { GiB, partRange, planMultipart } from '@/core/upload/part-planner';
import { DEFAULT_RETRY, withRetry } from '@/core/upload/retry';
import { linkedAbortController, runAllOrAbort } from '@/core/util/abort';
import { Semaphore } from '@/core/util/semaphore';
import { removeFolderEntries } from './delete-objects';
import { listKeyPages } from './list-keys';

/** `CopyObject` handles sources up to 5 GiB; larger ones need `UploadPartCopy`. */
export const MAX_SINGLE_COPY_BYTES = 5 * GiB;
const PART_COPY_CONCURRENCY = 4;

export interface ObjectLocation {
  bucket: string;
  key: string;
}

export interface CopyOptions {
  signal?: AbortSignal;
  /** Source size if already known (saves a `HeadObject` for small objects). */
  size?: number;
  onPartCopied?: (copiedBytes: number, totalBytes: number) => void;
}

/** `CopySource` is `bucket/key`, URL-encoded per path segment. */
export function copySourceOf({ bucket, key }: ObjectLocation): string {
  return `${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export function chooseCopyStrategy(size: number): 'single' | 'multipart' {
  return size > MAX_SINGLE_COPY_BYTES ? 'multipart' : 'single';
}

async function multipartCopy(
  client: S3Client,
  source: ObjectLocation,
  target: ObjectLocation,
  options: CopyOptions,
): Promise<void> {
  const head = await client.send(
    new HeadObjectCommand({ Bucket: source.bucket, Key: source.key }),
    {
      abortSignal: options.signal,
    },
  );
  const size = head.ContentLength ?? options.size ?? 0;
  const plan = planMultipart(size);
  if (plan.kind !== 'multipart') throw new Error('Object too large to copy in 10,000 parts');

  const { UploadId } = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: target.bucket,
      Key: target.key,
      ContentType: head.ContentType,
      ContentDisposition: head.ContentDisposition,
      ContentEncoding: head.ContentEncoding,
      ContentLanguage: head.ContentLanguage,
      CacheControl: head.CacheControl,
      Metadata: head.Metadata,
    }),
    { abortSignal: options.signal },
  );
  if (!UploadId) throw new Error('Server returned no UploadId');

  const limiter = new Semaphore(PART_COPY_CONCURRENCY);
  const controller = linkedAbortController(options.signal);
  const signal = controller.signal;
  const parts: CompletedPart[] = [];
  let copied = 0;
  try {
    await runAllOrAbort(
      controller,
      limiter,
      Array.from({ length: plan.partCount }, (_, index) => async () => {
        const partNumber = index + 1;
        const { start, end } = partRange(partNumber, plan.partSize, size);
        const response = await withRetry(
          () =>
            client.send(
              new UploadPartCopyCommand({
                Bucket: target.bucket,
                Key: target.key,
                UploadId,
                PartNumber: partNumber,
                CopySource: copySourceOf(source),
                CopySourceRange: `bytes=${start}-${end - 1}`,
              }),
              { abortSignal: signal },
            ),
          { ...DEFAULT_RETRY, signal },
        );
        parts.push({ PartNumber: partNumber, ETag: response.CopyPartResult?.ETag });
        copied += end - start;
        options.onPartCopied?.(copied, size);
      }),
    );
    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: target.bucket,
        Key: target.key,
        UploadId,
        MultipartUpload: {
          Parts: parts.sort((a, b) => (a.PartNumber ?? 0) - (b.PartNumber ?? 0)),
        },
      }),
    );
  } catch (error) {
    await client
      .send(new AbortMultipartUploadCommand({ Bucket: target.bucket, Key: target.key, UploadId }))
      .catch(() => undefined);
    throw error;
  }
}

/** Server-side copy; metadata is kept (`MetadataDirective` defaults to COPY). */
export async function copyObject(
  client: S3Client,
  source: ObjectLocation,
  target: ObjectLocation,
  options: CopyOptions = {},
): Promise<void> {
  let size = options.size;
  if (size === undefined) {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: source.bucket, Key: source.key }),
      {
        abortSignal: options.signal,
      },
    );
    size = head.ContentLength ?? 0;
  }
  if (chooseCopyStrategy(size) === 'multipart') {
    await multipartCopy(client, source, target, { ...options, size });
    return;
  }
  await client.send(
    new CopyObjectCommand({
      Bucket: target.bucket,
      Key: target.key,
      CopySource: copySourceOf(source),
    }),
    { abortSignal: options.signal },
  );
}

/** Rename/move = copy, then delete the source. The source is never deleted if the copy failed. */
export async function moveObject(
  client: S3Client,
  source: ObjectLocation,
  target: ObjectLocation,
  options: CopyOptions = {},
): Promise<void> {
  await copyObject(client, source, target, options);
  await client.send(new DeleteObjectCommand({ Bucket: source.bucket, Key: source.key }), {
    abortSignal: options.signal,
  });
}

/**
 * Thrown before anything is copied when a target key of a folder transfer is also one of its
 * source keys (e.g. moving `a/b/` up to `a/` while `a/b/b/x` and `a/b/x` both exist): the
 * transfer would overwrite sources it has not processed yet.
 */
export class OverlappingTransferError extends Error {
  constructor(readonly keys: string[]) {
    super(`${keys.length} target keys are also source keys`);
    this.name = 'OverlappingTransferError';
  }
}

/** Source keys whose transfer target is itself another source key. */
export function overlappingTargets(
  sourcePrefix: string,
  targetPrefix: string,
  sourceKeys: readonly string[],
): string[] {
  const sources = new Set(sourceKeys);
  return sourceKeys
    .map((key) => targetPrefix + key.slice(sourcePrefix.length))
    .filter((target) => sources.has(target));
}

export interface PrefixTransferResult {
  done: string[];
  /** Source keys not yet transferred when the run stopped (error or cancel). */
  remaining: string[];
  error?: unknown;
}

/**
 * Copies or moves every object under `sourcePrefix` to `targetPrefix`, one object at a time.
 * Not atomic: if it stops half way, objects exist in both places and `remaining` lists what
 * is left so the user can run it again or clean up.
 */
export async function transferPrefix(
  client: S3Client,
  bucket: string,
  sourcePrefix: string,
  targetPrefix: string,
  mode: 'copy' | 'move',
  options: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<PrefixTransferResult> {
  const keys: { key: string; size: number }[] = [];
  for await (const page of listKeyPages(client, bucket, sourcePrefix, options.signal)) {
    keys.push(...page);
  }
  const overlap = overlappingTargets(
    sourcePrefix,
    targetPrefix,
    keys.map((k) => k.key),
  );
  if (overlap.length > 0) throw new OverlappingTransferError(overlap);
  const done: string[] = [];
  for (const [index, item] of keys.entries()) {
    try {
      options.signal?.throwIfAborted();
      const target = { bucket, key: targetPrefix + item.key.slice(sourcePrefix.length) };
      const source = { bucket, key: item.key };
      const transfer = mode === 'move' ? moveObject : copyObject;
      await transfer(client, source, target, { signal: options.signal, size: item.size });
      done.push(item.key);
      options.onProgress?.(done.length, keys.length);
    } catch (error) {
      return { done, remaining: keys.slice(index).map((k) => k.key), error };
    }
  }
  if (mode === 'move') {
    await removeFolderEntries(client, bucket, [sourcePrefix], done, options.signal);
  }
  return { done, remaining: [] };
}
