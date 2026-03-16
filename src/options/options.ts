import { MessageType, TtsState } from '../shared/messages.js';
import type { ExtensionMessage, DownloadProgressMessage, TtsStateMessage } from '../shared/messages.js';
import { AVAILABLE_VOICES, DEFAULT_VOICE } from '../shared/constants.js';
import { STORAGE_KEYS, getSettings } from '../shared/storage-keys.js';
import { openVoiceDB, STORE_NAME, CUSTOM_VOICE_PREFIX } from '../shared/voice-db.js';
import type { CachedModel } from '../shared/voice-db.js';

const voiceSelect = document.getElementById('voice-select') as HTMLSelectElement;
const speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
const speedValue = document.getElementById('speed-value') as HTMLSpanElement;
const voiceList = document.getElementById('voice-list') as HTMLDivElement;
const customVoiceList = document.getElementById('custom-voice-list') as HTMLDivElement;
const alertContainer = document.getElementById('alert-container') as HTMLDivElement;
const testText = document.getElementById('test-text') as HTMLTextAreaElement;
const testVoiceBtn = document.getElementById('test-voice-btn') as HTMLButtonElement;
const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement;
const uploadName = document.getElementById('upload-name') as HTMLInputElement;
const uploadOnnx = document.getElementById('upload-onnx') as HTMLInputElement;
const uploadConfig = document.getElementById('upload-config') as HTMLInputElement;

const advancedToggle = document.getElementById('advanced-toggle') as HTMLElement;
const advancedContent = document.getElementById('advanced-content') as HTMLElement;
const toggleArrow = document.getElementById('toggle-arrow') as HTMLSpanElement;
const noiseScaleSlider = document.getElementById('noise-scale-slider') as HTMLInputElement;
const noiseScaleValue = document.getElementById('noise-scale-value') as HTMLSpanElement;
const noiseScaleToggle = document.getElementById('noise-scale-toggle') as HTMLButtonElement;
const noiseWSlider = document.getElementById('noise-w-slider') as HTMLInputElement;
const noiseWValue = document.getElementById('noise-w-value') as HTMLSpanElement;
const noiseWToggle = document.getElementById('noise-w-toggle') as HTMLButtonElement;

let cachedVoices = new Set<string>();
let downloadingVoices = new Map<string, number>(); // voiceId → progress
let customVoices: Array<{ voiceId: string; displayName: string }> = [];
let voiceProsodyOverrides: Record<string, { noiseScale?: number; noiseW?: number }> = {};
let expandedProsodyPanels = new Set<string>();

const SAMPLE_TEXT = 'Hello, this is a sample of how this voice sounds.';
let currentlyPlayingVoiceId: string | null = null;
let currentTtsState: TtsState = TtsState.IDLE;

// --- Alert system ---

function showAlert(message: string, type: 'error' | 'success' = 'error', durationMs: number = 5000) {
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;

  const text = document.createElement('span');
  text.textContent = message;
  alert.appendChild(text);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'alert-close';
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', () => dismissAlert(alert));
  alert.appendChild(closeBtn);

  alertContainer.appendChild(alert);

  // Trigger slide-in on next frame
  requestAnimationFrame(() => {
    alert.classList.add('alert-visible');
  });

  // Auto-dismiss
  setTimeout(() => dismissAlert(alert), durationMs);
}

function dismissAlert(alert: HTMLElement) {
  if (!alert.parentNode) return;
  alert.classList.remove('alert-visible');
  alert.classList.add('alert-exit');
  alert.addEventListener('transitionend', () => alert.remove(), { once: true });
}

// --- Slug helper ---

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// --- Play/stop sample ---

function playSample(voiceId: string) {
  // Stop any currently playing sample first
  if (currentlyPlayingVoiceId) {
    chrome.runtime.sendMessage({ type: MessageType.STOP });
  }

  currentlyPlayingVoiceId = voiceId;
  currentTtsState = TtsState.LOADING;
  renderVoiceList();
  renderCustomVoiceList();
  updateTestButton();

  const text = testText.value.trim() || SAMPLE_TEXT;
  const speed = parseFloat(speedSlider.value);
  chrome.runtime.sendMessage({
    type: MessageType.SPEAK,
    text,
    voiceId,
    speed,
  });
}

function stopSample() {
  chrome.runtime.sendMessage({ type: MessageType.STOP });
  currentlyPlayingVoiceId = null;
  currentTtsState = TtsState.IDLE;
  renderVoiceList();
  renderCustomVoiceList();
  updateTestButton();
}

