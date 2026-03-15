import { test, expect, createTestPage, injectTestContent, selectTextAndWaitForPopup, getPopupShadow, seedVoice } from './fixtures.ts';

const LONG_TEXT = 'The quick brown fox jumps over the lazy dog. ' +
  'Pack my box with five dozen liquor jugs. ' +
  'How vexingly quick daft zebras jump. ' +
  'The five boxing wizards jump quickly. ' +
  'Jackdaws love my big sphinx of quartz.';

test.describe('Stop speech', () => {
  test('stop halts playback during speaking', async ({ context, extensionId }) => {
    const seedPage = await context.newPage();
    await seedVoice(seedPage, extensionId);
    await seedPage.close();

    const page = await createTestPage(context);
    await injectTestContent(page, `<p id="target">${LONG_TEXT}</p>`);

    await selectTextAndWaitForPopup(page, '#target');

    const shadow = getPopupShadow(page);
    await shadow.locator('button[title="Speak selected text"]').click();

    await expect(shadow.locator('button.speaking')).toBeVisible({ timeout: 30_000 });

    await shadow.locator('button.speaking').click();

    await expect(shadow).toBeHidden({ timeout: 5_000 });

    await page.close();
  });

  test('no further state changes after stop', async ({ context, extensionId }) => {
    const seedPage = await context.newPage();
    await seedVoice(seedPage, extensionId);
    await seedPage.close();

    const page = await createTestPage(context);
    await injectTestContent(page, `<p id="target">${LONG_TEXT}</p>`);

    await selectTextAndWaitForPopup(page, '#target');

    const shadow = getPopupShadow(page);
    await shadow.locator('button[title="Speak selected text"]').click();

    await expect(shadow.locator('button.speaking')).toBeVisible({ timeout: 30_000 });

    await shadow.locator('button.speaking').click();

    await expect(shadow).toBeHidden({ timeout: 5_000 });

    await page.waitForTimeout(2000);

    const popupDisplay = await page.evaluate(() => {
      const host = document.querySelector('cherami-tts-popup');
      const popup = host?.shadowRoot?.querySelector('.popup') as HTMLElement;
      return popup?.style.display;
    });
    expect(popupDisplay).toBe('none');

    await page.close();
  });
});
