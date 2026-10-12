import {
  HeadBucketCommand,
  ListBucketsCommand,
  type Bucket,
  type S3Client,
} from '@aws-sdk/client-s3';
import { s3ErrorCode } from '../s3-error';

export type ConnectionTestResult =
  | { kind: 'listBuckets'; bucketCount: number }
  /** The key cannot list buckets but can reach its default bucket: a scoped key, not a failure. */
  | { kind: 'defaultBucketOnly'; bucket: string };

/**
 * Tries `ListBuckets`; when that is denied and a default bucket is known, falls back to
 * `HeadBucket`, because narrowly scoped keys often lack `ListBuckets`. A default bucket missing
 * from the list (shared through a bucket policy, so not owned by the key) is checked the same way.
 */
export async function testConnection(
  client: S3Client,
  defaultBucket?: string,
): Promise<ConnectionTestResult> {
  let buckets: Bucket[];
  try {
    buckets = (await client.send(new ListBucketsCommand({}))).Buckets ?? [];
  } catch (error) {
    if (!defaultBucket || s3ErrorCode(error) !== 'AccessDenied') throw error;
    return checkDefaultBucket(client, defaultBucket);
  }
  if (defaultBucket && !buckets.some((bucket) => bucket.Name === defaultBucket)) {
    return checkDefaultBucket(client, defaultBucket);
  }
  return { kind: 'listBuckets', bucketCount: buckets.length };
}

async function checkDefaultBucket(client: S3Client, bucket: string): Promise<ConnectionTestResult> {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  return { kind: 'defaultBucketOnly', bucket };
}
