import { test, expect, createTestPage, injectTestContent, selectTextAndWaitForPopup, getPopupShadow, seedVoice } from './fixtures.ts';

test.describe('Context menu (simulated)', () => {
  test('speech triggered from service worker reaches offscreen doc', async ({ context, extensionId }) => {
    const seedPage = await context.newPage();
    await seedVoice(seedPage, extensionId);
    await seedPage.close();

    const page = await createTestPage(context);
    await injectTestContent(page, '<p id="target">Context menu test text.</p>');

    await page.waitForTimeout(500);

    const sw = context.serviceWorkers().find(w =>
      w.url().includes(extensionId)
    );
    expect(sw).toBeTruthy();

    const consoleMessages: string[] = [];
    page.on('console', msg => consoleMessages.push(msg.text()));

    await sw!.evaluate(async () => {
      await chrome.runtime.sendMessage({
        type: 'SPEAK',
        text: 'Context menu test text.',
        voiceId: 'en_US-lessac-low',
        speed: 1.0,
      });
    });

    await page.waitForTimeout(5_000);

    await page.close();
  });

  test('service worker routes TTS_STATE to active tab', async ({ context, extensionId }) => {
    const seedPage = await context.newPage();
    await seedVoice(seedPage, extensionId);
    await seedPage.close();

    const page = await createTestPage(context);
    await injectTestContent(page, '<p id="target">Test for state routing back to tab.</p>');

    await selectTextAndWaitForPopup(page, '#target');

    const shadow = getPopupShadow(page);
    await shadow.locator('button[title="Speak selected text"]').click();

    await expect(shadow.locator('button.speaking')).toBeVisible({ timeout: 30_000 });

    await shadow.locator('button.speaking').click();
    await page.waitForTimeout(1000);

    await page.close();
  });
});
