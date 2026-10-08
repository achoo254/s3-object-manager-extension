import { HeadBucketCommand, ListBucketsCommand, type S3Client } from '@aws-sdk/client-s3';
import { s3ErrorCode } from '../s3-error';

export type ConnectionTestResult =
  | { kind: 'listBuckets'; bucketCount: number }
  /** The key cannot list buckets but can reach its default bucket: a scoped key, not a failure. */
  | { kind: 'defaultBucketOnly'; bucket: string };

/**
 * Tries `ListBuckets`; when that is denied and a default bucket is known, falls back to
 * `HeadBucket`, because narrowly scoped keys often lack `ListBuckets`.
 */
export async function testConnection(
  client: S3Client,
  defaultBucket?: string,
): Promise<ConnectionTestResult> {
  try {
    const { Buckets = [] } = await client.send(new ListBucketsCommand({}));
    return { kind: 'listBuckets', bucketCount: Buckets.length };
  } catch (error) {
    if (!defaultBucket || s3ErrorCode(error) !== 'AccessDenied') throw error;
    await client.send(new HeadBucketCommand({ Bucket: defaultBucket }));
    return { kind: 'defaultBucketOnly', bucket: defaultBucket };
  }
}
