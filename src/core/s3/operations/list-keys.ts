import { ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';

export interface KeyInfo {
  key: string;
  size: number;
}

/**
 * Lists every object under `prefix` (no delimiter, so nested "folders" included),
 * one page of up to 1,000 keys at a time.
 */
export async function* listKeyPages(
  client: S3Client,
  bucket: string,
  prefix: string,
  signal?: AbortSignal,
): AsyncGenerator<KeyInfo[]> {
  let continuationToken: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      }),
      { abortSignal: signal },
    );
    const keys = (page.Contents ?? []).flatMap((item) =>
      item.Key === undefined ? [] : [{ key: item.Key, size: item.Size ?? 0 }],
    );
    yield keys;
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
}

/** Collects every key under `prefix`, so a confirmation can state the exact object count. */
export async function collectKeys(
  client: S3Client,
  bucket: string,
  prefix: string,
  options: { signal?: AbortSignal; onProgress?: (found: number) => void } = {},
): Promise<KeyInfo[]> {
  const all: KeyInfo[] = [];
  for await (const page of listKeyPages(client, bucket, prefix, options.signal)) {
    all.push(...page);
    options.onProgress?.(all.length);
  }
  return all;
}