function updateTestButton() {
  if (currentlyPlayingVoiceId && currentTtsState === TtsState.LOADING) {
    testVoiceBtn.textContent = 'Loading\u2026';
    testVoiceBtn.disabled = true;
  } else if (currentlyPlayingVoiceId && currentTtsState === TtsState.SPEAKING) {
    testVoiceBtn.textContent = 'Stop';
    testVoiceBtn.disabled = false;
  } else {
    testVoiceBtn.textContent = 'Test voice';
    testVoiceBtn.disabled = false;
  }
}

// --- Prosody helpers ---

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
    // Reset slider UI to default state
    nsSlider.disabled = true;
    nsLabel.textContent = 'Expressiveness: Global';
    nsToggle.textContent = 'Customize';
    nwSlider.disabled = true;
    nwLabel.textContent = 'Rhythm variation: Global';
    nwToggle.textContent = 'Customize';
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

// --- Init ---

async function init() {
  const settings = await getSettings();
  voiceProsodyOverrides = settings.voiceProsody;

  // Load custom voices from IDB
  await loadCustomVoices();

  // Load cached voices
  await refreshCachedVoices();

  // Build valid voice ID set for migration
  const validIds = new Set<string>([
    ...AVAILABLE_VOICES.map((v) => v.id),
    ...customVoices.map((v) => v.voiceId),
  ]);

  // Migrate if stored voice is no longer valid
  let selectedVoice = settings.selectedVoice;
  if (!validIds.has(selectedVoice)) {
    selectedVoice = DEFAULT_VOICE;
    chrome.storage.sync.set({ [STORAGE_KEYS.SELECTED_VOICE]: selectedVoice });
  }

  // Populate voice selector
  populateVoiceSelector();
  voiceSelect.value = selectedVoice;

  // Speed slider
  speedSlider.value = String(settings.speed);
  speedValue.textContent = `${settings.speed.toFixed(1)}x`;

  renderVoiceList();
  renderCustomVoiceList();

  // Event listeners
  voiceSelect.addEventListener('change', () => {
    chrome.storage.sync.set({ [STORAGE_KEYS.SELECTED_VOICE]: voiceSelect.value });
  });

  speedSlider.addEventListener('input', () => {
    const speed = parseFloat(speedSlider.value);
    speedValue.textContent = `${speed.toFixed(1)}x`;
    chrome.storage.sync.set({ [STORAGE_KEYS.SPEED]: speed });
  });

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

  uploadBtn.addEventListener('click', handleUpload);

  testVoiceBtn.addEventListener('click', () => {
    if (currentlyPlayingVoiceId) {
      stopSample();
    } else {
      playSample(voiceSelect.value);
    }
  });
}

// --- Custom voices (IDB) ---

async function loadCustomVoices(): Promise<void> {
  try {
    const db = await openVoiceDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    const all = await new Promise<CachedModel[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as CachedModel[]);
      request.onerror = () => reject(request.error);
    });

    db.close();

    customVoices = all
      .filter((entry) => entry.userUploaded === true)
      .map((entry) => ({
        voiceId: entry.voiceId,
        displayName: entry.displayName || entry.voiceId,
      }));
  } catch {
    customVoices = [];
  }
}

// --- Voice selector ---

function populateVoiceSelector() {
  voiceSelect.innerHTML = '';

  if (customVoices.length > 0) {
    const customGroup = document.createElement('optgroup');
    customGroup.label = 'Custom Voices';
    for (const cv of customVoices) {
      const opt = document.createElement('option');
      opt.value = cv.voiceId;
      opt.textContent = cv.displayName;
      customGroup.appendChild(opt);
    }
    voiceSelect.appendChild(customGroup);
  }

  const downloadGroup = document.createElement('optgroup');
  downloadGroup.label = 'Downloadable Voices';
  for (const voice of AVAILABLE_VOICES) {
    const opt = document.createElement('option');
    opt.value = voice.id;
    opt.textContent = `${voice.name} (${voice.quality})`;
    downloadGroup.appendChild(opt);
  }
  voiceSelect.appendChild(downloadGroup);
}

// --- Upload handler ---

