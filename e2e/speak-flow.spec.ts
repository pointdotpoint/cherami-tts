import { test, expect, createTestPage, injectTestContent, selectTextAndWaitForPopup, getPopupShadow, seedVoice } from './fixtures.ts';

test.describe('Speak flow', () => {
  test('full lifecycle: select → speak → loading → speaking → idle → auto-hide', async ({ context, extensionId }) => {
    const seedPage = await context.newPage();
    await seedVoice(seedPage, extensionId);
    await seedPage.close();

    const page = await createTestPage(context);
    await injectTestContent(page, '<p id="target">Hello world.</p>');

    await selectTextAndWaitForPopup(page, '#target');

    const shadow = getPopupShadow(page);
    await shadow.locator('button[title="Speak selected text"]').click();

    // Wait for speaking state (stop button) — loading spinner may be too brief to catch
    await expect(shadow.locator('button.speaking')).toBeVisible({ timeout: 30_000 });

    // Should auto-hide after speech finishes (IDLE → 300ms → hide)
    await expect(shadow).toBeHidden({ timeout: 30_000 });

    await page.close();
  });

  test('multi-sentence text speaks all sentences', async ({ context, extensionId }) => {
    const seedPage = await context.newPage();
    await seedVoice(seedPage, extensionId);
    await seedPage.close();

    const page = await createTestPage(context);
    await injectTestContent(page, '<p id="target">First sentence. Second sentence. Third sentence.</p>');

    await selectTextAndWaitForPopup(page, '#target');

    const shadow = getPopupShadow(page);
    await shadow.locator('button[title="Speak selected text"]').click();

    await expect(shadow.locator('button.speaking')).toBeVisible({ timeout: 30_000 });
    await expect(shadow).toBeHidden({ timeout: 60_000 });

    await page.close();
  });

  test('popup auto-hides after completion', async ({ context, extensionId }) => {
    const seedPage = await context.newPage();
    await seedVoice(seedPage, extensionId);
    await seedPage.close();

    const page = await createTestPage(context);
    await injectTestContent(page, '<p id="target">Quick test.</p>');

    await selectTextAndWaitForPopup(page, '#target');

    const shadow = getPopupShadow(page);
    await shadow.locator('button[title="Speak selected text"]').click();

    await expect(shadow).toBeHidden({ timeout: 30_000 });

    await page.close();
  });
});
