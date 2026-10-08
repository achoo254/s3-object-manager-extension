import { DeleteObjectCommand, DeleteObjectsCommand, type S3Client } from '@aws-sdk/client-s3';

/** `DeleteObjects` accepts at most 1,000 keys per request. */
export const DELETE_BATCH_SIZE = 1000;

export interface DeleteFailure {
  key: string;
  code?: string;
  message?: string;
}

export interface DeleteResult {
  deleted: number;
  failures: DeleteFailure[];
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

/**
 * Deletes `keys` in batches of 1,000. Stops between batches when `signal` aborts; keys of
 * batches never sent are simply not deleted.
 */
export async function deleteKeys(
  client: S3Client,
  bucket: string,
  keys: readonly string[],
  options: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<DeleteResult> {
  const result: DeleteResult = { deleted: 0, failures: [] };
  let done = 0;
  for (const batch of chunk(keys, DELETE_BATCH_SIZE)) {
    options.signal?.throwIfAborted();
    const response = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((key) => ({ Key: key })), Quiet: true },
      }),
      { abortSignal: options.signal },
    );
    const failures = (response.Errors ?? []).map((error) => ({
      key: error.Key ?? '',
      code: error.Code,
      message: error.Message,
    }));
    result.failures.push(...failures);
    result.deleted += batch.length - failures.length;
    done += batch.length;
    options.onProgress?.(done, keys.length);
  }
  return result;
}

/**
 * Folder keys to clean up after deleting everything under `folderPrefixes`: each folder and
 * every sub-folder seen in `deletedKeys`, deepest first. Markers already deleted in a batch
 * are included again: a directory-backed server keeps a parent while a child still exists.
 */
export function folderEntriesToRemove(
  folderPrefixes: readonly string[],
  deletedKeys: readonly string[],
): string[] {
  const folders = new Set<string>();
  for (const prefix of folderPrefixes) {
    folders.add(prefix);
    for (const key of deletedKeys) {
      if (!key.startsWith(prefix)) continue;
      const parts = key.slice(prefix.length).split('/');
      parts.pop();
      let current = prefix;
      for (const part of parts) {
        current += `${part}/`;
        folders.add(current);
      }
    }
  }
  return [...folders].sort(
    (a, b) => b.split('/').length - a.split('/').length || b.localeCompare(a),
  );
}

/**
 * Deletes a folder: its objects in batches (children before their folder marker), then the
 * now-empty folder entries. Servers with real directories (SeaweedFS keeps them as
 * `CommonPrefixes`) only drop an emptied folder when its own key is deleted; on other servers
 * these deletes are no-ops.
 */
export async function deleteFolders(
  client: S3Client,
  bucket: string,
  folderPrefixes: readonly string[],
  objectKeys: readonly string[],
  options: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<DeleteResult> {
  const ordered = [...new Set(objectKeys)].sort((a, b) => b.localeCompare(a));
  const result = await deleteKeys(client, bucket, ordered, options);
  if (result.failures.length > 0) return result;
  await removeFolderEntries(client, bucket, folderPrefixes, ordered, options.signal);
  return result;
}

/**
 * Deletes the (now empty) folder keys left after their objects were deleted or moved, one
 * depth level at a time (deepest first, so a parent is only deleted once its sub-folders
 * are gone). A level with a single folder uses `DeleteObject`, larger levels `DeleteObjects`.
 */
export async function removeFolderEntries(
  client: S3Client,
  bucket: string,
  folderPrefixes: readonly string[],
  removedKeys: readonly string[],
  signal?: AbortSignal,
): Promise<void> {
  const levels = new Map<number, string[]>();
  for (const key of folderEntriesToRemove(folderPrefixes, removedKeys)) {
    const depth = key.split('/').length;
    levels.set(depth, [...(levels.get(depth) ?? []), key]);
  }
  for (const depth of [...levels.keys()].sort((a, b) => b - a)) {
    const keys = levels.get(depth) ?? [];
    signal?.throwIfAborted();
    if (keys.length === 1) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: keys[0] }), {
        abortSignal: signal,
      });
    } else {
      await deleteKeys(client, bucket, keys, { signal });
    }
  }
}