async function handleUpload() {
  const name = uploadName.value.trim();
  if (!name) {
    showAlert('Please enter a voice name.');
    return;
  }

  const onnxFile = uploadOnnx.files?.[0];
  if (!onnxFile) {
    showAlert('Please select an .onnx model file.');
    return;
  }

  const configFile = uploadConfig.files?.[0];
  if (!configFile) {
    showAlert('Please select an .onnx.json config file.');
    return;
  }

  // Parse and validate config JSON
  let config: any;
  try {
    const configText = await configFile.text();
    config = JSON.parse(configText);
    if (!config.audio) {
      showAlert('Invalid config: missing "audio" key.');
      return;
    }
  } catch {
    showAlert('Config file is not valid JSON.');
    return;
  }

  // Generate voice ID
  const slug = slugify(name);
  if (!slug) {
    showAlert('Voice name must contain at least one alphanumeric character.');
    return;
  }

  const voiceId = CUSTOM_VOICE_PREFIX + slug;

  // Check for duplicate
  if (customVoices.some((v) => v.voiceId === voiceId)) {
    showAlert(`A custom voice with the ID "${voiceId}" already exists.`);
    return;
  }

  // Read .onnx as Blob
  const modelBlob = new Blob([await onnxFile.arrayBuffer()], { type: 'application/octet-stream' });

  // Write to IDB
  try {
    const db = await openVoiceDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const entry: CachedModel = {
      voiceId,
      config,
      modelBlob,
      timestamp: Date.now(),
      displayName: name,
      userUploaded: true,
    };

    await new Promise<void>((resolve, reject) => {
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
  } catch (err) {
    showAlert(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return;
  }

  // Refresh UI
  await loadCustomVoices();
  populateVoiceSelector();
  voiceSelect.value = voiceId;
  chrome.storage.sync.set({ [STORAGE_KEYS.SELECTED_VOICE]: voiceId });
  renderVoiceList();
  renderCustomVoiceList();

  // Reset form
  uploadName.value = '';
  uploadOnnx.value = '';
  uploadConfig.value = '';

  showAlert(`Voice "${name}" uploaded successfully.`, 'success');
}

// --- Cached voices ---

async function refreshCachedVoices(): Promise<void> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: MessageType.LIST_CACHED_VOICES },
      (response) => {
        if (response?.voices) {
          cachedVoices = new Set(response.voices);
        }
        resolve();
      }
    );
  });
}

// --- Custom voice list rendering ---

function renderCustomVoiceList() {
  customVoiceList.innerHTML = '';

  if (customVoices.length === 0) return;

  for (const cv of customVoices) {
    const item = document.createElement('div');
    item.className = 'voice-item';

    const info = document.createElement('div');
    info.className = 'voice-info';

    const name = document.createElement('span');
    name.className = 'voice-name';
    name.textContent = cv.displayName;

    info.appendChild(name);
    item.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'voice-actions';

    // Play/stop button
    const isThisPlaying = currentlyPlayingVoiceId === cv.voiceId;

    if (isThisPlaying && currentTtsState === TtsState.LOADING) {
      const spinner = document.createElement('div');
      spinner.className = 'sample-spinner';
      actions.appendChild(spinner);
    } else if (isThisPlaying && currentTtsState === TtsState.SPEAKING) {
      const stopBtn = document.createElement('button');
      stopBtn.className = 'btn-icon btn-stop';
      stopBtn.title = 'Stop sample';
      stopBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" fill="currentColor"/></svg>';
      stopBtn.addEventListener('click', () => stopSample());
      actions.appendChild(stopBtn);
    } else {
      const playBtn = document.createElement('button');
      playBtn.className = 'btn-icon';
      playBtn.title = 'Play sample';
      playBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12"><polygon points="2,0 12,6 2,12" fill="currentColor"/></svg>';
      playBtn.addEventListener('click', () => playSample(cv.voiceId));
      actions.appendChild(playBtn);
    }

    // Custom badge
    const badge = document.createElement('span');
    badge.className = 'badge badge-custom';
    badge.textContent = 'Custom';
    actions.appendChild(badge);

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-danger';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      if (currentlyPlayingVoiceId === cv.voiceId) {
        stopSample();
      }
      chrome.runtime.sendMessage({
        type: MessageType.REMOVE_VOICE,
        voiceId: cv.voiceId,
      });
      customVoices = customVoices.filter((v) => v.voiceId !== cv.voiceId);

      // Reset selection if needed
      if (voiceSelect.value === cv.voiceId) {
        const newVoice = DEFAULT_VOICE;
        voiceSelect.value = newVoice;
        chrome.storage.sync.set({ [STORAGE_KEYS.SELECTED_VOICE]: newVoice });
      }

      populateVoiceSelector();
      // Restore the current selection in the rebuilt dropdown
      chrome.storage.sync.get(STORAGE_KEYS.SELECTED_VOICE, (result) => {
        voiceSelect.value = result[STORAGE_KEYS.SELECTED_VOICE] || DEFAULT_VOICE;
      });
      renderCustomVoiceList();
    });
    actions.appendChild(removeBtn);

    item.appendChild(actions);

    createVoiceProsodyControls(cv.voiceId, item);

    customVoiceList.appendChild(item);
  }
}

// --- Voice list rendering ---

