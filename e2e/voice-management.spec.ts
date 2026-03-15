import { test, expect } from './fixtures.ts';

test.describe('Voice management', () => {
  test('download voice, verify cached state, then remove', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options/options.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const voiceItem = page.locator('#voice-en_US-lessac-low');

    await expect(voiceItem.locator('button:has-text("Download")')).toBeVisible();

    await voiceItem.locator('button:has-text("Download")').click();

    await expect(voiceItem.locator('.progress-bar')).toBeVisible({ timeout: 10_000 });
    await expect(voiceItem.locator('.badge-cached')).toBeVisible({ timeout: 120_000 });

    await expect(voiceItem.locator('button:has-text("Remove")')).toBeVisible();

    await voiceItem.locator('button:has-text("Remove")').click();

    await expect(voiceItem.locator('button:has-text("Download")')).toBeVisible({ timeout: 5_000 });

    await page.close();
  });

  test('custom voice upload appears in voice list and selector', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options/options.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    await page.locator('#upload-name').fill('Test Voice');

    const dummyOnnx = Buffer.from('fake-onnx-model-data');
    await page.locator('#upload-onnx').setInputFiles({
      name: 'test-voice.onnx',
      mimeType: 'application/octet-stream',
      buffer: dummyOnnx,
    });

    const dummyConfig = JSON.stringify({
      audio: { sample_rate: 22050 },
      inference: { length_scale: 1.0 },
    });
    await page.locator('#upload-config').setInputFiles({
      name: 'test-voice.onnx.json',
      mimeType: 'application/json',
      buffer: Buffer.from(dummyConfig),
    });

    await page.locator('#upload-btn').click();

    await expect(page.locator('.alert-success')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#custom-voice-list')).toContainText('Test Voice');

    const selected = await page.locator('#voice-select').inputValue();
    expect(selected).toBe('custom:test-voice');

    await page.close();
  });
});
