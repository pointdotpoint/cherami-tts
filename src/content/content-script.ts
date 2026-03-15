import { MessageType, TtsState } from '../shared/messages.js';
import type { ExtensionMessage, TtsStateMessage } from '../shared/messages.js';
import { MIN_SELECTION_LENGTH } from '../shared/constants.js';
import { getSettings } from '../shared/storage-keys.js';
import { FloatingPopup } from './floating-popup.js';

const popup = new FloatingPopup();
let selectedText = '';

// --- Selection detection ---

function getSelectedText(): string {
  return window.getSelection()?.toString().trim() || '';
}

function getSelectionRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  return range.getBoundingClientRect();
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

document.addEventListener('mouseup', (e) => {
  // Ignore clicks inside our popup
  if ((e.target as HTMLElement)?.closest?.('cherami-tts-popup')) return;

  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    const text = getSelectedText();
    const rect = getSelectionRect();

    if (text.length >= MIN_SELECTION_LENGTH && rect && rect.width > 0) {
      selectedText = text;
      popup.show(
        rect,
        () => handleSpeak(),
        () => handleStop()
      );
    } else {
      popup.hide();
      selectedText = '';
    }
  }, 200);
});

// Hide popup when selection is cleared
document.addEventListener('mousedown', (e) => {
  if ((e.target as HTMLElement)?.closest?.('cherami-tts-popup')) return;
  if (popup.isVisible) {
    // Don't hide immediately — mouseup handler will handle it
  }
});

// Also hide on scroll if not speaking
document.addEventListener(
  'scroll',
  () => {
    if (popup.isVisible) {
      popup.hide();
    }
  },
  { passive: true }
);

// --- Speak / Stop handlers ---

async function handleSpeak() {
  if (!selectedText) return;

  const settings = await getSettings();

  popup.updateState(TtsState.LOADING);

  chrome.runtime.sendMessage({
    type: MessageType.SPEAK,
    text: selectedText,
    voiceId: settings.selectedVoice,
    speed: settings.speed,
  });
}

function handleStop() {
  chrome.runtime.sendMessage({ type: MessageType.STOP });
}

// --- Listen for state updates from service worker ---

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, _sendResponse) => {
    if (message.type === MessageType.TTS_STATE) {
      const msg = message as TtsStateMessage;
      popup.updateState(msg.state, msg.error);
    }
    return false;
  }
);
