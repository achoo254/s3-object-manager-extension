import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** SigV4 presigned URLs cannot live longer than 7 days. */
export const SHARE_DURATIONS_SECONDS = {
  hour: 60 * 60,
  day: 24 * 60 * 60,
  week: 7 * 24 * 60 * 60,
} as const;

export type ShareDuration = keyof typeof SHARE_DURATIONS_SECONDS;

export const DOWNLOAD_LINK_SECONDS = 15 * 60;

export interface PresignedLink {
  url: string;
  expiresAt: Date;
}

export async function presignGetObject(
  client: S3Client,
  bucket: string,
  key: string,
  expiresInSeconds: number,
  now: Date = new Date(),
): Promise<PresignedLink> {
  const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: expiresInSeconds,
  });
  return { url, expiresAt: new Date(now.getTime() + expiresInSeconds * 1000) };
}
