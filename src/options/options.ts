import { MessageType } from '../shared/messages.js';
import type { ExtensionMessage, DownloadProgressMessage } from '../shared/messages.js';
import { AVAILABLE_VOICES } from '../shared/constants.js';
import { STORAGE_KEYS, getSettings } from '../shared/storage-keys.js';

const voiceSelect = document.getElementById('voice-select') as HTMLSelectElement;
const speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
const speedValue = document.getElementById('speed-value') as HTMLSpanElement;
const voiceList = document.getElementById('voice-list') as HTMLDivElement;

let cachedVoices = new Set<string>();
let downloadingVoices = new Map<string, number>(); // voiceId → progress

// --- Init ---

async function init() {
  const settings = await getSettings();

  // Populate voice selector with available voices
  AVAILABLE_VOICES.forEach((voice) => {
    const option = document.createElement('option');
    option.value = voice.id;
    option.textContent = `${voice.name} (${voice.quality})`;
    voiceSelect.appendChild(option);
  });
  voiceSelect.value = settings.selectedVoice;

  // Speed slider
  speedSlider.value = String(settings.speed);
  speedValue.textContent = `${settings.speed.toFixed(1)}x`;

  // Load cached voices
  await refreshCachedVoices();
  renderVoiceList();

  // Event listeners
  voiceSelect.addEventListener('change', () => {
    chrome.storage.sync.set({ [STORAGE_KEYS.SELECTED_VOICE]: voiceSelect.value });
  });

  speedSlider.addEventListener('input', () => {
    const speed = parseFloat(speedSlider.value);
    speedValue.textContent = `${speed.toFixed(1)}x`;
    chrome.storage.sync.set({ [STORAGE_KEYS.SPEED]: speed });
  });
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
    meta.textContent = `${voice.quality} quality · ${voice.language} · ${voice.sizeApprox}`;

    info.appendChild(name);
    info.appendChild(meta);
    item.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'voice-actions';

    const isCached = cachedVoices.has(voice.id);
    const isDownloading = downloadingVoices.has(voice.id);

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
    voiceList.appendChild(item);
  });
}

// --- Listen for download progress ---

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, _sendResponse) => {
    if (message.type === MessageType.DOWNLOAD_PROGRESS) {
      const msg = message as DownloadProgressMessage;

      if (msg.error) {
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
