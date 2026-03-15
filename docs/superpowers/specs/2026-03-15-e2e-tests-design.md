# E2E Test Infrastructure for cherami-tts

## Context

The extension has unit tests (vitest) covering isolated logic but no end-to-end tests verifying the real Chrome extension wiring — Shadow DOM popup, service worker lifecycle, offscreen document creation, cross-component messaging, and actual TTS synthesis. E2E tests load the built extension in a real Chrome instance and exercise user-facing flows.

## Approach

**Playwright Test** with system-installed Chrome, loading the built extension via `--load-extension` flag. A real voice model (`en_US-lessac-low`, ~16MB) is downloaded once and cached locally, then seeded into IndexedDB per-test for fast setup.

## New Dependencies

- `@playwright/test` (dev) — test runner with Chrome extension support

## Directory Structure

```
e2e/
├── playwright.config.ts        — config: system Chrome, extension loading
├── fixtures.ts                 — shared fixture (browser context, extension ID, helpers)
├── global-setup.ts             — build extension + download voice model once
├── helpers/
│   └── seed-voice.ts           — seed voice model into IndexedDB via page.evaluate
├── text-selection.spec.ts      — select text → popup appears
├── speak-flow.spec.ts          — full speak lifecycle
├── stop-speech.spec.ts         — stop mid-speech
├── context-menu.spec.ts        — right-click context menu
├── options-page.spec.ts        — settings UI
└── voice-management.spec.ts    — download/remove voices
.test-cache/                    — gitignored, holds downloaded voice model files
```

## Infrastructure

### playwright.config.ts

