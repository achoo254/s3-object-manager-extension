/**
 * Measures the thresholds of the performance table in plans/v0.1.0/plan.md against a local
 * S3-compatible server, and appends the results to PERF_OUTPUT (JSON lines).
 *
 * Variables: PERF_S3_ENDPOINT (http://localhost:8333), PERF_S3_ACCESS_KEY_ID /
 * PERF_S3_SECRET_ACCESS_KEY / PERF_S3_REGION (default: the local test identity), PERF_AWS_CLI (path to `aws`, for the
 * throughput comparison; skipped when unset), PERF_OUTPUT (test-results/perf.jsonl),
 * PERF_UPLOAD_GB (2), PERF_MEMORY_GB (5), PERF_CONCURRENCY (parallel parts, default setting 4),
 * PERF_ONLY (comma list of measurement names).
 */
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync, execSync } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const endpoint = process.env.PERF_S3_ENDPOINT ?? 'http://localhost:8333';
const identity = JSON.parse(
  readFileSync(new URL('../../docker/seaweedfs-s3.json', import.meta.url), 'utf8'),
) as { identities: { credentials: { accessKey: string; secretKey: string }[] }[] };
const keys = identity.identities[0]?.credentials[0];
const accessKeyId = process.env.PERF_S3_ACCESS_KEY_ID ?? keys?.accessKey ?? '';
const secretAccessKey = process.env.PERF_S3_SECRET_ACCESS_KEY ?? keys?.secretKey ?? '';
const region = process.env.PERF_S3_REGION ?? 'us-east-1';
const output = process.env.PERF_OUTPUT ?? 'test-results/perf.jsonl';
const only = process.env.PERF_ONLY?.split(',');
const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

const extensionPath = fileURLToPath(new URL('../../.output/chrome-mv3-e2e', import.meta.url));
const workDir = join(tmpdir(), `s3om-perf-${Date.now()}`);
mkdirSync(workDir, { recursive: true });

const admin = new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
  requestChecksumCalculation: 'WHEN_REQUIRED',
});

declare const chrome: {
  storage: { local: { set(items: object): Promise<void> } };
  downloads: {
    search(
      query: object,
    ): Promise<{ url: string; state: string; bytesReceived: number; filename: string }[]>;
  };
};

function record(name: string, data: Record<string, unknown>) {
  const line = { name, at: new Date().toISOString(), ...data };
  appendFileSync(output, `${JSON.stringify(line)}\n`);
  console.log(JSON.stringify(line));
}

function enabled(name: string) {
  return !only || only.includes(name);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** A sparse file of `bytes` with some non-zero content per MiB (fast to create). */
function makeFile(path: string, bytes: number) {
  const fd = openSync(path, 'w');
  const marker = Buffer.from('s3-object-manager perf data\n');
  for (let offset = 0; offset < bytes; offset += MiB)
    writeSync(fd, marker, 0, marker.length, offset);
  writeSync(fd, Buffer.from([1]), 0, 1, bytes - 1);
  closeSync(fd);
}

async function putMany(bucket: string, keysToPut: string[], concurrency = 64) {
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < keysToPut.length) {
        const key = keysToPut[next++] as string;
        await admin.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'x' }));
      }
    }),
  );
}

async function emptyAndDeleteBucket(bucket: string) {
  for (;;) {
    const page = await admin.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1000 }));
    const objects = (page.Contents ?? []).map((item) => ({ Key: item.Key }));
    if (objects.length === 0) break;
    await admin.send(
      new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }),
    );
  }
  await admin.send(new DeleteBucketCommand({ Bucket: bucket }));
}

/** RSS (KiB) of the extension renderer process(es) of this browser instance. */
function extensionRendererRssKiB(browserPid: number): number {
  const lines = execSync('ps -axo pid=,ppid=,rss=,command=').toString().split('\n');
  return lines
    .map((line) => line.trim().split(/\s+/))
    .filter((cols) => Number(cols[1]) === browserPid)
    .filter((cols) => {
      const command = cols.slice(3).join(' ');
      return command.includes('--type=renderer') && command.includes('--extension-process');
    })
    .reduce((sum, cols) => sum + Number(cols[2]), 0);
}

