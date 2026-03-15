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

### global-setup.ts

Runs once before the test suite:

1. Executes `npm run build` to produce fresh `dist/`
2. Checks `.test-cache/en_US-lessac-low.onnx` and `.test-cache/en_US-lessac-low.onnx.json`
3. If missing, fetches both files from HuggingFace (`https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/low/en_US-lessac-low.onnx` and `.onnx.json`)
4. Saves to `.test-cache/` for subsequent runs

### fixtures.ts

Custom Playwright fixture providing:

- **`context`** — `BrowserContext` via `chromium.launchPersistentContext()` with a temp user-data dir and flags:
  - `--disable-extensions-except=dist/`
  - `--load-extension=dist/`
  - `--no-first-run`
  - `--disable-default-apps`
- **`extensionId`** — extracted from the service worker URL registered by the extension
- **`optionsPage()`** — opens `chrome-extension://{extensionId}/options/options.html`
- **`seedVoice(page)`** — opens any extension page, injects cached model into IndexedDB and sets `chrome.storage.sync` to select `en_US-lessac-low`
- **`waitForPopup(page)`** — locates `<cherami-tts-popup>` element, returns handle into its closed shadow root (uses `page.evaluate` to access shadow root internals since Playwright can't pierce closed shadow DOM directly)

### seed-voice.ts

Helper that:
1. Reads `.test-cache/en_US-lessac-low.onnx` and `.onnx.json` from disk
2. Navigates to an extension page (offscreen or options)
3. Uses `page.evaluate()` to:
   - Open IndexedDB (`cherami-tts-voices` database, `models` store)
   - Write a `CachedModel` entry with the model blob and config
   - Set `chrome.storage.sync` values: `selectedVoice = 'en_US-lessac-low'`, `speed = 1.0`

## Test Scenarios

### 1. text-selection.spec.ts (~3 tests)

- **Popup appears on text selection**: Navigate to a page with known text. Select text via `page.evaluate` (create Range + Selection). Dispatch `mouseup`. Assert `<cherami-tts-popup>` appears with speak button in shadow root.
- **No popup for short selections**: Select text shorter than 3 characters. Assert popup does not appear.
- **Popup hides on scroll**: Select text, verify popup appears, scroll the page, verify popup hides.

### 2. speak-flow.spec.ts (~3 tests)

Prerequisites: voice seeded into IndexedDB.

- **Full lifecycle**: Select text, click speak button in shadow DOM. Wait for popup to show loading state, then speaking state, then auto-hide after IDLE.
- **Multi-sentence text**: Select text with multiple sentences. Verify popup stays in SPEAKING until all sentences are spoken, then transitions to IDLE.
- **Popup auto-hides after completion**: After speech finishes (IDLE state), verify popup disappears within expected timeout.

### 3. stop-speech.spec.ts (~2 tests)

Prerequisites: voice seeded, long text prepared.

- **Stop halts playback**: Select a long paragraph, click speak, wait for SPEAKING state, click stop. Verify popup shows STOPPED state.
- **No further state changes after stop**: After stopping, wait briefly and verify no SPEAKING or IDLE states appear.

### 4. context-menu.spec.ts (~2 tests)

Prerequisites: voice seeded.

- **Context menu triggers speech**: Select text, then simulate context menu click by evaluating against the service worker (Playwright can't interact with native context menus) — dispatch `chrome.contextMenus.onClicked` handler with the selected text and active tab info. Verify TTS state transitions occur.
- **Context menu with no selection**: Simulate context menu click without selected text. Verify no speech is triggered.

### 5. options-page.spec.ts (~4 tests)

- **Voice selector populated**: Open options page. Verify voice dropdown contains available voices.
- **Speed setting persists**: Change speed slider value. Reload page. Verify slider retains the new value.
- **Voice selection persists**: Change selected voice. Reload page. Verify selection is retained.
- **Test voice button plays audio**: Seed voice, open options page. Enter sample text, click test button. Verify speaking state appears and completes.

### 6. voice-management.spec.ts (~4 tests)

These tests start with a clean IndexedDB (no seeding).

- **Download voice**: Open options page. Click download button for `en_US-lessac-low`. Verify progress bar appears and reaches 100%. Verify voice shows "Cached" badge afterward. (This test actually downloads from HuggingFace.)
- **Downloaded voice has remove button**: After download completes, verify "Remove" button appears for the cached voice.
- **Remove voice**: Click remove on a cached voice. Verify it returns to "Download" state.
- **Custom voice upload**: Upload dummy .onnx and .onnx.json files via the upload form. Verify the custom voice appears in the custom voices section and in the voice selector.

## What Is NOT Tested

- **WASM engine internals** — covered by unit tests at the mock boundary
- **Network failure handling for downloads** — would require intercepting extension fetch requests, which Playwright can't do for extension contexts (no `page.route()` support)
- **Multiple tabs simultaneously** — adds complexity with low bug-finding ROI
- **Extension installation/update lifecycle** — requires Chrome Web Store or crx packaging

## Prerequisite

System Chrome must be installed. The e2e test command documents this requirement and fails with a clear error if Chrome is not found.

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
