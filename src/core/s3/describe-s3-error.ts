import { FileTooLargeError } from '@/core/upload/multipart-uploader';
import { OverlappingTransferError } from './operations/copy-object';
import { asS3Error, httpStatusOf, s3ErrorCode } from './s3-error';

/**
 * Turns any error into i18n keys saying what happened and what to do about it.
 * `title` and `action` are keys under `errors.*`; `params` fill their placeholders.
 */
export interface ErrorDescription {
  /** Original S3 error code / HTTP status / JS error name; empty for the extension's own errors. */
  code: string;
  title: string;
  action: string;
  params: Record<string, string | number>;
}

type Kind =
  | 'signatureDoesNotMatch'
  | 'invalidAccessKeyId'
  | 'accessDenied'
  | 'noSuchBucket'
  | 'noSuchKey'
  | 'bucketAlreadyExists'
  | 'requestTimeTooSkewed'
  | 'quotaExceeded'
  | 'entityTooLarge'
  | 'slowDown'
  | 'userSuspended'
  | 'notImplemented'
  | 'network'
  | 'proxyBlocked'
  | 'fileTooLarge'
  | 'overlappingTransfer'
  | 'unknown';

const KIND_BY_CODE: Record<string, Kind> = {
  SignatureDoesNotMatch: 'signatureDoesNotMatch',
  InvalidAccessKeyId: 'invalidAccessKeyId',
  AccessDenied: 'accessDenied',
  Forbidden: 'accessDenied',
  AllAccessDisabled: 'accessDenied',
  NoSuchBucket: 'noSuchBucket',
  NoSuchKey: 'noSuchKey',
  NotFound: 'noSuchKey',
  BucketAlreadyExists: 'bucketAlreadyExists',
  BucketAlreadyOwnedByYou: 'bucketAlreadyExists',
  RequestTimeTooSkewed: 'requestTimeTooSkewed',
  QuotaExceeded: 'quotaExceeded',
  XAmzContentSHA256Mismatch: 'signatureDoesNotMatch',
  EntityTooLarge: 'entityTooLarge',
  SlowDown: 'slowDown',
  ServiceUnavailable: 'slowDown',
  TooManyRequests: 'slowDown',
  UserSuspended: 'userSuspended',
  AccountProblem: 'userSuspended',
  NotImplemented: 'notImplemented',
};

function responseContentType(error: unknown): string {
  const headers = asS3Error(error).$response?.headers ?? {};
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === 'content-type');
  return entry?.[1]?.toLowerCase() ?? '';
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof TypeError) && s3ErrorCode(error) !== 'TypeError') return false;
  return httpStatusOf(error) === undefined;
}

function classify(error: unknown): Kind {
  if (error instanceof FileTooLargeError) return 'fileTooLarge';
  if (error instanceof OverlappingTransferError) return 'overlappingTransfer';
  if (isNetworkError(error)) return 'network';

  const code = s3ErrorCode(error);
  const known = code ? KIND_BY_CODE[code] : undefined;
  if (known) return known;

  const status = httpStatusOf(error);
  // An HTML error page instead of S3's XML means something in front of the endpoint answered.
  if (status === 403 && responseContentType(error).includes('text/html')) return 'proxyBlocked';
  if (status === 403) return 'accessDenied';
  if (status === 404) return 'noSuchKey';
  if (status === 501) return 'notImplemented';
  if (status === 503 || status === 429) return 'slowDown';
  return 'unknown';
}

function rawCode(error: unknown): string {
  const code = s3ErrorCode(error);
  const status = httpStatusOf(error);
  if (code && code !== 'Unknown' && code !== 'Error') return code;
  if (status !== undefined) return `HTTP ${status}`;
  return code ?? (error instanceof Error ? error.name : 'Error');
}

export function describeS3Error(error: unknown): ErrorDescription {
  const kind = classify(error);
  // Errors raised by the extension itself carry no server code worth showing.
  const local = kind === 'fileTooLarge' || kind === 'overlappingTransfer';
  const code = local ? '' : rawCode(error);
  const params: Record<string, string | number> = { code };
  if (error instanceof FileTooLargeError) params.maxGiB = Math.floor(error.maxBytes / 1024 ** 3);
  if (error instanceof OverlappingTransferError) params.count = error.keys.length;
  return { code, title: `errors.${kind}.title`, action: `errors.${kind}.action`, params };
}