function browserPidFor(userDataDir: string): number {
  const lines = execSync('ps -axo pid=,command=').toString().split('\n');
  const line = lines.find(
    (l) => l.includes(`--user-data-dir=${userDataDir}`) && !l.includes('--type='),
  );
  return Number(line?.trim().split(/\s+/)[0]);
}

function sampleRss(browserPid: number) {
  const samples: number[] = [];
  const timer = setInterval(() => samples.push(extensionRendererRssKiB(browserPid)), 500);
  return {
    stop() {
      clearInterval(timer);
      return samples;
    },
  };
}

async function launch(): Promise<{ context: BrowserContext; page: Page; browserPid: number }> {
  const userDataDir = join(workDir, `profile-${Date.now()}`);
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    acceptDownloads: true,
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const page = await context.newPage();
  await page.goto(`chrome-extension://${new URL(worker.url()).host}/manager.html`);
  return { context, page, browserPid: browserPidFor(userDataDir) };
}

async function openBucket(page: Page, bucket: string) {
  await expect(page.getByTestId('profile-add')).toBeVisible();
  const concurrency = process.env.PERF_CONCURRENCY;
  if (concurrency) {
    // Settings are read when the page loads; saved connections survive the reload.
    await page.evaluate(
      (value) =>
        chrome.storage.local.set({
          settings: { theme: 'system', uploadConcurrency: value },
        }),
      Number(concurrency),
    );
    await page.reload();
  }
  await page.getByTestId('profile-add').click();
  await page.getByTestId('profile-name').locator('input').fill('Perf');
  await page.getByTestId('profile-endpoint').locator('input').fill(endpoint);
  await page.getByTestId('profile-default-bucket').locator('input').fill(bucket);
  await page.getByTestId('profile-access-key').locator('input').fill(accessKeyId);
  await page.getByTestId('profile-secret-key').locator('input').fill(secretAccessKey);
  await page.getByTestId('profile-save').click();
  await page.getByTestId('profile-item-Perf').click();
  await page.getByTestId('bucket-open-by-name').click();
  await page.getByTestId('bucket-name-input').locator('input').fill(bucket);
  await page.getByTestId('bucket-name-input').locator('input').press('Enter');
  await expect(page.getByTestId('crumb-bucket')).toHaveText(bucket);
}

async function uploadThroughExtension(page: Page, file: string, name: string): Promise<number> {
  const started = Date.now();
  await page.getByTestId('file-input').setInputFiles(file);
  await expect(page.getByTestId(`upload-status-${name}`).last()).toHaveAttribute(
    'data-status',
    'done',
    {
      timeout: 30 * 60_000,
    },
  );
  const seconds = (Date.now() - started) / 1000;
  await page.getByTestId('upload-queue-close').click();
  return seconds;
}

test.describe.configure({ mode: 'serial' });

