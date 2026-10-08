import { describe, expect, it } from 'vitest';
import { describeS3Error } from '@/core/s3/describe-s3-error';
import { FileTooLargeError } from '@/core/upload/multipart-uploader';
import { WrongPassphraseError } from '@/core/vault/vault-crypto';
import en from '@/i18n/en.json';
import vi from '@/i18n/vi.json';

function messageAt(messages: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      messages,
    );
}

function s3(name: string, status: number, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(name), {
    name,
    Code: name,
    $metadata: { httpStatusCode: status },
    ...extra,
  });
}

/** Error shape the SDK produces for a response with no parseable S3 error body. */
function bodyless(status: number, contentType = 'application/xml') {
  return Object.assign(new Error('UnknownError'), {
    name: 'Unknown',
    $metadata: { httpStatusCode: status },
    $response: { statusCode: status, headers: { 'content-type': contentType } },
  });
}

const table: Array<[string, unknown, string]> = [
  ['SignatureDoesNotMatch', s3('SignatureDoesNotMatch', 403), 'signatureDoesNotMatch'],
  ['InvalidAccessKeyId', s3('InvalidAccessKeyId', 403), 'invalidAccessKeyId'],
  ['AccessDenied', s3('AccessDenied', 403), 'accessDenied'],
  ['NoSuchBucket', s3('NoSuchBucket', 404), 'noSuchBucket'],
  ['NoSuchKey', s3('NoSuchKey', 404), 'noSuchKey'],
  ['BucketAlreadyExists', s3('BucketAlreadyExists', 409), 'bucketAlreadyExists'],
  ['BucketAlreadyOwnedByYou', s3('BucketAlreadyOwnedByYou', 409), 'bucketAlreadyExists'],
  ['RequestTimeTooSkewed', s3('RequestTimeTooSkewed', 403), 'requestTimeTooSkewed'],
  ['QuotaExceeded', s3('QuotaExceeded', 403), 'quotaExceeded'],
  ['EntityTooLarge', s3('EntityTooLarge', 400), 'entityTooLarge'],
  ['SlowDown', s3('SlowDown', 503), 'slowDown'],
  ['plain 503', bodyless(503, 'text/plain'), 'slowDown'],
  ['UserSuspended', s3('UserSuspended', 403), 'userSuspended'],
  ['NotImplemented', s3('NotImplemented', 501), 'notImplemented'],
  ['Failed to fetch', new TypeError('Failed to fetch'), 'network'],
  ['403 with HTML body', bodyless(403, 'text/html; charset=utf-8'), 'proxyBlocked'],
  ['403 on HEAD (no body)', bodyless(403, 'application/xml'), 'accessDenied'],
  ['404 on HEAD (no body)', bodyless(404), 'noSuchKey'],
  ['wrong passphrase', new WrongPassphraseError(), 'wrongPassphrase'],
];

describe('describeS3Error', () => {
  it.each(table)('%s → errors.%s', (_label, error, kind) => {
    const description = describeS3Error(error);
    expect(description.title).toBe(`errors.${kind}.title`);
    expect(description.action).toBe(`errors.${kind}.action`);
    for (const messages of [vi, en]) {
      expect(typeof messageAt(messages, description.title)).toBe('string');
      expect(typeof messageAt(messages, description.action)).toBe('string');
    }
  });

  it('falls back to a generic message carrying the original code', () => {
    const description = describeS3Error(s3('InvalidStorageClass', 400));
    expect(description.title).toBe('errors.unknown.title');
    expect(description.params.code).toBe('InvalidStorageClass');
  });

  it('uses the HTTP status as the code when the server sent no error code', () => {
    expect(describeS3Error(bodyless(418)).params.code).toBe('HTTP 418');
  });

  it('gives the size limit for files that are too large', () => {
    const description = describeS3Error(new FileTooLargeError(10_000 * 64 * 1024 * 1024));
    expect(description.title).toBe('errors.fileTooLarge.title');
    expect(description.params.maxGiB).toBe(625);
  });
});
