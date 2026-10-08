import { describe, expect, it } from 'vitest';
import {
  GiB,
  MAX_PART_SIZE,
  MAX_PARTS,
  MiB,
  partRange,
  planUpload,
} from '@/core/upload/part-planner';

describe('part-planner', () => {
  it('sends files up to 16 MiB in one PutObject', () => {
    expect(planUpload(0)).toEqual({ kind: 'single' });
    expect(planUpload(16 * MiB)).toEqual({ kind: 'single' });
    expect(planUpload(16 * MiB + 1).kind).toBe('multipart');
  });

  it('splits 1 GiB into 128 parts of 8 MiB', () => {
    expect(planUpload(GiB)).toEqual({ kind: 'multipart', partSize: 8 * MiB, partCount: 128 });
  });

  it('grows the part size for 200 GiB to stay within 10,000 parts and 64 MiB', () => {
    const plan = planUpload(200 * GiB);
    if (plan.kind !== 'multipart') throw new Error('expected multipart');
    expect(plan.partCount).toBeLessThanOrEqual(MAX_PARTS);
    expect(plan.partSize).toBeLessThanOrEqual(MAX_PART_SIZE);
    expect(plan.partSize).toBeGreaterThan(8 * MiB);
    expect(plan.partSize % MiB).toBe(0);
    expect(plan.partSize * plan.partCount).toBeGreaterThanOrEqual(200 * GiB);
  });

  it('accepts exactly 10,000 parts of 64 MiB and refuses 700 GiB', () => {
    expect(planUpload(MAX_PARTS * MAX_PART_SIZE)).toEqual({
      kind: 'multipart',
      partSize: MAX_PART_SIZE,
      partCount: MAX_PARTS,
    });
    expect(planUpload(700 * GiB)).toEqual({
      kind: 'tooLarge',
      maxBytes: MAX_PARTS * MAX_PART_SIZE,
    });
  });

  it('gives the last part only the remaining bytes', () => {
    const size = 20 * MiB + 5;
    expect(partRange(1, 8 * MiB, size)).toEqual({ start: 0, end: 8 * MiB });
    expect(partRange(3, 8 * MiB, size)).toEqual({ start: 16 * MiB, end: size });
  });
});
