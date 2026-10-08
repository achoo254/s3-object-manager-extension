import { Md5 } from '@smithy/md5-js';
import type {
  AbsoluteLocation,
  BuildHandlerOptions,
  BuildMiddleware,
  HttpRequest,
  MetadataBearer,
} from '@smithy/types';
import { bytesToBase64 } from '@/core/util/base64';

/**
 * `DeleteObjects` is modelled as "checksum required", so the SDK still sends a CRC32
 * checksum even with `requestChecksumCalculation: 'WHEN_REQUIRED'`. Several S3-compatible
 * servers reject that and demand `Content-MD5`; AWS accepts `Content-MD5` too, so every
 * endpoint gets the same treatment: drop the SDK checksum headers and send `Content-MD5`.
 *
 * Runs at the end of the build step, after the SDK's checksum middleware and before signing.
 */
const DELETE_OBJECTS_COMMAND = 'DeleteObjectsCommand';

function isChecksumHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('x-amz-checksum-') || lower === 'x-amz-sdk-checksum-algorithm';
}

function isHttpRequest(request: unknown): request is HttpRequest {
  return (
    typeof request === 'object' && request !== null && 'headers' in request && 'body' in request
  );
}

async function md5Base64(body: string | Uint8Array): Promise<string> {
  const hash = new Md5();
  hash.update(body);
  return bytesToBase64(await hash.digest());
}

export const deleteObjectsMd5Middleware: BuildMiddleware<object, MetadataBearer> =
  (next, context) => async (args) => {
    if (context.commandName !== DELETE_OBJECTS_COMMAND || !isHttpRequest(args.request)) {
      return next(args);
    }
    const request = args.request;
    const body: unknown = request.body;
    if (typeof body !== 'string' && !(body instanceof Uint8Array)) {
      throw new Error('DeleteObjects body must be serialised before computing Content-MD5');
    }
    for (const name of Object.keys(request.headers)) {
      if (isChecksumHeader(name)) delete request.headers[name];
    }
    request.headers['content-md5'] = await md5Base64(body);
    return next(args);
  };

export const deleteObjectsMd5MiddlewareOptions: BuildHandlerOptions & AbsoluteLocation = {
  step: 'build',
  priority: 'low',
  name: 'deleteObjectsContentMd5',
  override: true,
};
