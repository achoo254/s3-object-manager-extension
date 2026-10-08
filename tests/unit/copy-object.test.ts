import { describe, expect, it } from 'vitest';
import {
  chooseCopyStrategy,
  copyObject,
  copySourceOf,
  moveObject,
  OverlappingTransferError,
  overlappingTargets,
  transferPrefix,
} from '@/core/s3/operations/copy-object';
import { GiB } from '@/core/upload/part-planner';
import { fakeS3Client, s3Error } from '../support/fake-s3-client';

const source = { bucket: 'src', key: 'dir/big file.bin' };
const target = { bucket: 'dst', key: 'copy/big file.bin' };

describe('copy-object', () => {
  it('uses CopyObject up to 5 GiB and UploadPartCopy above', () => {
    expect(chooseCopyStrategy(5 * GiB)).toBe('single');
    expect(chooseCopyStrategy(5 * GiB + 1)).toBe('multipart');
  });

  it('URL-encodes each key segment of CopySource', () => {
    expect(copySourceOf({ bucket: 'b', key: 'thư mục/a b+c.txt' })).toBe(
      'b/th%C6%B0%20m%E1%BB%A5c/a%20b%2Bc.txt',
    );
  });

  it('copies a 6 GiB object part by part and completes in order', async () => {
    const size = 6 * GiB;
    const { client, calls } = fakeS3Client({
      HeadObjectCommand: () => ({ ContentLength: size, ContentType: 'video/mp4' }),
      CreateMultipartUploadCommand: () => ({ UploadId: 'u1' }),
      UploadPartCopyCommand: (input) => ({
        CopyPartResult: { ETag: `"p${String(input.PartNumber)}"` },
      }),
      CompleteMultipartUploadCommand: () => ({}),
    });
    await copyObject(client, source, target, { size });

    expect(calls.some((c) => c.command === 'CopyObjectCommand')).toBe(false);
    const create = calls.find((c) => c.command === 'CreateMultipartUploadCommand');
    expect(create?.input).toMatchObject({
      Bucket: 'dst',
      Key: target.key,
      ContentType: 'video/mp4',
    });
    const partCopies = calls.filter((c) => c.command === 'UploadPartCopyCommand');
    expect(partCopies).toHaveLength(768); // 6 GiB / 8 MiB
    expect(partCopies[0]?.input.CopySourceRange).toBe(`bytes=0-${8 * 1024 * 1024 - 1}`);
    const last = partCopies.find((c) => c.input.PartNumber === 768);
    expect(last?.input.CopySourceRange).toBe(`bytes=${size - 8 * 1024 * 1024}-${size - 1}`);
    const complete = calls.find((c) => c.command === 'CompleteMultipartUploadCommand');
    const parts = (complete?.input.MultipartUpload as { Parts: { PartNumber: number }[] }).Parts;
    expect(parts.map((p) => p.PartNumber)).toEqual(Array.from({ length: 768 }, (_, i) => i + 1));
  });

  it('aborts the multipart copy when a part fails', async () => {
    const { client, calls } = fakeS3Client({
      HeadObjectCommand: () => ({ ContentLength: 6 * GiB }),
      CreateMultipartUploadCommand: () => ({ UploadId: 'u1' }),
      UploadPartCopyCommand: () => {
        throw s3Error('AccessDenied', 403);
      },
      AbortMultipartUploadCommand: () => ({}),
    });
    await expect(copyObject(client, source, target, { size: 6 * GiB })).rejects.toMatchObject({
      name: 'AccessDenied',
    });
    expect(calls.some((c) => c.command === 'AbortMultipartUploadCommand')).toBe(true);
    expect(calls.some((c) => c.command === 'CompleteMultipartUploadCommand')).toBe(false);
  });

  it('moves = copy then delete, and never deletes when the copy fails', async () => {
    const ok = fakeS3Client({ CopyObjectCommand: () => ({}), DeleteObjectCommand: () => ({}) });
    await moveObject(ok.client, source, target, { size: 10 });
    expect(ok.calls.map((c) => c.command)).toEqual(['CopyObjectCommand', 'DeleteObjectCommand']);

    const failing = fakeS3Client({
      CopyObjectCommand: () => {
        throw s3Error('AccessDenied', 403);
      },
      DeleteObjectCommand: () => ({}),
    });
    await expect(moveObject(failing.client, source, target, { size: 10 })).rejects.toThrow();
    expect(failing.calls.map((c) => c.command)).toEqual(['CopyObjectCommand']);
  });
});

describe('transferPrefix', () => {
  it('finds targets that are also unprocessed sources', () => {
    expect(overlappingTargets('a/b/', 'a/', ['a/b/b/x', 'a/b/x', 'a/b/y'])).toEqual(['a/b/x']);
    expect(overlappingTargets('a/b/', 'c/', ['a/b/x'])).toEqual([]);
  });

  it('refuses an overlapping move before copying anything', async () => {
    const { client, calls } = fakeS3Client({
      ListObjectsV2Command: () => ({
        Contents: [
          { Key: 'a/b/b/x', Size: 1 },
          { Key: 'a/b/x', Size: 1 },
        ],
        IsTruncated: false,
      }),
      CopyObjectCommand: () => ({}),
      DeleteObjectCommand: () => ({}),
    });
    await expect(transferPrefix(client, 'bucket', 'a/b/', 'a/', 'move')).rejects.toBeInstanceOf(
      OverlappingTransferError,
    );
    expect(calls.map((c) => c.command)).toEqual(['ListObjectsV2Command']);
  });

  it('moves every object, then removes the emptied source folder entry', async () => {
    const { client, calls } = fakeS3Client({
      ListObjectsV2Command: () => ({
        Contents: [
          { Key: 'old/a', Size: 1 },
          { Key: 'old/b', Size: 1 },
        ],
        IsTruncated: false,
      }),
      CopyObjectCommand: () => ({}),
      DeleteObjectCommand: () => ({}),
    });
    const result = await transferPrefix(client, 'bucket', 'old/', 'new/', 'move');
    expect(result).toEqual({ done: ['old/a', 'old/b'], remaining: [] });
    expect(calls.filter((c) => c.command === 'CopyObjectCommand').map((c) => c.input.Key)).toEqual([
      'new/a',
      'new/b',
    ]);
    expect(calls.at(-1)).toMatchObject({ command: 'DeleteObjectCommand', input: { Key: 'old/' } });
  });

  it('reports what is left when it stops half way', async () => {
    const { client } = fakeS3Client({
      ListObjectsV2Command: () => ({
        Contents: [
          { Key: 'old/a', Size: 1 },
          { Key: 'old/b', Size: 1 },
        ],
        IsTruncated: false,
      }),
      CopyObjectCommand: (input) => {
        if (input.Key === 'new/b') throw s3Error('AccessDenied', 403);
        return {};
      },
      DeleteObjectCommand: () => ({}),
    });
    const result = await transferPrefix(client, 'bucket', 'old/', 'new/', 'move');
    expect(result.done).toEqual(['old/a']);
    expect(result.remaining).toEqual(['old/b']);
    expect(result.error).toMatchObject({ name: 'AccessDenied' });
  });
});
