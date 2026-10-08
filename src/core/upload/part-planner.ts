export const MiB = 1024 * 1024;
export const GiB = 1024 * MiB;

/** Files up to this size go up in one `PutObject`. */
export const SINGLE_PUT_MAX_BYTES = 16 * MiB;
export const DEFAULT_PART_SIZE = 8 * MiB;
/** Stays below common proxy/CDN body limits and under ~100 s per request on slow links. */
export const MAX_PART_SIZE = 64 * MiB;
export const MAX_PARTS = 10_000;
export const MAX_MULTIPART_BYTES = MAX_PARTS * MAX_PART_SIZE;

export type UploadPlan =
  | { kind: 'single' }
  | { kind: 'multipart'; partSize: number; partCount: number }
  | { kind: 'tooLarge'; maxBytes: number };

/** Part size: 8 MiB by default, grown in whole MiB until the file fits in 10,000 parts. */
export function planMultipart(size: number): UploadPlan {
  const needed = Math.ceil(size / MAX_PARTS);
  const partSize = Math.max(DEFAULT_PART_SIZE, Math.ceil(needed / MiB) * MiB);
  if (partSize > MAX_PART_SIZE) return { kind: 'tooLarge', maxBytes: MAX_MULTIPART_BYTES };
  return { kind: 'multipart', partSize, partCount: Math.max(1, Math.ceil(size / partSize)) };
}

export function planUpload(size: number): UploadPlan {
  return size <= SINGLE_PUT_MAX_BYTES ? { kind: 'single' } : planMultipart(size);
}

/** Byte range `[start, end)` of 1-based `partNumber`. */
export function partRange(
  partNumber: number,
  partSize: number,
  totalSize: number,
): { start: number; end: number } {
  const start = (partNumber - 1) * partSize;
  return { start, end: Math.min(start + partSize, totalSize) };
}
