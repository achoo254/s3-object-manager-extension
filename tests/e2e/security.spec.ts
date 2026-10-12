/**
 * Dynamic security checks against the running extension: hostile object names and server
 * responses must render as text, credentials must never leave in clear, the extension may only
 * talk to the configured endpoint, and web pages must not be able to frame or read its pages.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Page, Request } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  accessKeyId,
  addConnection,
  createBucket,
  endpoint,
  entryAction,
  openBucket,
  openFolder,
  putObjects,
  removeBucket,
  secretAccessKey,
} from './s3-env';

declare const chrome: {
  storage: { local: { get(keys: null): Promise<Record<string, unknown>> } };
  downloads: { search(query: object): Promise<{ url: string; filename: string; state: string }[]> };
  runtime: { getManifest(): Record<string, unknown> };
};
declare global {
  interface Window {
    __pwned?: string;
  }
}

const bucket = `e2e-${Date.now()}-s`;
const payloads = {
  img: '<img src=x onerror="window.__pwned=\'img\'">.txt',
  svg: '"><svg onload="window.__pwned=\'svg\'">.txt',
  template: '{{constructor.constructor(\'window.__pwned="tpl"\')()}}.txt',
  folder: '<b onmouseover="window.__pwned=\'folder\'">bold<b>/',
  // Servers refuse `..` segments themselves (and some turn `\\` into `/`), so this checks the
  // characters a file name may not contain; path handling is covered by unit tests.
  traversal: 'report:2026?.bat',
};

/** Escape is swallowed when focus sits in a field, so use the dialog's own button. */
async function closeDialog(page: Page): Promise<void> {
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

const pwned = (page: Page) => page.evaluate(() => window.__pwned ?? null);

test.beforeAll(async () => {
  await createBucket(bucket);
  await putObjects(bucket, {
    [payloads.img]: 'img',
    [payloads.svg]: 'svg',
    [payloads.template]: 'tpl',
    [`${payloads.folder}inside.txt`]: 'inside',
    [payloads.traversal]: 'echo hi',
  });
});

test.afterAll(async () => {
  await removeBucket(bucket);
});

test('hostile object and connection names render as plain text', async ({
  manager: page,
  pageErrors,
}) => {
  const hostileName = '<img src=x onerror="window.__pwned=\'profile\'">';
  await addConnection(page, { name: hostileName, bucket });
  await expect(page.getByTestId(`profile-item-${hostileName}`)).toContainText(hostileName);
  await openBucket(page, bucket);

  for (const name of [payloads.img, payloads.svg, payloads.template]) {
    await expect(page.getByTestId(`entry-${name}`)).toContainText(name);
    // Every dialog that shows the key: properties, share, rename, delete.
    await entryAction(page, name, 'properties');
    await expect(page.getByRole('dialog')).toContainText(name);
    await closeDialog(page);
    await entryAction(page, name, 'share');
    await expect(page.getByTestId('share-url').locator('input')).toHaveValue(/X-Amz-Signature=/);
    await closeDialog(page);
    await entryAction(page, name, 'rename');
    await expect(page.getByTestId('transfer-target').locator('input')).toHaveValue(name);
    await page.getByTestId('transfer-dismiss').click();
    await entryAction(page, name, 'delete');
    await expect(page.getByTestId('delete-count')).toContainText('1 object');
    await page.getByTestId('delete-dismiss').click();
  }
  const folderName = payloads.folder;
  await page.getByTestId(`entry-${folderName}`).hover();
  await openFolder(page, folderName);
  await expect(page.getByTestId('entry-inside.txt')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Current location' })).toContainText(
    folderName.slice(0, -1),
  );

  expect(await pwned(page)).toBeNull();
  expect(pageErrors).toEqual([]);
});

test('a hostile server error message is shown as text', async ({ context, manager: page }) => {
  await addConnection(page, { name: 'Local S3', bucket });
  await context.route(
    (url) => url.href.startsWith(endpoint) && url.searchParams.get('list-type') === '2',
    (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/xml',
        body:
          '<?xml version="1.0" encoding="UTF-8"?><Error><Code>AccessDenied</Code>' +
          '<Message>&lt;img src=x onerror="window.__pwned=\'error\'"&gt;</Message></Error>',
      }),
  );
  await page.getByTestId('bucket-list').getByText(bucket, { exact: true }).click();
  await expect(page.getByText('Access denied')).toBeVisible();
  expect(await pwned(page)).toBeNull();
});

