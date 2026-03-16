# Prosody Controls Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose piper's `noise_scale` and `noise_w` inference parameters as user-configurable sliders with global defaults and per-voice overrides.

**Architecture:** New storage keys hold global prosody values and a per-voice override map. The service worker resolves the override chain when forwarding SPEAK messages. The offscreen TTS engine mutates the voice config before synthesis (same pattern as speed). Options page adds a collapsible Advanced section with sliders.

**Tech Stack:** TypeScript, Chrome Extension APIs (storage.sync, runtime messaging), HTML/CSS

**Spec:** `docs/superpowers/specs/2026-03-16-prosody-controls-design.md`

---

## Chunk 1: Shared Layer (constants, storage, messages)

### Task 1: Add prosody constants

**Files:**
- Modify: `src/shared/constants.ts`

- [ ] **Step 1: Add prosody range constants**

Add after the `SPEED_DEFAULT` line (line 6) in `src/shared/constants.ts`:

```ts
export const NOISE_SCALE_MIN = 0;
export const NOISE_SCALE_MAX = 1.0;
export const NOISE_SCALE_STEP = 0.05;
export const NOISE_SCALE_DEFAULT = 0.5;

export const NOISE_W_MIN = 0;
export const NOISE_W_MAX = 1.0;
export const NOISE_W_STEP = 0.05;
export const NOISE_W_DEFAULT = 0.5;
```

These constants are used in the options page HTML attributes and JS initialization code.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build, no errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/constants.ts
git commit -m "feat: add prosody range constants"
```

### Task 2: Add prosody storage keys and update getSettings

**Files:**
- Modify: `src/shared/storage-keys.ts`

- [ ] **Step 1: Add storage keys and defaults**

In `src/shared/storage-keys.ts`, add to `STORAGE_KEYS`:

```ts
export const STORAGE_KEYS = {
  SELECTED_VOICE: 'selectedVoice',
  SPEED: 'speed',
  NOISE_SCALE: 'noiseScale',
  NOISE_W: 'noiseW',
  VOICE_PROSODY: 'voiceProsody',
} as const;
```

Add to `STORAGE_DEFAULTS`:

```ts
export const STORAGE_DEFAULTS = {
  [STORAGE_KEYS.SELECTED_VOICE]: DEFAULT_VOICE,
  [STORAGE_KEYS.SPEED]: SPEED_DEFAULT,
  [STORAGE_KEYS.NOISE_SCALE]: null as number | null,
  [STORAGE_KEYS.NOISE_W]: null as number | null,
  [STORAGE_KEYS.VOICE_PROSODY]: {} as Record<string, VoiceProsodyOverrides>,
};
```

Note: Remove the `as const` assertion from `STORAGE_DEFAULTS` and use type assertions on individual values instead. This preserves type safety on the object keys while allowing `null` and `{}` values.

- [ ] **Step 2: Define VoiceProsodyOverrides type and update getSettings**

Add type and update return type:

```ts
export interface VoiceProsodyOverrides {
  noiseScale?: number;
  noiseW?: number;
}

