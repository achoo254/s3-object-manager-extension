import { describe, expect, it } from 'vitest';
import {
  deleteFolders,
  deleteKeys,
  folderEntriesToRemove,
} from '@/core/s3/operations/delete-objects';
import { fakeS3Client } from '../support/fake-s3-client';

describe('deleteKeys', () => {
  it('splits 2,500 keys into exactly 3 DeleteObjects batches', async () => {
    const { client, calls } = fakeS3Client({ DeleteObjectsCommand: () => ({}) });
    const keys = Array.from({ length: 2500 }, (_, i) => `k${i}`);
    const progress: number[] = [];
    const result = await deleteKeys(client, 'bucket', keys, {
      onProgress: (done) => progress.push(done),
    });
    const sizes = calls.map((c) => (c.input.Delete as { Objects: unknown[] }).Objects.length);
    expect(sizes).toEqual([1000, 1000, 500]);
    expect(progress).toEqual([1000, 2000, 2500]);
    expect(result).toEqual({ deleted: 2500, failures: [] });
  });

  it('reports per-key failures returned by the server', async () => {
    const { client } = fakeS3Client({
      DeleteObjectsCommand: () => ({ Errors: [{ Key: 'b', Code: 'AccessDenied', Message: 'no' }] }),
    });
    const result = await deleteKeys(client, 'bucket', ['a', 'b']);
    expect(result).toEqual({
      deleted: 1,
      failures: [{ key: 'b', code: 'AccessDenied', message: 'no' }],
    });
  });

  it('stops between batches when cancelled', async () => {
    const controller = new AbortController();
    const { client, calls } = fakeS3Client({
      DeleteObjectsCommand: () => {
        controller.abort();
        return {};
      },
    });
    const keys = Array.from({ length: 1500 }, (_, i) => `k${i}`);
    await expect(
      deleteKeys(client, 'bucket', keys, { signal: controller.signal }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
});

describe('deleteFolders', () => {
  it('lists folder entries deepest first', () => {
    expect(
      folderEntriesToRemove(
        ['docs/'],
        ['docs/', 'docs/a.txt', 'docs/sub/b.txt', 'docs/sub/deep/c'],
      ),
    ).toEqual(['docs/sub/deep/', 'docs/sub/', 'docs/']);
  });

  it('deletes children before their marker, then the emptied folder entries', async () => {
    const { client, calls } = fakeS3Client({
      DeleteObjectsCommand: () => ({}),
      DeleteObjectCommand: () => ({}),
    });
    await deleteFolders(client, 'bucket', ['docs/'], ['docs/', 'docs/sub/b.txt', 'docs/a.txt']);
    const batch = (calls[0]?.input.Delete as { Objects: { Key: string }[] }).Objects.map(
      (o) => o.Key,
    );
    expect(batch).toEqual(['docs/sub/b.txt', 'docs/a.txt', 'docs/']);
    expect(calls.slice(1).map((c) => [c.command, c.input.Key])).toEqual([
      ['DeleteObjectCommand', 'docs/sub/'],
      ['DeleteObjectCommand', 'docs/'],
    ]);
  });

  it('removes many sibling sub-folders with one DeleteObjects per depth level', async () => {
    const { client, calls } = fakeS3Client({
      DeleteObjectsCommand: () => ({}),
      DeleteObjectCommand: () => ({}),
    });
    const keys = Array.from({ length: 500 }, (_, i) => `top/sub${i}/file.txt`);
    await deleteFolders(client, 'bucket', ['top/'], keys);
    const commands = calls.map((c) => c.command);
    // 1 batch of objects, 1 batch with the 500 sub-folders, 1 DeleteObject for top/.
    expect(commands).toEqual([
      'DeleteObjectsCommand',
      'DeleteObjectsCommand',
      'DeleteObjectCommand',
    ]);
  });

  it('deletes a 10,000-object folder with 10 DeleteObjects requests', async () => {
    const { client, calls } = fakeS3Client({
      DeleteObjectsCommand: () => ({}),
      DeleteObjectCommand: () => ({}),
    });
    const keys = Array.from({ length: 10_000 }, (_, i) => `big/${i}`);
    await deleteFolders(client, 'bucket', ['big/'], keys);
    expect(calls.filter((c) => c.command === 'DeleteObjectsCommand')).toHaveLength(10);
  });

  it('leaves folder entries alone when some objects failed to delete', async () => {
    const { client, calls } = fakeS3Client({
      DeleteObjectsCommand: () => ({ Errors: [{ Key: 'docs/a.txt', Code: 'AccessDenied' }] }),
      DeleteObjectCommand: () => ({}),
    });
    await deleteFolders(client, 'bucket', ['docs/'], ['docs/a.txt']);
    expect(calls.map((c) => c.command)).toEqual(['DeleteObjectsCommand']);
  });
});