test('credentials stay local: storage, network and console', async ({ context, manager: page }) => {
  const requests: Request[] = [];
  const consoleLines: string[] = [];
  context.on('request', (request) => requests.push(request));
  page.on('console', (message) => consoleLines.push(message.text()));

  await addConnection(page, { name: 'Local S3', bucket });
  await openBucket(page, bucket);
  await entryAction(page, payloads.img, 'share');
  await closeDialog(page);
  await entryAction(page, payloads.img, 'download');
  await expect
    .poll(() => page.evaluate(async () => (await chrome.downloads.search({})).length))
    .toBe(1);

  // Encrypted at rest: neither key appears in extension storage.
  const stored = JSON.stringify(await page.evaluate(() => chrome.storage.local.get(null)));
  expect(stored).not.toContain(secretAccessKey);
  expect(stored).not.toContain(accessKeyId);

  // Only the extension itself and the configured endpoint are contacted.
  const endpointOrigin = new URL(endpoint).origin;
  const origins = new Set(requests.map((request) => new URL(request.url()).origin));
  for (const origin of origins) {
    expect(
      origin === endpointOrigin || origin.startsWith('chrome-extension://'),
      `unexpected request to ${origin}`,
    ).toBe(true);
  }
  expect([...origins]).toContain(endpointOrigin);

  // The secret key signs requests but is never sent, logged or put in a URL.
  for (const request of requests) {
    expect(request.url()).not.toContain(secretAccessKey);
    expect(JSON.stringify(await request.allHeaders())).not.toContain(secretAccessKey);
    expect(request.postData() ?? '').not.toContain(secretAccessKey);
  }
  expect(consoleLines.join('\n')).not.toContain(secretAccessKey);
});

test('downloaded file names cannot escape the downloads folder', async ({ manager: page }) => {
  await addConnection(page, { name: 'Local S3', bucket });
  await openBucket(page, bucket);
  const download = page.waitForEvent('download');
  await entryAction(page, payloads.traversal, 'download');
  // Only the last segment is used, with reserved characters replaced. (Chrome may still adjust
  // the extension of executable types, so only the stem is compared.)
  expect((await download).suggestedFilename()).toMatch(/^report_2026_\.[a-z]+$/);
});

test('the manifest asks for the minimum and exposes nothing to web pages', async ({
  manager: page,
}) => {
  const manifest = await page.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.permissions).toEqual(['storage', 'downloads']);
  expect(manifest.optional_host_permissions).toEqual([
    'https://*/*',
    'http://localhost/*',
    'http://127.0.0.1/*',
  ]);
  // Default MV3 policy (no remote or eval'd code), nothing reachable from the web.
  expect(manifest.content_security_policy).toBeUndefined();
  expect(manifest.externally_connectable).toBeUndefined();
  expect(manifest.web_accessible_resources).toBeUndefined();
  expect(manifest.content_scripts).toBeUndefined();
});

test('web pages can neither frame nor read the extension pages', async ({
  context,
  extensionId,
}) => {
  const managerUrl = `chrome-extension://${extensionId}/manager.html`;
  const server: Server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><iframe id="f" src="${managerUrl}"></iframe>`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForTimeout(1000);
    const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
    // Blocked frames end on Chrome's error page instead of the extension.
    expect(
      frame?.url().startsWith('chrome-extension://') ? await frame.title() : 'blocked',
    ).not.toBe('S3 Object Manager');
    const readable = await page.evaluate(async (url) => {
      try {
        await fetch(url);
        return true;
      } catch {
        return false;
      }
    }, managerUrl);
    expect(readable).toBe(false);
  } finally {
    server.close();
  }
});