export async function getSettings(): Promise<{
  selectedVoice: string;
  speed: number;
  noiseScale: number | null;
  noiseW: number | null;
  voiceProsody: Record<string, VoiceProsodyOverrides>;
}> {
  const result = await chrome.storage.sync.get(STORAGE_DEFAULTS);
  return {
    selectedVoice: result[STORAGE_KEYS.SELECTED_VOICE] as string,
    speed: result[STORAGE_KEYS.SPEED] as number,
    noiseScale: result[STORAGE_KEYS.NOISE_SCALE] as number | null,
    noiseW: result[STORAGE_KEYS.NOISE_W] as number | null,
    voiceProsody: (result[STORAGE_KEYS.VOICE_PROSODY] ?? {}) as Record<string, VoiceProsodyOverrides>,
  };
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build, no errors

- [ ] **Step 4: Commit**

```bash
git add src/shared/storage-keys.ts
git commit -m "feat: add prosody storage keys and update getSettings"
```

### Task 3: Add prosody fields to SpeakMessage

**Files:**
- Modify: `src/shared/messages.ts`

- [ ] **Step 1: Add optional fields to SpeakMessage**

In `src/shared/messages.ts`, update the `SpeakMessage` interface (lines 29-34):

```ts
export interface SpeakMessage {
  type: MessageType.SPEAK;
  text: string;
  voiceId: string;
  speed: number;
  noiseScale?: number;
  noiseW?: number;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build, no errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/messages.ts
git commit -m "feat: add prosody fields to SpeakMessage"
```

## Chunk 2: TTS Engine and Offscreen Document

### Task 4: Update synthesize() to accept and apply prosody parameters

**Files:**
- Modify: `src/offscreen/tts-engine.ts`

- [ ] **Step 1: Extend synthesize() signature and implementation**

Update `synthesize()` (lines 62-83) to:

```ts
export async function synthesize(
  text: string,
  voiceId: string,
  speed: number,
  noiseScale?: number,
  noiseW?: number
): Promise<Blob> {
  if (!engine) {
    await initEngine();
  }

  // Pre-load voice data to modify inference params
  const voiceData = await voiceProvider!.fetch(voiceId);
  const inference = voiceData[0].inference;
  const originalLengthScale = inference.length_scale;
  const originalNoiseScale = inference.noise_scale;
  const originalNoiseW = inference.noise_w;

  inference.length_scale = originalLengthScale / speed;
  if (noiseScale !== undefined) {
    inference.noise_scale = noiseScale;
  }
  if (noiseW !== undefined) {
    inference.noise_w = noiseW;
  }

  try {
    const response = await engine.generate(text, voiceId, 0);
    return response.file as Blob;
  } finally {
    inference.length_scale = originalLengthScale;
    inference.noise_scale = originalNoiseScale;
    inference.noise_w = originalNoiseW;
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build, no errors

- [ ] **Step 3: Commit**

```bash
git add src/offscreen/tts-engine.ts
git commit -m "feat: apply prosody params in synthesize()"
```

### Task 5: Pass prosody params from offscreen processQueue

**Files:**
- Modify: `src/offscreen/offscreen.ts`

- [ ] **Step 1: Update synthesize call to pass prosody**

In `src/offscreen/offscreen.ts`, update line 55 from:

```ts
const wavBlob = await synthesize(chunks[i], msg.voiceId, msg.speed);
```

to:

```ts
const wavBlob = await synthesize(chunks[i], msg.voiceId, msg.speed, msg.noiseScale, msg.noiseW);
```

No other changes needed — the `SpeakMessage` type already has the optional fields from Task 3.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build, no errors

- [ ] **Step 3: Commit**

```bash
git add src/offscreen/offscreen.ts
git commit -m "feat: pass prosody params to synthesize in processQueue"
```

## Chunk 3: Service Worker Resolution

### Task 6: Resolve prosody settings in service worker

**Files:**
- Modify: `src/background/service-worker.ts`

- [ ] **Step 1: Add prosody resolution helper**

Add a helper function before the message listener in `src/background/service-worker.ts` (before line 77):

```ts
async function resolveProsody(voiceId: string): Promise<{ noiseScale?: number; noiseW?: number }> {
  const settings = await getSettings();
  const perVoice = settings.voiceProsody[voiceId];
  return {
    noiseScale: perVoice?.noiseScale ?? settings.noiseScale ?? undefined,
    noiseW: perVoice?.noiseW ?? settings.noiseW ?? undefined,
  };
}
```

- [ ] **Step 2: Augment SPEAK forwarding in message listener**

Update the SPEAK case (lines 85-93) from:

```ts
case MessageType.SPEAK: {
  if (sender.tab?.id) {
    activeTabId = sender.tab.id;
  }
  ensureOffscreenDocument().then(() => {
    chrome.runtime.sendMessage(message);
  });
  return false;
}
```

to:

```ts
case MessageType.SPEAK: {
  if (sender.tab?.id) {
    activeTabId = sender.tab.id;
  }
  ensureOffscreenDocument()
    .then(() => resolveProsody(message.voiceId))
    .then((prosody) => {
      chrome.runtime.sendMessage({ ...message, ...prosody });
    });
  return false;
}
```

- [ ] **Step 3: Augment context menu SPEAK**

Update the context menu handler (lines 61-66) from:

```ts
chrome.runtime.sendMessage({
  type: MessageType.SPEAK,
  text: info.selectionText,
  voiceId: settings.selectedVoice,
  speed: settings.speed,
} satisfies SpeakMessage);
```

to:

```ts
const prosody = await resolveProsody(settings.selectedVoice);
chrome.runtime.sendMessage({
  type: MessageType.SPEAK,
  text: info.selectionText,
  voiceId: settings.selectedVoice,
  speed: settings.speed,
  ...prosody,
} satisfies SpeakMessage);
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Clean build, no errors

- [ ] **Step 5: Commit**

```bash
git add src/background/service-worker.ts
git commit -m "feat: resolve prosody settings in service worker"
```

## Chunk 4: Options Page UI

### Task 7: Add Advanced section HTML

**Files:**
- Modify: `src/options/options.html`

- [ ] **Step 1: Add collapsible Advanced section**

In `src/options/options.html`, add after the Speed card (after line 35, before the Voice Library section):

```html
<section class="card">
  <h2 class="advanced-toggle" id="advanced-toggle">
    Advanced
    <span class="toggle-arrow" id="toggle-arrow">&#9654;</span>
  </h2>
  <div class="advanced-content" id="advanced-content" hidden>
    <div class="field prosody-field" id="noise-scale-field">
      <label>Expressiveness: <span id="noise-scale-value">Voice default</span></label>
      <div class="prosody-control">
        <input type="range" id="noise-scale-slider" min="0" max="1.0" step="0.05" value="0.5" disabled>
        <button class="btn-link" id="noise-scale-toggle">Customize</button>
      </div>
    </div>
    <div class="field prosody-field" id="noise-w-field">
      <label>Rhythm variation: <span id="noise-w-value">Voice default</span></label>
      <div class="prosody-control">
        <input type="range" id="noise-w-slider" min="0" max="1.0" step="0.05" value="0.5" disabled>
        <button class="btn-link" id="noise-w-toggle">Customize</button>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Commit**

```bash
git add src/options/options.html
git commit -m "feat: add Advanced section HTML for prosody controls"
```

### Task 8: Add Advanced section CSS

**Files:**
- Modify: `src/options/options.css`

- [ ] **Step 1: Add styles**

Add at the end of `src/options/options.css`:

```css
/* --- Advanced section --- */

.advanced-toggle {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
}

.toggle-arrow {
  font-size: 12px;
  transition: transform 0.2s;
  color: #8888a0;
}

.toggle-arrow.open {
  transform: rotate(90deg);
}

.advanced-content {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.prosody-field label {
  margin-bottom: 4px;
}

.prosody-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.prosody-control input[type="range"] {
  flex: 1;
}

.prosody-control input[type="range"]:disabled {
  opacity: 0.3;
}

.btn-link {
  appearance: none;
  background: transparent;
  border: none;
  color: #7c83ff;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  white-space: nowrap;
  transition: opacity 0.15s;
}

.btn-link:hover {
  opacity: 0.8;
}

/* --- Per-voice prosody overrides --- */

.voice-item {
  flex-wrap: wrap;
}

.voice-prosody {
  width: 100%;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #252540;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.voice-prosody .prosody-control {
  font-size: 12px;
}

.voice-prosody label {
  font-size: 11px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/options/options.css
git commit -m "feat: add Advanced section styles"
```

### Task 9: Wire up Advanced section JS (global prosody)

**Files:**
- Modify: `src/options/options.ts`

- [ ] **Step 1: Add DOM references**

Add after the existing DOM references (after line 14) in `src/options/options.ts`:

```ts
const advancedToggle = document.getElementById('advanced-toggle') as HTMLElement;
const advancedContent = document.getElementById('advanced-content') as HTMLElement;
const toggleArrow = document.getElementById('toggle-arrow') as HTMLSpanElement;
const noiseScaleSlider = document.getElementById('noise-scale-slider') as HTMLInputElement;
const noiseScaleValue = document.getElementById('noise-scale-value') as HTMLSpanElement;
const noiseScaleToggle = document.getElementById('noise-scale-toggle') as HTMLButtonElement;
const noiseWSlider = document.getElementById('noise-w-slider') as HTMLInputElement;
const noiseWValue = document.getElementById('noise-w-value') as HTMLSpanElement;
const noiseWToggle = document.getElementById('noise-w-toggle') as HTMLButtonElement;
```

- [ ] **Step 2: Add prosody initialization in init()**

Add after the speed slider setup (after line 149) inside `init()`:

```ts
// Advanced section toggle
advancedToggle.addEventListener('click', () => {
  const isHidden = advancedContent.hidden;
  advancedContent.hidden = !isHidden;
  toggleArrow.classList.toggle('open', isHidden);
});

// Global prosody: noise_scale
initProsodySlider(
  noiseScaleSlider, noiseScaleValue, noiseScaleToggle,
  settings.noiseScale, STORAGE_KEYS.NOISE_SCALE
);

// Global prosody: noise_w
initProsodySlider(
  noiseWSlider, noiseWValue, noiseWToggle,
  settings.noiseW, STORAGE_KEYS.NOISE_W
);
```

- [ ] **Step 3: Add the initProsodySlider helper function**

Add before `init()` in `src/options/options.ts`:

```ts
function initProsodySlider(
  slider: HTMLInputElement,
  valueSpan: HTMLSpanElement,
  toggleBtn: HTMLButtonElement,
  storedValue: number | null,
  storageKey: string,
) {
  if (storedValue !== null) {
    slider.disabled = false;
    slider.value = String(storedValue);
    valueSpan.textContent = storedValue.toFixed(2);
    toggleBtn.textContent = 'Reset';
  }

  toggleBtn.addEventListener('click', () => {
    if (slider.disabled) {
      // Enable with midpoint
      slider.disabled = false;
      slider.value = '0.50';
      valueSpan.textContent = '0.50';
      toggleBtn.textContent = 'Reset';
      chrome.storage.sync.set({ [storageKey]: 0.5 });
    } else {
      // Reset to voice default
      slider.disabled = true;
      slider.value = '0.50';
      valueSpan.textContent = 'Voice default';
      toggleBtn.textContent = 'Customize';
      chrome.storage.sync.set({ [storageKey]: null });
    }
  });

  slider.addEventListener('input', () => {
    const val = parseFloat(slider.value);
    valueSpan.textContent = val.toFixed(2);
    chrome.storage.sync.set({ [storageKey]: val });
  });
}
```

- [ ] **Step 4: Add import for STORAGE_KEYS constants**

The `STORAGE_KEYS` import already exists on line 4. No change needed.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Clean build, no errors

- [ ] **Step 6: Commit**

```bash
git add src/options/options.ts
git commit -m "feat: wire up global prosody sliders in options page"
```

### Task 10: Add per-voice prosody overrides UI

**Files:**
- Modify: `src/options/options.ts`

- [ ] **Step 1: Add voiceProsody state variable**

Add after `let customVoices` (after line 23):

```ts
let voiceProsodyOverrides: Record<string, { noiseScale?: number; noiseW?: number }> = {};
let expandedProsodyPanels = new Set<string>(); // Track which voice prosody panels are open across re-renders
```

- [ ] **Step 2: Load voiceProsody in init()**

Add inside `init()`, after the settings are loaded (after the line `const settings = await getSettings();`):

```ts
voiceProsodyOverrides = settings.voiceProsody;
```

- [ ] **Step 3: Add per-voice prosody rendering to voice cards**

Add a helper function that creates inline prosody controls for a voice card:

```ts
function createVoiceProsodyControls(voiceId: string, container: HTMLElement) {
  const customizeLink = document.createElement('button');
  customizeLink.className = 'btn-link';
  customizeLink.textContent = voiceProsodyOverrides[voiceId] ? 'Edit prosody' : 'Customize prosody';
  customizeLink.style.fontSize = '11px';
  customizeLink.style.width = '100%';
  customizeLink.style.textAlign = 'left';

  const prosodyPanel = document.createElement('div');
  prosodyPanel.className = 'voice-prosody';
  prosodyPanel.hidden = !expandedProsodyPanels.has(voiceId);

  const override = voiceProsodyOverrides[voiceId] ?? {};

  // Noise scale
  const nsLabel = document.createElement('label');
  nsLabel.textContent = `Expressiveness: ${override.noiseScale !== undefined ? override.noiseScale.toFixed(2) : 'Global'}`;

  const nsRow = document.createElement('div');
  nsRow.className = 'prosody-control';

  const nsSlider = document.createElement('input');
  nsSlider.type = 'range';
  nsSlider.min = '0';
  nsSlider.max = '1.0';
  nsSlider.step = '0.05';
  nsSlider.value = String(override.noiseScale ?? 0.5);
  nsSlider.disabled = override.noiseScale === undefined;

  const nsToggle = document.createElement('button');
  nsToggle.className = 'btn-link';
  nsToggle.textContent = override.noiseScale !== undefined ? 'Reset' : 'Customize';

  nsToggle.addEventListener('click', () => {
    if (nsSlider.disabled) {
      nsSlider.disabled = false;
      nsSlider.value = '0.50';
      nsLabel.textContent = 'Expressiveness: 0.50';
      nsToggle.textContent = 'Reset';
      saveVoiceProsody(voiceId, { noiseScale: 0.5 });
    } else {
      nsSlider.disabled = true;
      nsLabel.textContent = 'Expressiveness: Global';
      nsToggle.textContent = 'Customize';
      saveVoiceProsody(voiceId, { noiseScale: undefined });
    }
  });

  nsSlider.addEventListener('input', () => {
    const val = parseFloat(nsSlider.value);
    nsLabel.textContent = `Expressiveness: ${val.toFixed(2)}`;
    saveVoiceProsody(voiceId, { noiseScale: val });
  });

  nsRow.appendChild(nsSlider);
  nsRow.appendChild(nsToggle);

  // Noise W
  const nwLabel = document.createElement('label');
  nwLabel.textContent = `Rhythm variation: ${override.noiseW !== undefined ? override.noiseW.toFixed(2) : 'Global'}`;

  const nwRow = document.createElement('div');
  nwRow.className = 'prosody-control';

  const nwSlider = document.createElement('input');
  nwSlider.type = 'range';
  nwSlider.min = '0';
  nwSlider.max = '1.0';
  nwSlider.step = '0.05';
  nwSlider.value = String(override.noiseW ?? 0.5);
  nwSlider.disabled = override.noiseW === undefined;

  const nwToggle = document.createElement('button');
  nwToggle.className = 'btn-link';
  nwToggle.textContent = override.noiseW !== undefined ? 'Reset' : 'Customize';

  nwToggle.addEventListener('click', () => {
    if (nwSlider.disabled) {
      nwSlider.disabled = false;
      nwSlider.value = '0.50';
      nwLabel.textContent = 'Rhythm variation: 0.50';
      nwToggle.textContent = 'Reset';
      saveVoiceProsody(voiceId, { noiseW: 0.5 });
    } else {
      nwSlider.disabled = true;
      nwLabel.textContent = 'Rhythm variation: Global';
      nwToggle.textContent = 'Customize';
      saveVoiceProsody(voiceId, { noiseW: undefined });
    }
  });

  nwSlider.addEventListener('input', () => {
    const val = parseFloat(nwSlider.value);
    nwLabel.textContent = `Rhythm variation: ${val.toFixed(2)}`;
    saveVoiceProsody(voiceId, { noiseW: val });
  });

  nwRow.appendChild(nwSlider);
  nwRow.appendChild(nwToggle);

  // Reset all link
  const resetAll = document.createElement('button');
  resetAll.className = 'btn-link';
  resetAll.textContent = 'Reset to global';
  resetAll.addEventListener('click', () => {
    delete voiceProsodyOverrides[voiceId];
    chrome.storage.sync.set({ [STORAGE_KEYS.VOICE_PROSODY]: voiceProsodyOverrides });
    prosodyPanel.hidden = true;
    expandedProsodyPanels.delete(voiceId);
    customizeLink.textContent = 'Customize prosody';
  });

  prosodyPanel.appendChild(nsLabel);
  prosodyPanel.appendChild(nsRow);
  prosodyPanel.appendChild(nwLabel);
  prosodyPanel.appendChild(nwRow);
  prosodyPanel.appendChild(resetAll);

  customizeLink.addEventListener('click', () => {
    prosodyPanel.hidden = !prosodyPanel.hidden;
    if (prosodyPanel.hidden) {
      expandedProsodyPanels.delete(voiceId);
    } else {
      expandedProsodyPanels.add(voiceId);
    }
  });

  container.appendChild(customizeLink);
  container.appendChild(prosodyPanel);
}

function saveVoiceProsody(voiceId: string, partial: { noiseScale?: number | undefined; noiseW?: number | undefined }) {
  const current = voiceProsodyOverrides[voiceId] ?? {};

  for (const [key, val] of Object.entries(partial)) {
    if (val === undefined) {
      delete (current as any)[key];
    } else {
      (current as any)[key] = val;
    }
  }

  if (Object.keys(current).length === 0) {
    delete voiceProsodyOverrides[voiceId];
  } else {
    voiceProsodyOverrides[voiceId] = current;
  }

  chrome.storage.sync.set({ [STORAGE_KEYS.VOICE_PROSODY]: voiceProsodyOverrides });
}
```

- [ ] **Step 4: Call createVoiceProsodyControls in renderVoiceList()**

In `renderVoiceList()`, add **after** `item.appendChild(actions)` and before `voiceList.appendChild(item)`:

```ts
// Per-voice prosody controls (full-width, below the voice-item flex row)
if (isCached && !isDownloading) {
  createVoiceProsodyControls(voice.id, item);
}
```

This appends the prosody panel to the `item` container (not `info`), so it spans full width below the name/actions row. The `.voice-item` CSS needs a small tweak — add `flex-wrap: wrap;` so the prosody panel wraps to a new line (see Task 8 CSS).

- [ ] **Step 5: Call createVoiceProsodyControls in renderCustomVoiceList()**

In `renderCustomVoiceList()`, add **after** `item.appendChild(actions)`:

```ts
createVoiceProsodyControls(cv.voiceId, item);
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Clean build, no errors

- [ ] **Step 7: Commit**

```bash
git add src/options/options.ts
git commit -m "feat: add per-voice prosody override UI"
```

## Chunk 5: Manual Testing

### Task 11: Manual end-to-end test

- [ ] **Step 1: Build and load extension**

```bash
npm run build
```

Load the `dist/` directory as an unpacked extension in Chrome.

- [ ] **Step 2: Test global prosody controls**

1. Open the extension options page
2. Verify the "Advanced" section is collapsed by default
3. Click to expand — verify "Expressiveness" and "Rhythm variation" sliders show "Voice default" and are disabled
4. Click "Customize" on Expressiveness — slider enables at 0.50
5. Adjust slider — verify value updates
6. Click "Reset" — slider disables, shows "Voice default"
7. Repeat for Rhythm variation

- [ ] **Step 3: Test per-voice prosody overrides**

1. Download a voice if not cached
2. On the voice card, click "Customize prosody"
3. Verify inline sliders appear
4. Customize one parameter, verify it persists after page reload
5. Click "Reset to global" — verify per-voice override is removed

- [ ] **Step 4: Test TTS with prosody settings**

1. Set global Expressiveness to 0.2 (low variation)
2. Select some text and speak — verify speech sounds more monotone
3. Set Expressiveness to 0.9 (high variation) — verify speech sounds more expressive
4. Set Rhythm variation to 0.1 (uniform timing) — verify even pacing
5. Set Rhythm variation to 0.9 (varied timing) — verify more natural rhythm
6. Test with per-voice override that differs from global

- [ ] **Step 5: Test context menu path**

1. Set prosody globals
2. Right-click selected text → "Speak selected text"
3. Verify prosody settings are applied to speech output

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```
