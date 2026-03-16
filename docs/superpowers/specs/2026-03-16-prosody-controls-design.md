# Prosody Controls Design

Expose piper VITS inference parameters `noise_scale` (expressiveness) and `noise_w` (rhythm/pacing variation) as user-configurable settings, with global defaults and per-voice overrides.

## Motivation

Currently, the only speech tuning available is the speed slider (`length_scale`). Users want finer control over how natural the speech sounds — specifically the variation in word timing and phoneme production. Piper VITS models expose `noise_scale` and `noise_w` for this, but they're currently hardcoded in each voice's config.

## Settings & Storage

### New storage keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `noiseScale` | `number \| null` | `null` | Global expressiveness. `null` = use voice model default. |
| `noiseW` | `number \| null` | `null` | Global rhythm variation. `null` = use voice model default. |
| `voiceProsody` | `Record<string, { noiseScale?: number; noiseW?: number }>` | `{}` | Per-voice overrides keyed by voiceId. |

Added to `STORAGE_KEYS` and `STORAGE_DEFAULTS` in `src/shared/storage-keys.ts`. `getSettings()` returns the new fields including `noiseScale`, `noiseW`, and `voiceProsody`. No migration is needed — `chrome.storage.sync.get(STORAGE_DEFAULTS)` returns defaults for missing keys automatically.

### Parameter ranges

- `noiseScale`: 0.0 to 1.0, step 0.05
- `noiseW`: 0.0 to 1.0, step 0.05

### Resolution order

For each parameter, when synthesizing:
1. Per-voice override (if entry exists in `voiceProsody` for the current voiceId)
2. Global setting (if not `null`)
3. Voice model's built-in value (no mutation — use as-is)

## TTS Engine Changes

### `synthesize()` in `src/offscreen/tts-engine.ts`

Signature changes from:
```ts
synthesize(text: string, voiceId: string, speed: number): Promise<Blob>
```
to:
```ts
synthesize(text: string, voiceId: string, speed: number, noiseScale?: number, noiseW?: number): Promise<Blob>
```

When `noiseScale` or `noiseW` are provided (not `undefined`), temporarily mutate the corresponding fields on `voiceData[0].inference` before calling `engine.generate()`, then restore in the `finally` block — same pattern as the existing `length_scale` speed mutation.

The exact piper config property names are `noise_scale` and `noise_w` (snake_case), matching the existing `length_scale` convention on `voiceData[0].inference`.

**Concurrency assumption:** This mutation pattern requires serial synthesis, which is guaranteed by `processQueue()` processing chunks sequentially with `await`. No concurrent `synthesize()` calls occur for the same voice.

### Caller resolution in `src/offscreen/offscreen.ts`

`processQueue()` receives the prosody settings via the SPEAK message. It resolves the override chain (per-voice > global > undefined) and passes final values to `synthesize()`.

## Message Flow

The `SPEAK` message (defined in `src/shared/messages.ts`) gains two optional fields:
```ts
noiseScale?: number;
noiseW?: number;
```

The service worker **intercepts** all SPEAK messages (from both content scripts and the options page), reads prosody settings from `chrome.storage.sync`, resolves the override chain for the target voiceId, and constructs a new message with `noiseScale`/`noiseW` fields added before forwarding to the offscreen document. This replaces the current pass-through pattern (`chrome.runtime.sendMessage(message)`) with `chrome.runtime.sendMessage({ ...message, noiseScale, noiseW })`. The content script does not need to know about prosody — the service worker handles resolution for all SPEAK origins.

## Options Page UI

### Advanced section in `src/options/options.html` and `src/options/options.ts`

A collapsible **"Advanced"** section below the speed slider, **collapsed by default**. Contains:

- **"Expressiveness" slider** — maps to `noiseScale`. Range 0.0–1.0, step 0.05. Displays current value.
- **"Rhythm variation" slider** — maps to `noiseW`. Range 0.0–1.0, step 0.05. Displays current value.
- Both sliders start **disabled/hidden** when the setting is `null` (voice default). The label shows "Voice default" with a **"Customize"** link that enables the slider, initializing it to a sensible midpoint (0.5). A **"Reset"** link next to each slider disables it and restores the value to `null`.

This avoids the problem of HTML range inputs not representing `null` — the slider simply doesn't appear until the user opts in.

### Per-voice overrides

Each voice card (in both the built-in and custom voice lists) gets a **"Customize"** link that expands inline `noiseScale` and `noiseW` sliders for that specific voice. These values are stored in `voiceProsody[voiceId]`. A **"Reset to global"** link clears the per-voice entry.

### Test voice integration

The "Test voice" button and per-card play buttons use the fully resolved prosody settings (per-voice > global > model default) so users hear the effect of their changes immediately.

## Files Modified

| File | Change |
|------|--------|
| `src/shared/storage-keys.ts` | New keys, defaults, updated `getSettings()` |
| `src/shared/messages.ts` | Optional `noiseScale`/`noiseW` on SPEAK message |
| `src/shared/constants.ts` | Prosody range constants |
| `src/offscreen/tts-engine.ts` | Extended `synthesize()` signature and mutation |
| `src/offscreen/offscreen.ts` | Pass prosody params to `synthesize()` |
| `src/background/service-worker.ts` | Resolve prosody from storage, include in SPEAK forwarding |
| `src/options/options.html` | Advanced section markup |
| `src/options/options.css` | Advanced section and per-voice override styles |
| `src/options/options.ts` | Slider logic, per-voice override UI, storage read/write |
