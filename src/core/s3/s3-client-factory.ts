import { S3Client } from '@aws-sdk/client-s3';
import { effectiveAddressing } from '@/core/profiles/addressing';
import type { ConnectionProfile } from '@/core/profiles/profile.types';
import {
  deleteObjectsMd5Middleware,
  deleteObjectsMd5MiddlewareOptions,
} from './delete-objects-md5.middleware';

export type S3ClientProfile = Pick<
  ConnectionProfile,
  'endpoint' | 'region' | 'addressing' | 'accessKeyId' | 'secretAccessKey' | 'sessionToken'
>;

/**
 * The single place that creates S3 clients. Every provider difference is handled here
 * (or in `capabilities.ts`), never by branching at call sites.
 */
export function createS3Client(
  profile: S3ClientProfile,
  overrides: Partial<ConstructorParameters<typeof S3Client>[0]> = {},
): S3Client {
  const client = new S3Client({
    endpoint: profile.endpoint,
    region: profile.region,
    forcePathStyle: effectiveAddressing(profile) === 'path',
    credentials: {
      accessKeyId: profile.accessKeyId,
      secretAccessKey: profile.secretAccessKey,
      ...(profile.sessionToken ? { sessionToken: profile.sessionToken } : {}),
    },
    // Many S3-compatible servers reject the CRC32 checksums the SDK sends by default.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    ...overrides,
  });
  client.middlewareStack.add(deleteObjectsMd5Middleware, deleteObjectsMd5MiddlewareOptions);
  return client;
}
