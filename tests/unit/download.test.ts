import { describe, expect, it } from 'vitest';
import { downloadFileName } from '@/core/s3/operations/download';

describe('downloadFileName', () => {
  it('uses the last key segment and keeps Vietnamese characters', () => {
    expect(downloadFileName('thư mục/tệp có dấu.txt')).toBe('tệp có dấu.txt');
  });

  it('replaces characters and endings the downloads API rejects', () => {
    expect(downloadFileName('a/b:c?.txt')).toBe('b_c_.txt');
    expect(downloadFileName('a/.hidden')).toBe('_hidden');
    expect(downloadFileName('a/name. ')).toBe('name');
    expect(downloadFileName('...')).toBe('_');
    expect(downloadFileName('')).toBe('download');
  });
});
