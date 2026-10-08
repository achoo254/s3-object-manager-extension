import { chromium, test as base, type BrowserContext, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const extensionPath = fileURLToPath(new URL('../../.output/chrome-mv3-e2e', import.meta.url));

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  manager: Page;
  /** Uncaught errors and console errors (CSP violations included) of the manager page. */
  pageErrors: string[];
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      acceptDownloads: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(new URL(worker.url()).host);
  },
  // eslint-disable-next-line no-empty-pattern
  pageErrors: async ({}, use) => {
    await use([]);
  },
  manager: async ({ context, extensionId, pageErrors }, use) => {
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      // Chrome logs every non-2xx response; expected ones (e.g. a 404 from HeadObject while
      // checking that a rename target is free) are not application errors.
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
        pageErrors.push(message.text());
      }
    });
    await page.goto(`chrome-extension://${extensionId}/manager.html`);
    await use(page);
  },
});

export const expect = test.expect;
