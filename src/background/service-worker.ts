import { MessageType, TtsState } from '../shared/messages.js';
import type { ExtensionMessage, SpeakMessage } from '../shared/messages.js';
import { CONTEXT_MENU_ID } from '../shared/constants.js';
import { getSettings } from '../shared/storage-keys.js';

// --- Offscreen document lifecycle ---

let creatingOffscreen: Promise<void> | null = null;

async function ensureOffscreenDocument(): Promise<void> {
  const existingContexts = await (chrome as any).runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });

  if (existingContexts.length > 0) return;

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: [
      chrome.offscreen.Reason.WORKERS,
      chrome.offscreen.Reason.AUDIO_PLAYBACK,
    ],
    justification: 'TTS synthesis and audio playback using piper-tts-web WASM engine',
  });

  await creatingOffscreen;
  creatingOffscreen = null;
}

// --- Context menu ---

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Speak selected text',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !info.selectionText) return;

  const settings = await getSettings();

  await ensureOffscreenDocument();

  chrome.runtime.sendMessage({
    type: MessageType.SPEAK,
    text: info.selectionText,
    voiceId: settings.selectedVoice,
    speed: settings.speed,
  } satisfies SpeakMessage);

  // Notify the content script about the state
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: MessageType.TTS_STATE,
      state: TtsState.LOADING,
    });
  }
});

// --- Message routing ---

// Track which tab initiated the current speak request
let activeTabId: number | null = null;

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    switch (message.type) {
      case MessageType.SPEAK: {
        // From content script → forward to offscreen
        if (sender.tab?.id) {
          activeTabId = sender.tab.id;
        }
        ensureOffscreenDocument().then(() => {
          chrome.runtime.sendMessage(message);
        });
        return false;
      }

      case MessageType.STOP: {
        // From content script → forward to offscreen
        ensureOffscreenDocument().then(() => {
          chrome.runtime.sendMessage(message);
        });
        return false;
      }

      case MessageType.TTS_STATE: {
        // From offscreen → forward to active content script tab
        if (activeTabId !== null) {
          chrome.tabs.sendMessage(activeTabId, message).catch(() => {
            // Tab may have been closed
          });
          if (
            message.state === TtsState.IDLE ||
            message.state === TtsState.STOPPED ||
            message.state === TtsState.ERROR
          ) {
            activeTabId = null;
          }
        }
        return false;
      }

      case MessageType.DOWNLOAD_VOICE:
      case MessageType.REMOVE_VOICE:
      case MessageType.INIT_ENGINE: {
        // From options page → forward to offscreen
        ensureOffscreenDocument().then(() => {
          chrome.runtime.sendMessage(message);
        });
        return false;
      }

      case MessageType.LIST_CACHED_VOICES: {
        // From options page → forward to offscreen, relay response back
        ensureOffscreenDocument().then(() => {
          chrome.runtime.sendMessage(message, (response) => {
            sendResponse(response);
          });
        });
        return true; // async sendResponse
      }

      case MessageType.DOWNLOAD_PROGRESS: {
        // From offscreen → we don't need to route this to content scripts,
        // options page listens for these directly
        return false;
      }

      default:
        return false;
    }
  }
);

console.log('cherami-tts service worker loaded');
