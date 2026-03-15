import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { seedVoice } from './helpers/seed-voice.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cherami-e2e-'));
    const context = await chromium.launchPersistentContext(tmpDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${DIST}`,
        `--load-extension=${DIST}`,
        '--no-first-run',
        '--disable-default-apps',
      ],
    });
    await use(context);
    await context.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  },

  extensionId: async ({ context }, use) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker');
    }
    const url = sw.url();
    const match = url.match(/chrome-extension:\/\/([^/]+)/);
    if (!match) {
      throw new Error(`Could not extract extension ID from service worker URL: ${url}`);
    }
    await use(match[1]);
  },
});

export async function createTestPage(
  context: BrowserContext,
  url: string = 'https://example.com'
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  // Wait for content script to inject
  await page.waitForTimeout(1000);
  return page;
}

export async function injectTestContent(page: Page, html: string): Promise<void> {
  await page.evaluate((htmlContent) => {
    const popup = document.querySelector('cherami-tts-popup');
    document.body.innerHTML = htmlContent;
    if (popup) document.body.appendChild(popup);
  }, html);
}

export async function selectTextAndWaitForPopup(
  page: Page,
  selector: string
): Promise<void> {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Element not found: ${sel}`);
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  }, selector);

  await page.dispatchEvent(selector, 'mouseup');

  // Wait for popup (200ms debounce + rendering)
  await page.waitForFunction(() => {
    const host = document.querySelector('cherami-tts-popup');
    if (!host) return false;
    const container = host.shadowRoot?.querySelector('.popup') as HTMLElement;
    return container?.style.display !== 'none';
  }, {}, { timeout: 5000 });
}

export function getPopupShadow(page: Page) {
  return page.locator('cherami-tts-popup .popup');
}

export { seedVoice };
export { expect } from '@playwright/test';
