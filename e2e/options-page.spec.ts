import { test, expect, seedVoice } from './fixtures.ts';

test.describe('Options page', () => {
  test('voice selector populated with available voices', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options/options.html`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for the voice selector to be populated (init() is async)
    const voiceSelect = page.locator('#voice-select');
    await expect(voiceSelect.locator('option')).not.toHaveCount(0, { timeout: 10_000 });

    const count = await voiceSelect.locator('option').count();
    expect(count).toBeGreaterThanOrEqual(10);

    const lessacOption = voiceSelect.locator('option[value="en_US-lessac-medium"]');
    await expect(lessacOption).toHaveCount(1);

    await page.close();
  });

  test('speed setting persists across reload', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options/options.html`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for init
    await expect(page.locator('#voice-select option')).not.toHaveCount(0, { timeout: 10_000 });

    // Set speed via evaluate to ensure the value and event both fire correctly
    await page.evaluate(() => {
      const slider = document.getElementById('speed-slider') as HTMLInputElement;
      slider.value = '1.5';
      slider.dispatchEvent(new Event('input'));
    });

    await page.waitForTimeout(300);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#voice-select option')).not.toHaveCount(0, { timeout: 10_000 });

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
    await expect(page.locator('#voice-select option')).not.toHaveCount(0, { timeout: 10_000 });

    await page.locator('#voice-select').selectOption('en_US-amy-medium');
    await page.waitForTimeout(300);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#voice-select option')).not.toHaveCount(0, { timeout: 10_000 });

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
    await expect(page.locator('#voice-select option')).not.toHaveCount(0, { timeout: 10_000 });

    await page.locator('#voice-select').selectOption('en_US-lessac-low');
    await page.waitForTimeout(200);

    await page.locator('#test-text').fill('Hello world.');
    await page.locator('#test-voice-btn').click();

    // Button should change to "Stop" during playback
    await expect(page.locator('#test-voice-btn')).toHaveText('Stop', { timeout: 30_000 });

    // Wait for it to finish and return to "Test voice"
    await expect(page.locator('#test-voice-btn')).toHaveText('Test voice', { timeout: 30_000 });

    await page.close();
  });
});
