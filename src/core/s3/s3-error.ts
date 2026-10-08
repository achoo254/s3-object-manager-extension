/** Small accessors over the error shapes the S3 SDK throws. */

export interface S3ErrorLike {
  name?: string;
  Code?: string;
  message?: string;
  $metadata?: { httpStatusCode?: number };
  $response?: { statusCode?: number; headers?: Record<string, string>; body?: unknown };
}

export function asS3Error(error: unknown): S3ErrorLike {
  return typeof error === 'object' && error !== null ? (error as S3ErrorLike) : {};
}

/** The S3 error code (`AccessDenied`, `NoSuchKey`, ...) or the JS error name. */
export function s3ErrorCode(error: unknown): string | undefined {
  const e = asS3Error(error);
  return e.Code ?? e.name;
}

export function httpStatusOf(error: unknown): number | undefined {
  const e = asS3Error(error);
  return e.$metadata?.httpStatusCode ?? e.$response?.statusCode;
}

export function isAbortError(error: unknown): boolean {
  return s3ErrorCode(error) === 'AbortError';
}
