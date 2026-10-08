import type { S3Client } from '@aws-sdk/client-s3';
import { browser } from 'wxt/browser';
import { DOWNLOAD_LINK_SECONDS, presignGetObject } from './presign';

/** Last path segment of a key, with characters the downloads API rejects replaced. */
export function downloadFileName(key: string): string {
  const base = key.split('/').filter(Boolean).pop() ?? 'download';
  const safe = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '_')
    // The downloads API also rejects names ending in a dot or a space.
    .replace(/[. ]+$/, '');
  return safe || 'download';
}

/**
 * Hands a 15-minute presigned URL to the browser's download manager, so the file streams to
 * disk without ever being held in the tab's memory.
 */
export async function downloadObject(client: S3Client, bucket: string, key: string): Promise<void> {
  const { url } = await presignGetObject(client, bucket, key, DOWNLOAD_LINK_SECONDS);
  await browser.downloads.download({ url, filename: downloadFileName(key), saveAs: false });
}
