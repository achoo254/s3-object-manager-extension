import { DeleteObjectsCommand, ListBucketsCommand } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ConnectionProfile } from '@/core/profiles/profile.types';
import { createS3Client } from '@/core/s3/s3-client-factory';

type CapturedRequest = {
  headers: Record<string, string>;
  body: unknown;
  hostname: string;
  path: string;
};

const baseProfile: ConnectionProfile = {
  id: 'p1',
  name: 'Local',
  endpoint: 'http://localhost:8333',
  region: 'us-east-1',
  addressing: 'path',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'secret',
};

/** A request handler that records the final (signed) request and answers with a fixed body. */
function capturingHandler(responseBody: string) {
  const captured: CapturedRequest[] = [];
  const handler = {
    handle: async (request: CapturedRequest) => {
      captured.push({ ...request, headers: { ...request.headers } });
      return {
        response: {
          statusCode: 200,
          headers: { 'content-type': 'application/xml' },
          body: new TextEncoder().encode(responseBody),
        },
      };
    },
  };
  return { handler, captured };
}

const deleteResult =
  '<?xml version="1.0" encoding="UTF-8"?><DeleteResult><Deleted><Key>a</Key></Deleted></DeleteResult>';
const listBucketsResult =
  '<?xml version="1.0" encoding="UTF-8"?><ListAllMyBucketsResult><Buckets></Buckets></ListAllMyBucketsResult>';

describe('createS3Client', () => {
  it('always asks for checksums only when required', async () => {
    const client = createS3Client(baseProfile);
    expect(await client.config.requestChecksumCalculation()).toBe('WHEN_REQUIRED');
    expect(await client.config.responseChecksumValidation()).toBe('WHEN_REQUIRED');
  });

  it('sets forcePathStyle from the profile addressing', () => {
    expect(createS3Client(baseProfile).config.forcePathStyle).toBe(true);
    const remote = { ...baseProfile, endpoint: 'https://s3.example.test' };
    expect(createS3Client({ ...remote, addressing: 'virtual' }).config.forcePathStyle).toBe(false);
  });

  it('sends DeleteObjects with Content-MD5 and without any x-amz-checksum header', async () => {
    const { handler, captured } = capturingHandler(deleteResult);
    const client = createS3Client(baseProfile, { requestHandler: handler as never });
    await client.send(
      new DeleteObjectsCommand({
        Bucket: 'bucket',
        Delete: { Objects: [{ Key: 'a' }, { Key: 'b' }, { Key: 'c' }], Quiet: true },
      }),
    );
    const request = captured[0];
    expect(request).toBeDefined();
    const headerNames = Object.keys(request?.headers ?? {}).map((name) => name.toLowerCase());
    expect(headerNames.filter((name) => name.startsWith('x-amz-checksum-'))).toEqual([]);
    expect(headerNames).not.toContain('x-amz-sdk-checksum-algorithm');

    const body = request?.body as string;
    const expectedMd5 = createHash('md5').update(body).digest('base64');
    const md5Header = Object.entries(request?.headers ?? {}).find(
      ([name]) => name.toLowerCase() === 'content-md5',
    );
    expect(md5Header?.[1]).toBe(expectedMd5);
    // Content-MD5 must be covered by the signature, i.e. added before signing.
    expect(request?.headers['authorization']).toContain('content-md5');
  });

  it('leaves other commands without Content-MD5 or checksum headers', async () => {
    const { handler, captured } = capturingHandler(listBucketsResult);
    const client = createS3Client(baseProfile, { requestHandler: handler as never });
    await client.send(new ListBucketsCommand({}));
    const headerNames = Object.keys(captured[0]?.headers ?? {}).map((name) => name.toLowerCase());
    expect(headerNames).not.toContain('content-md5');
    expect(headerNames.filter((name) => name.startsWith('x-amz-checksum-'))).toEqual([]);
  });

  it('uses virtual-hosted URLs only for virtual addressing', async () => {
    const path = capturingHandler(deleteResult);
    await createS3Client(
      { ...baseProfile, endpoint: 'https://s3.example.test' },
      { requestHandler: path.handler as never },
    ).send(new DeleteObjectsCommand({ Bucket: 'bucket', Delete: { Objects: [{ Key: 'a' }] } }));
    expect(path.captured[0]?.hostname).toBe('s3.example.test');
    expect(path.captured[0]?.path).toBe('/bucket/');

    const virtual = capturingHandler(deleteResult);
    await createS3Client(
      { ...baseProfile, endpoint: 'https://s3.example.test', addressing: 'virtual' },
      { requestHandler: virtual.handler as never },
    ).send(new DeleteObjectsCommand({ Bucket: 'bucket', Delete: { Objects: [{ Key: 'a' }] } }));
    expect(virtual.captured[0]?.hostname).toBe('bucket.s3.example.test');
  });
});

describe('addressing fallback', () => {
  it('uses path-style for localhost and IP endpoints even when virtual-hosted is chosen', () => {
    for (const endpoint of ['http://localhost:9000', 'http://127.0.0.1:8333', 'https://10.0.0.5']) {
      const client = createS3Client({ ...baseProfile, endpoint, addressing: 'virtual' });
      expect(client.config.forcePathStyle).toBe(true);
    }
    expect(
      createS3Client({ ...baseProfile, endpoint: 'https://s3.example.test', addressing: 'virtual' })
        .config.forcePathStyle,
    ).toBe(false);
  });
});
