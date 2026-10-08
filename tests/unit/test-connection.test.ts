import { describe, expect, it } from 'vitest';
import { testConnection } from '@/core/s3/operations/test-connection';
import { fakeS3Client, s3Error } from '../support/fake-s3-client';

describe('testConnection', () => {
  it('reports the number of buckets when the key may list them', async () => {
    const { client } = fakeS3Client({
      ListBucketsCommand: () => ({ Buckets: [{ Name: 'a' }, { Name: 'b' }] }),
    });
    await expect(testConnection(client)).resolves.toEqual({ kind: 'listBuckets', bucketCount: 2 });
  });

  it('falls back to HeadBucket on the default bucket when ListBuckets is denied', async () => {
    const { client, calls } = fakeS3Client({
      ListBucketsCommand: () => {
        throw s3Error('AccessDenied', 403);
      },
      HeadBucketCommand: () => ({}),
    });
    await expect(testConnection(client, 'scoped')).resolves.toEqual({
      kind: 'defaultBucketOnly',
      bucket: 'scoped',
    });
    expect(calls[1]).toMatchObject({ command: 'HeadBucketCommand', input: { Bucket: 'scoped' } });
  });

  it('fails when ListBuckets is denied and no default bucket is known', async () => {
    const { client } = fakeS3Client({
      ListBucketsCommand: () => {
        throw s3Error('AccessDenied', 403);
      },
    });
    await expect(testConnection(client)).rejects.toMatchObject({ name: 'AccessDenied' });
  });

  it('does not hide other errors behind the fallback', async () => {
    const { client, calls } = fakeS3Client({
      ListBucketsCommand: () => {
        throw s3Error('SignatureDoesNotMatch', 403);
      },
      HeadBucketCommand: () => ({}),
    });
    await expect(testConnection(client, 'scoped')).rejects.toMatchObject({
      name: 'SignatureDoesNotMatch',
    });
    expect(calls).toHaveLength(1);
  });
});