test('listing a folder of 100,000 objects', async () => {
  test.skip(!enabled('listing'), 'not selected');
  const bucket = `perf-list-${Date.now()}`;
  await admin.send(new CreateBucketCommand({ Bucket: bucket }));
  const count = Number(process.env.PERF_LIST_COUNT ?? 100_000);
  await putMany(
    bucket,
    Array.from({ length: count }, (_, i) => `bulk/object-${String(i).padStart(6, '0')}.txt`),
  );

  const { context, page } = await launch();
  try {
    await openBucket(page, bucket);
    const listRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('list-type=2') && request.url().includes('prefix=bulk')) {
        listRequests.push(request.url());
      }
    });
    const started = Date.now();
    await page.getByTestId('entry-bulk/').getByRole('button').first().click();
    await expect(page.getByTestId('entry-object-000000.txt')).toBeVisible();
    const firstPageMs = Date.now() - started;
    const requestsForFirstPage = listRequests.length;

    // Scroll through the first 1,000 rows while counting long tasks (> 50 ms main-thread blocks).
    const scroll = await page.evaluate(async () => {
      const el = document.querySelector('[data-testid="object-rows"]') as HTMLElement;
      const longTasks: number[] = [];
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(entry.duration);
      });
      observer.observe({ type: 'longtask', buffered: false });
      let frames = 0;
      const start = performance.now();
      while (el.scrollTop + el.clientHeight < el.scrollHeight - 10 && frames < 2000) {
        el.scrollTop += 120;
        frames++;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      const duration = performance.now() - start;
      observer.disconnect();
      return {
        frames,
        durationMs: Math.round(duration),
        longTasks: longTasks.length,
        maxLongTaskMs: Math.round(Math.max(0, ...longTasks)),
      };
    });
    await expect.poll(() => listRequests.length).toBeGreaterThanOrEqual(2);
    record('listing', {
      objects: count,
      firstPageMs,
      requestsForFirstPage,
      requestsAfterScrollingToEnd: listRequests.length,
      scroll,
    });
    expect(requestsForFirstPage).toBe(1);
  } finally {
    await context.close();
    await emptyAndDeleteBucket(bucket);
  }
});

test('deleting a folder of 10,000 objects', async () => {
  test.skip(!enabled('delete'), 'not selected');
  const bucket = `perf-delete-${Date.now()}`;
  await admin.send(new CreateBucketCommand({ Bucket: bucket }));
  await putMany(
    bucket,
    Array.from({ length: 10_000 }, (_, i) => `many/${String(i).padStart(5, '0')}.txt`),
  );
  const { context, page } = await launch();
  try {
    await openBucket(page, bucket);
    const deleteBatches: string[] = [];
    const singleDeletes: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('?delete'))
        deleteBatches.push(request.url());
      if (request.method() === 'DELETE') singleDeletes.push(request.url());
    });
    await page.getByTestId('menu-many/').click();
    await page.getByTestId('action-delete').click();
    await expect(page.getByTestId('delete-count')).toContainText('10');
    const started = Date.now();
    await page.getByTestId('delete-confirm').click();
    await expect(page.getByTestId('entry-many/')).toHaveCount(0, { timeout: 5 * 60_000 });
    record('delete', {
      objects: 10_000,
      deleteObjectsRequests: deleteBatches.length,
      folderEntryDeletes: singleDeletes.length,
      seconds: (Date.now() - started) / 1000,
    });
    expect(deleteBatches.length).toBeLessThanOrEqual(10);
  } finally {
    await context.close();
    await emptyAndDeleteBucket(bucket);
  }
});

test('upload throughput compared with aws s3 cp', async () => {
  test.skip(!enabled('throughput'), 'not selected');
  const aws = process.env.PERF_AWS_CLI;
  const size = Number(process.env.PERF_UPLOAD_GB ?? 2) * GiB;
  const file = join(workDir, 'throughput.bin');
  makeFile(file, size);
  const extensionRuns: number[] = [];
  const awsRuns: number[] = [];
  try {
    for (let run = 0; run < 3; run++) {
      const bucket = `perf-tp-${Date.now()}`;
      await admin.send(new CreateBucketCommand({ Bucket: bucket }));
      const { context, page } = await launch();
      try {
        await openBucket(page, bucket);
        extensionRuns.push(await uploadThroughExtension(page, file, 'throughput.bin'));
      } finally {
        await context.close();
        await emptyAndDeleteBucket(bucket);
      }
      if (aws) {
        const awsBucket = `perf-aws-${Date.now()}`;
        await admin.send(new CreateBucketCommand({ Bucket: awsBucket }));
        const started = Date.now();
        execFileSync(
          aws,
          [
            's3',
            'cp',
            file,
            `s3://${awsBucket}/throughput.bin`,
            '--endpoint-url',
            endpoint,
            '--only-show-errors',
          ],
          {
            env: {
              ...process.env,
              AWS_ACCESS_KEY_ID: accessKeyId,
              AWS_SECRET_ACCESS_KEY: secretAccessKey,
              AWS_DEFAULT_REGION: region,
              AWS_REQUEST_CHECKSUM_CALCULATION: 'when_required',
            },
          },
        );
        awsRuns.push((Date.now() - started) / 1000);
        await emptyAndDeleteBucket(awsBucket);
      }
    }
  } finally {
    rmSync(file, { force: true });
  }
  const mb = size / MiB;
  const extensionMedian = median(extensionRuns);
  const awsMedian = awsRuns.length ? median(awsRuns) : undefined;
  record('throughput', {
    bytes: size,
    concurrency: Number(process.env.PERF_CONCURRENCY ?? 4),
    extensionSeconds: extensionRuns,
    awsSeconds: awsRuns,
    extensionMiBps: Math.round(mb / extensionMedian),
    awsMiBps: awsMedian ? Math.round(mb / awsMedian) : undefined,
    ratio: awsMedian ? Number((awsMedian / extensionMedian).toFixed(2)) : undefined,
  });
});

