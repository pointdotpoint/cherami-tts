import { test, expect, seedVoice } from './fixtures.ts';

test.describe('Options page', () => {
  test('voice selector populated with available voices', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options/options.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const voiceSelect = page.locator('#voice-select');
    const options = voiceSelect.locator('option');
    const count = await options.count();

    expect(count).toBeGreaterThanOrEqual(10);

    const lessacOption = voiceSelect.locator('option[value="en_US-lessac-medium"]');
    await expect(lessacOption).toHaveCount(1);

    await page.close();
  });

  test('speed setting persists across reload', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options/options.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    await page.locator('#speed-slider').fill('1.5');
    await page.locator('#speed-slider').dispatchEvent('input');

    await page.waitForTimeout(300);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const value = await page.locator('#speed-slider').inputValue();
    expect(value).toBe('1.5');

    const display = await page.locator('#speed-value').textContent();
    expect(display).toBe('1.5x');

    await page.close();
  });

  test('voice selection persists across reload', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options/options.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    await page.locator('#voice-select').selectOption('en_US-amy-medium');
    await page.waitForTimeout(300);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const selected = await page.locator('#voice-select').inputValue();
    expect(selected).toBe('en_US-amy-medium');

    await page.close();
  });

  test('test voice button plays audio with seeded voice', async ({ context, extensionId }) => {
    const seedPage = await context.newPage();
    await seedVoice(seedPage, extensionId);
    await seedPage.close();

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options/options.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    await page.locator('#voice-select').selectOption('en_US-lessac-low');
    await page.waitForTimeout(200);

    await page.locator('#test-text').fill('Hello world.');
    await page.locator('#test-voice-btn').click();

    await expect(page.locator('#test-voice-btn')).toHaveText('Stop', { timeout: 30_000 });
    await expect(page.locator('#test-voice-btn')).toHaveText('Test voice', { timeout: 30_000 });

    await page.close();
  });
});
