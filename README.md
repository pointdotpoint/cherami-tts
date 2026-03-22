# cherami-tts

A Chrome extension that reads selected text aloud using high-quality neural voices — entirely local, with no data leaving your browser.

Built on [Piper TTS](https://github.com/rhasspy/piper) (ONNX WASM runtime via [piper-tts-web](https://github.com/nickvdh/piper-tts-web)), cherami-tts runs speech synthesis directly in the browser with no external API calls.

## Features

- **Select and speak** — highlight text on any webpage and hear it read aloud via the floating popup or right-click context menu
- **Fully local** — all TTS processing happens in-browser using WebAssembly; no data is sent anywhere
- **Multiple voices** — choose from 10 curated English voices (US and GB accents) in medium and low quality tiers
- **Custom voices** — upload your own Piper ONNX voice models
- **Adjustable speed** — 0.5x to 2.0x playback speed
- **Offline capable** — downloaded voice models are cached in IndexedDB for offline use

## Install

### From source

```bash
git clone https://github.com/nickvdh/cherami-tts.git
cd cherami-tts
npm install
npm run build
```

Then load the `dist/` directory as an unpacked extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder

## Usage

1. **Select text** on any webpage — a small popup appears near your selection
2. Click the **play button** (or right-click and choose "Speak with cherami-tts")
3. On first use, the selected voice model will be downloaded and cached locally

Open the **Options page** (right-click the extension icon → Options) to:
- Choose a voice and test it
- Adjust playback speed
- Download voices for offline use
- Upload custom Piper ONNX voices

## Development

```bash
npm run dev          # Watch mode (rebuilds on changes)
npm run build        # Full production build
npm test             # Run unit tests (vitest)
npm run test:e2e     # Run end-to-end tests (playwright)
```

The build is a two-stage Vite process:
1. `vite build` — service worker, offscreen document, and options page (ES modules)
2. `vite build --config vite.config.content.ts` — content script as IIFE (content scripts can't use ES modules)

## Architecture

```
Content Script              Service Worker              Offscreen Document
──────────────              ──────────────              ──────────────────
Floating popup UI           Message router              Piper TTS engine (WASM)
Text selection detection    Offscreen lifecycle mgmt    Audio playback
Shadow DOM isolation        Context menu handler        Voice download & cache

Options Page
────────────
Voice management (download/upload/remove)
Speed & voice selection settings
```

The **service worker** routes typed messages (`ExtensionMessage`) between all components. The **offscreen document** is required because MV3 service workers can't use Web Workers or play audio — it hosts the WASM engine and `HTMLAudioElement`. The **content script** uses a Shadow DOM custom element (`<cherami-tts-popup>`) to isolate its UI from host page styles.

Voice models are downloaded from HuggingFace on demand and cached in IndexedDB (`cherami-tts-voices` database).

## License

MIT