test('memory while uploading and downloading a large file', async () => {
  test.skip(!enabled('memory'), 'not selected');
  const size = Number(process.env.PERF_MEMORY_GB ?? 5) * GiB;
  const bucket = `perf-mem-${Date.now()}`;
  await admin.send(new CreateBucketCommand({ Bucket: bucket }));
  const file = join(workDir, 'memory.bin');
  makeFile(file, size);
  const { context, page, browserPid } = await launch();
  try {
    await openBucket(page, bucket);
    await page.waitForTimeout(2000);
    const uploadBaseline = extensionRendererRssKiB(browserPid);
    const uploadSampler = sampleRss(browserPid);
    const uploadSeconds = await uploadThroughExtension(page, file, 'memory.bin');
    const uploadSamples = uploadSampler.stop();
    rmSync(file, { force: true });

    await page.getByTestId('refresh').click();
    await expect(page.getByTestId('entry-memory.bin')).toBeVisible();
    await page.waitForTimeout(2000);
    const downloadBaseline = extensionRendererRssKiB(browserPid);
    const downloadSampler = sampleRss(browserPid);
    const started = Date.now();
    await page.getByTestId('menu-memory.bin').click();
    await page.getByTestId('action-download').click();
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const items = await chrome.downloads.search({});
            const item = items.find((d) => d.url.includes('memory.bin'));
            return item ? `${item.state}:${item.bytesReceived}` : 'none';
          }),
        { timeout: 30 * 60_000, intervals: [1000] },
      )
      .toBe(`complete:${size}`);
    const downloadSeconds = (Date.now() - started) / 1000;
    const downloadSamples = downloadSampler.stop();
    const downloaded = await page.evaluate(async () => {
      const items = await chrome.downloads.search({});
      return items.find((d) => d.url.includes('memory.bin'))?.filename;
    });
    if (downloaded) rmSync(downloaded, { force: true });

    const peakDelta = (samples: number[], baseline: number) =>
      Math.round((Math.max(baseline, ...samples) - baseline) / 1024);
    record('memory', {
      bytes: size,
      uploadSeconds,
      uploadBaselineMiB: Math.round(uploadBaseline / 1024),
      uploadPeakDeltaMiB: peakDelta(uploadSamples, uploadBaseline),
      uploadThresholdMiB: 4 * 8 + 50,
      downloadSeconds,
      downloadBaselineMiB: Math.round(downloadBaseline / 1024),
      downloadPeakDeltaMiB: peakDelta(downloadSamples, downloadBaseline),
      samples: { upload: uploadSamples.length, download: downloadSamples.length },
    });
  } finally {
    await context.close();
    rmSync(file, { force: true });
    await emptyAndDeleteBucket(bucket);
  }
});

test.afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});