- Uses `chromium` project with `channel: 'chrome'` to use system Chrome
- Sets `headless: false` (Chrome extensions require headed mode — `--headless=new` doesn't support extensions)
- Timeout: 60s per test (TTS synthesis is slow)
- Retries: 0 (deterministic tests)
- Test directory: `e2e/`
- Workers: 1 (serial execution — extensions share a single browser profile)

### CI / Display Requirements

Chrome extensions require headed mode. On Linux CI runners without a physical display, use `xvfb-run`:

```bash
xvfb-run npm run test:e2e
```

### global-setup.ts

Runs once before the test suite:

1. Executes `npm run build` to produce fresh `dist/`
2. Verifies `dist/manifest.json` exists — fails with a clear error if build did not succeed
3. Checks `.test-cache/en_US-lessac-low.onnx` and `.test-cache/en_US-lessac-low.onnx.json`
4. If missing, fetches both files from HuggingFace (`https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/low/en_US-lessac-low.onnx` and `.onnx.json`)
5. Saves to `.test-cache/` for subsequent runs

### fixtures.ts

Custom Playwright fixture providing:

- **`context`** — `BrowserContext` via `chromium.launchPersistentContext()` with a temp user-data dir and flags:
  - `--disable-extensions-except=<absolute-path-to-dist>`
  - `--load-extension=<absolute-path-to-dist>`
  - `--no-first-run`
  - `--disable-default-apps`
- **`extensionId`** — extracted from the service worker URL. The fixture waits for the service worker to register using `context.waitForEvent('serviceworker')` (or polls `context.serviceWorkers()` with a timeout) before extracting the ID from the `chrome-extension://<id>/...` URL pattern. This avoids race conditions on startup.
- **`optionsPage()`** — opens `chrome-extension://{extensionId}/options/options.html`
- **`seedVoice(page)`** — navigates to the **options page** (not the offscreen doc, to avoid interfering with the offscreen document lifecycle managed by the service worker), injects cached model into IndexedDB and sets `chrome.storage.sync` to select `en_US-lessac-low`
- **`waitForPopup(page)`** — locates the `<cherami-tts-popup>` element and accesses its shadow DOM. See "Closed Shadow DOM Strategy" below.

**Test isolation:** Each test gets a fresh `BrowserContext` with a new temp user-data directory. This guarantees clean IndexedDB, storage, and extension state between tests. No state leaks.

### Closed Shadow DOM Strategy

The floating popup uses `mode: 'closed'` shadow DOM, which means `element.shadowRoot` returns `null` from outside the component — both from Playwright selectors and from `page.evaluate`.

**Solution:** Use `page.addInitScript` to monkey-patch `Element.prototype.attachShadow` before any scripts run, forcing closed shadows to be accessible:

```js
page.addInitScript(() => {
  const original = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function(init) {
    const shadow = original.call(this, { ...init, mode: 'open' });
    this._shadowRoot = shadow;
    return shadow;
  };
});
```

This must be called on each new page **before navigation**, which ensures it runs before Chrome injects the content script. The content script runs at `document_idle` by default (per manifest.json — no `run_at` override), so `addInitScript` (which runs at document creation) will execute first.

`waitForPopup(page)` then locates `<cherami-tts-popup>` and accesses its now-open `.shadowRoot` via normal Playwright locators or `page.evaluate(el => el.shadowRoot, element)`.

### seed-voice.ts

Helper that:
1. Reads `.test-cache/en_US-lessac-low.onnx` and `.onnx.json` from disk (via `fs.readFileSync` in Node, passed as buffer to `page.evaluate`)
2. Navigates to the **options page** (`chrome-extension://{id}/options/options.html`)
3. Uses `page.evaluate()` to:
   - Open IndexedDB (`cherami-tts-voices` database, `models` store)
   - Write a `CachedModel` entry with the model blob and config
   - Set `chrome.storage.sync` values: `selectedVoice = 'en_US-lessac-low'`, `speed = 1.0`

**Note:** The extension's `DEFAULT_VOICE` is `en_US-lessac-medium`, but tests use `en_US-lessac-low` for speed. The seed helper always explicitly sets the selected voice to `en_US-lessac-low` in storage, so no test accidentally tries to use the undownloaded medium model. Tests in `voice-management.spec.ts` that skip seeding do not trigger speech synthesis, so the mismatch is safe.

## Test Scenarios

### 1. text-selection.spec.ts (~3 tests)

- **Popup appears on text selection**: Navigate to a page with known text. Select text via `page.evaluate` (create Range + Selection). Dispatch `mouseup`. **Wait at least 200ms** (the content script debounces selection handling) or use `page.waitForSelector('cherami-tts-popup')`. Assert popup appears with speak button in its shadow root.
- **No popup for short selections**: Select text shorter than 3 characters. Wait 300ms. Assert popup does not appear.
- **Popup hides on scroll**: Select text, verify popup appears, scroll the page, verify popup hides.

### 2. speak-flow.spec.ts (~3 tests)

Prerequisites: voice seeded into IndexedDB.

- **Full lifecycle**: Select text, click speak button in shadow DOM. Wait for popup to show loading state, then speaking state, then auto-hide after IDLE. **Note:** The popup auto-hides 300ms after IDLE — assertions should either catch the state during the SPEAKING phase or wait for the popup to disappear entirely.
- **Multi-sentence text**: Select text with multiple sentences. Verify popup stays in SPEAKING until all sentences are spoken, then transitions to IDLE.
- **Popup auto-hides after completion**: After speech finishes (IDLE state), verify the popup element is removed from the DOM within ~1s.

### 3. stop-speech.spec.ts (~2 tests)

Prerequisites: voice seeded, long text prepared (multiple sentences to ensure synthesis takes long enough to catch).

- **Stop halts playback**: Select a long paragraph, click speak, wait for SPEAKING state, click stop. Verify popup shows STOPPED state.
- **No further state changes after stop**: After stopping, wait 2s and verify no SPEAKING or IDLE states appear (monitor via `page.evaluate` polling the popup's inner text/state).

### 4. context-menu.spec.ts (~2 tests)

Prerequisites: voice seeded.

Playwright cannot interact with Chrome's native context menus. Instead of trying to simulate the `chrome.contextMenus.onClicked` event (which cannot be dispatched programmatically), we simulate what the context menu handler does: it sends a `SPEAK` message via the service worker to the offscreen document with the selected text and active tab ID.

**Approach:** Get the service worker via `context.serviceWorkers()`. Use `serviceWorker.evaluate()` to call `chrome.runtime.sendMessage()` with a `SPEAK` message containing the test text, voice ID, and speed. Then observe the content script's popup state transitions on the page, verifying the full message flow from service worker → offscreen → back to content script.

- **Context menu triggers speech**: Select text, send SPEAK message from service worker context. Verify TTS state transitions occur in the content script popup.
- **Service worker forwards state to tab**: Verify that `TTS_STATE` messages arrive at the content script and update the popup UI.

### 5. options-page.spec.ts (~4 tests)

- **Voice selector populated**: Open options page. Verify voice dropdown contains available voices from the `AVAILABLE_VOICES` catalog.
- **Speed setting persists**: Change speed slider value. Reload page. Verify slider retains the new value.
- **Voice selection persists**: Change selected voice. Reload page. Verify selection is retained.
- **Test voice button plays audio**: Seed voice, open options page. Enter sample text, click test button. Verify speaking state appears (button changes to stop state) and eventually completes.

### 6. voice-management.spec.ts (~4 tests)

These tests start with a clean IndexedDB (no seeding). They do NOT trigger speech synthesis, so the `DEFAULT_VOICE` / `en_US-lessac-low` mismatch is not a concern.

- **Download voice**: Open options page. Click download button for `en_US-lessac-low`. Verify progress bar appears and reaches 100%. Verify voice shows "Cached" badge afterward. **Note:** This test downloads ~16MB from HuggingFace. It is inherently slow and network-dependent. If the model is already in `.test-cache/`, we could serve it locally, but for simplicity we test the real download flow. Tag as `@slow` if needed for CI gating.
- **Downloaded voice has remove button**: After download completes, verify "Remove" button appears for the cached voice.
- **Remove voice**: Click remove on a cached voice. Verify it returns to "Download" state.
- **Custom voice upload**: Upload dummy .onnx and .onnx.json files via the upload form. Verify the custom voice appears in the custom voices section and in the voice selector.

## What Is NOT Tested

- **WASM engine internals** — covered by unit tests at the mock boundary
- **Network failure handling for downloads** — would require intercepting extension fetch requests, which Playwright can't do for extension contexts (no `page.route()` support)
- **Multiple tabs simultaneously** — adds complexity with low bug-finding ROI
- **Extension installation/update lifecycle** — requires Chrome Web Store or crx packaging

## Prerequisites

- **System Chrome** must be installed. The global setup fails with a clear error if Chrome is not found.
- **Linux CI**: Requires a display server. Use `xvfb-run npm run test:e2e`.

## Scripts

```json
{
  "test:e2e": "playwright test --config e2e/playwright.config.ts"
}
```

## .gitignore Addition

```
.test-cache/
```

## Verification

```bash
npm run build          # build still works
npm run test:run       # unit tests still pass
npm run test:e2e       # e2e tests pass (requires Chrome installed)
```

## Files Summary

| File | Action |
|------|--------|
| `package.json` | Add `test:e2e` script, add `@playwright/test` dev dep |
| `.gitignore` | Add `.test-cache/` |
| `e2e/playwright.config.ts` | New — Playwright config |
| `e2e/fixtures.ts` | New — shared test fixture |
| `e2e/global-setup.ts` | New — build + download voice model |
| `e2e/helpers/seed-voice.ts` | New — IndexedDB seeding helper |
| `e2e/text-selection.spec.ts` | New — 3 tests |
| `e2e/speak-flow.spec.ts` | New — 3 tests |
| `e2e/stop-speech.spec.ts` | New — 2 tests |
| `e2e/context-menu.spec.ts` | New — 2 tests |
| `e2e/options-page.spec.ts` | New — 4 tests |
| `e2e/voice-management.spec.ts` | New — 4 tests |
