import type { S3Client } from '@aws-sdk/client-s3';

type Handler = (input: Record<string, unknown>, callIndex: number) => unknown;

export interface RecordedCall {
  command: string;
  input: Record<string, unknown>;
}

/**
 * Minimal stand-in for `S3Client`: answers each command by name with a handler and records
 * every call. Handlers may throw to simulate S3 errors.
 */
export function fakeS3Client(handlers: Record<string, Handler>) {
  const calls: RecordedCall[] = [];
  const counts = new Map<string, number>();
  const client = {
    async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
      const name = command.constructor.name;
      calls.push({ command: name, input: command.input });
      const handler = handlers[name];
      if (!handler) throw new Error(`fake S3 has no handler for ${name}`);
      const index = counts.get(name) ?? 0;
      counts.set(name, index + 1);
      return handler(command.input, index);
    },
  };
  return { client: client as unknown as S3Client, calls };
}

export function s3Error(code: string, status: number): Error {
  return Object.assign(new Error(code), { name: code, $metadata: { httpStatusCode: status } });
}
