#!/usr/bin/env node
/**
 * Creates the sample buckets and objects used during development on the local S3 server.
 *
 *   node scripts/seed-local-s3.mjs                # sample bucket with a few objects
 *   node scripts/seed-local-s3.mjs --bulk 100000  # also N small objects under bulk/ (listing tests)
 *
 * Endpoint and keys default to docker-compose.yml + docker/seaweedfs-s3.json and can be
 * overridden with LOCAL_S3_ENDPOINT, LOCAL_S3_ACCESS_KEY_ID, LOCAL_S3_SECRET_ACCESS_KEY.
 */
import {
  CreateBucketCommand,
  HeadBucketCommand,
  ListBucketsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { readFileSync } from 'node:fs';

const testConfig = JSON.parse(
  readFileSync(new URL('../docker/seaweedfs-s3.json', import.meta.url), 'utf8'),
);
const testCredentials = testConfig.identities[0].credentials[0];

const endpoint = process.env.LOCAL_S3_ENDPOINT || 'http://localhost:8333';
const client = new S3Client({
  endpoint,
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.LOCAL_S3_ACCESS_KEY_ID || testCredentials.accessKey,
    secretAccessKey: process.env.LOCAL_S3_SECRET_ACCESS_KEY || testCredentials.secretKey,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const SAMPLE_BUCKET = 'sample-bucket';
const sampleObjects = {
  'readme.txt': 'Hello from the local S3 server.\n',
  'docs/guide.md': '# Guide\n\nSample document.\n',
  'docs/notes/todo.txt': 'one\ntwo\nthree\n',
  'images/pixel.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
  'tiếng việt/tệp có dấu.txt': 'Xin chào\n',
};

async function ensureBucket(name) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: name }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: name }));
    console.log(`created bucket ${name}`);
  }
}

async function putMany(keys, concurrency = 32) {
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < keys.length) {
      const key = keys[next++];
      await client.send(new PutObjectCommand({ Bucket: SAMPLE_BUCKET, Key: key, Body: key }));
      done++;
      if (done % 5000 === 0) console.log(`  ${done}/${keys.length}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

async function main() {
  await ensureBucket(SAMPLE_BUCKET);
  for (const [key, body] of Object.entries(sampleObjects)) {
    await client.send(new PutObjectCommand({ Bucket: SAMPLE_BUCKET, Key: key, Body: body }));
  }
  console.log(`seeded ${Object.keys(sampleObjects).length} sample objects`);

  const bulkIndex = process.argv.indexOf('--bulk');
  if (bulkIndex !== -1) {
    const count = Number(process.argv[bulkIndex + 1] ?? '100000');
    const keys = Array.from(
      { length: count },
      (_, i) => `bulk/object-${String(i).padStart(6, '0')}.txt`,
    );
    console.log(`writing ${count} objects under bulk/ ...`);
    await putMany(keys);
  }

  const { Buckets = [] } = await client.send(new ListBucketsCommand({}));
  console.log('buckets:', Buckets.map((bucket) => bucket.Name).join(', '));
}

main().catch((error) => {
  console.error(`seed failed against ${endpoint}:`, error.name, error.message);
  process.exit(1);
});
