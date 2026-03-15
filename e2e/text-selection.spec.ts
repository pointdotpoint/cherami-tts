import { test, expect, createTestPage, injectTestContent, selectTextAndWaitForPopup, getPopupShadow } from './fixtures.ts';

test.describe('Text selection popup', () => {
  test('popup appears on text selection', async ({ context }) => {
    const page = await createTestPage(context);
    await injectTestContent(page, '<p id="target">This is a test paragraph with enough text to select.</p>');

    await selectTextAndWaitForPopup(page, '#target');

    const shadow = getPopupShadow(page);
    await expect(shadow.locator('button[title="Speak selected text"]')).toBeVisible();

    await page.close();
  });

  test('no popup for short selections', async ({ context }) => {
    const page = await createTestPage(context);
    await injectTestContent(page, '<p><span id="short">Hi</span> and some more text</p>');

    await page.evaluate(() => {
      const el = document.querySelector('#short')!;
      const range = document.createRange();
      range.selectNodeContents(el);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
    });
    await page.dispatchEvent('#short', 'mouseup');

    await page.waitForTimeout(400);

    const shadow = getPopupShadow(page);
    await expect(shadow).toBeHidden();

    await page.close();
  });

  test('popup hides on scroll', async ({ context }) => {
    const page = await createTestPage(context);
    await injectTestContent(page, `
      <div style="height: 3000px;">
        <p id="target" style="margin-top: 100px;">This is a test paragraph with selectable text content.</p>
      </div>
    `);

    await selectTextAndWaitForPopup(page, '#target');

    const shadow = getPopupShadow(page);
    await expect(shadow).toBeVisible();

    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(100);

    await expect(shadow).toBeHidden();

    await page.close();
  });
});