function renderVoiceList() {
  voiceList.innerHTML = '';

  AVAILABLE_VOICES.forEach((voice) => {
    const item = document.createElement('div');
    item.className = 'voice-item';
    item.id = `voice-${voice.id}`;

    const info = document.createElement('div');
    info.className = 'voice-info';

    const name = document.createElement('span');
    name.className = 'voice-name';
    name.textContent = voice.name;

    const meta = document.createElement('span');
    meta.className = 'voice-meta';
    meta.textContent = `${voice.quality} quality \u00b7 ${voice.language} \u00b7 ${voice.sizeApprox}`;

    info.appendChild(name);
    info.appendChild(meta);
    item.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'voice-actions';

    const isCached = cachedVoices.has(voice.id);
    const isDownloading = downloadingVoices.has(voice.id);

    // Play/stop button for available voices
    if (isCached && !isDownloading) {
      const isThisPlaying = currentlyPlayingVoiceId === voice.id;

      if (isThisPlaying && currentTtsState === TtsState.LOADING) {
        // Spinner while loading
        const spinner = document.createElement('div');
        spinner.className = 'sample-spinner';
        actions.appendChild(spinner);
      } else if (isThisPlaying && currentTtsState === TtsState.SPEAKING) {
        // Stop button while speaking
        const stopBtn = document.createElement('button');
        stopBtn.className = 'btn-icon btn-stop';
        stopBtn.title = 'Stop sample';
        stopBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" fill="currentColor"/></svg>';
        stopBtn.addEventListener('click', () => stopSample());
        actions.appendChild(stopBtn);
      } else {
        // Play button (idle)
        const playBtn = document.createElement('button');
        playBtn.className = 'btn-icon';
        playBtn.title = 'Play sample';
        playBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12"><polygon points="2,0 12,6 2,12" fill="currentColor"/></svg>';
        playBtn.addEventListener('click', () => playSample(voice.id));
        actions.appendChild(playBtn);
      }
    }

    if (isDownloading) {
      const progress = downloadingVoices.get(voice.id)!;
      const bar = document.createElement('div');
      bar.className = 'progress-bar';
      const fill = document.createElement('div');
      fill.className = 'progress-bar-fill';
      fill.style.width = `${progress}%`;
      bar.appendChild(fill);
      actions.appendChild(bar);
    } else if (isCached) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-cached';
      badge.textContent = 'Cached';
      actions.appendChild(badge);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn btn-danger';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        // Stop sample if this voice is playing
        if (currentlyPlayingVoiceId === voice.id) {
          stopSample();
        }
        chrome.runtime.sendMessage({
          type: MessageType.REMOVE_VOICE,
          voiceId: voice.id,
        });
        cachedVoices.delete(voice.id);
        renderVoiceList();
      });
      actions.appendChild(removeBtn);
    } else {
      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'btn btn-primary';
      downloadBtn.textContent = 'Download';
      downloadBtn.addEventListener('click', () => {
        downloadingVoices.set(voice.id, 0);
        renderVoiceList();
        chrome.runtime.sendMessage({
          type: MessageType.DOWNLOAD_VOICE,
          voiceId: voice.id,
        });
      });
      actions.appendChild(downloadBtn);
    }

    item.appendChild(actions);

    // Per-voice prosody controls (full-width, below the voice-item flex row)
    if (isCached && !isDownloading) {
      createVoiceProsodyControls(voice.id, item);
    }

    voiceList.appendChild(item);
  });
}

// --- Listen for messages ---

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, _sendResponse) => {
    if (message.type === MessageType.TTS_STATE) {
      // Ignore TTS_STATE if we didn't initiate a sample
      if (currentlyPlayingVoiceId === null) return false;

      const msg = message as TtsStateMessage;

      switch (msg.state) {
        case TtsState.LOADING:
        case TtsState.SPEAKING:
          currentTtsState = msg.state;
          renderVoiceList();
          renderCustomVoiceList();
          updateTestButton();
          break;
        case TtsState.IDLE:
        case TtsState.STOPPED:
          currentlyPlayingVoiceId = null;
          currentTtsState = TtsState.IDLE;
          renderVoiceList();
          renderCustomVoiceList();
          updateTestButton();
          break;
        case TtsState.ERROR:
          showAlert(msg.error || 'Playback failed');
          currentlyPlayingVoiceId = null;
          currentTtsState = TtsState.IDLE;
          renderVoiceList();
          renderCustomVoiceList();
          updateTestButton();
          break;
      }
      return false;
    }

    if (message.type === MessageType.DOWNLOAD_PROGRESS) {
      const msg = message as DownloadProgressMessage;

      if (msg.error) {
        showAlert(`Download failed for voice: ${msg.error}`);
        downloadingVoices.delete(msg.voiceId);
        renderVoiceList();
        return false;
      }

      if (msg.done) {
        downloadingVoices.delete(msg.voiceId);
        cachedVoices.add(msg.voiceId);
      } else {
        downloadingVoices.set(msg.voiceId, msg.progress);
      }

      renderVoiceList();
    }
    return false;
  }
);

init();
