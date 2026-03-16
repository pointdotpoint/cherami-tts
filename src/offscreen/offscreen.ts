import { MessageType, TtsState } from '../shared/messages.js';
import type {
  ExtensionMessage,
  SpeakMessage,
  DownloadVoiceMessage,
  RemoveVoiceMessage,
} from '../shared/messages.js';
import { initEngine, synthesize, destroyEngine } from './tts-engine.js';
import { playAudio, stop as stopAudio } from './audio-player.js';
import {
  downloadVoice,
  listCached,
  removeVoice,
} from './voice-manager.js';
import { splitIntoChunks, normalizeText } from './text-utils.js';

function sendState(state: TtsState, error?: string) {
  chrome.runtime.sendMessage({
    type: MessageType.TTS_STATE,
    state,
    error,
  });
}

let speakAborted = false;
let processing = false;
const speakQueue: SpeakMessage[] = [];

function handleSpeak(msg: SpeakMessage) {
  speakQueue.push(msg);
  if (processing) return;
  processQueue();
}

async function processQueue() {
  processing = true;

  while (speakQueue.length > 0) {
    speakAborted = false;
    const msg = speakQueue.shift()!;

    try {
      sendState(TtsState.LOADING);
      await initEngine();

      const normalized = normalizeText(msg.text);
      const chunks = splitIntoChunks(normalized);

      for (let i = 0; i < chunks.length; i++) {
        if (speakAborted) {
          sendState(TtsState.STOPPED);
          break;
        }

        const wavBlob = await synthesize(chunks[i], msg.voiceId, msg.speed, msg.noiseScale, msg.noiseW);

        if (speakAborted) {
          sendState(TtsState.STOPPED);
          break;
        }

        sendState(TtsState.SPEAKING);

        await new Promise<void>((resolve) => {
          playAudio(wavBlob, resolve);
        });
      }

      // Only send IDLE if no more items queued
      if (speakQueue.length === 0) {
        sendState(TtsState.IDLE);
      }
    } catch (err: any) {
      console.error('TTS error:', err);
      sendState(TtsState.ERROR, err.message || 'Unknown TTS error');
      continue;
    }
  }

  processing = false;
}

async function handleDownloadVoice(msg: DownloadVoiceMessage) {
  try {
    await downloadVoice(msg.voiceId, (progress) => {
      chrome.runtime.sendMessage({
        type: MessageType.DOWNLOAD_PROGRESS,
        voiceId: msg.voiceId,
        progress,
        done: progress >= 100,
      });
    });
  } catch (err: any) {
    chrome.runtime.sendMessage({
      type: MessageType.DOWNLOAD_PROGRESS,
      voiceId: msg.voiceId,
      progress: 0,
      done: true,
      error: err.message || 'Download failed',
    });
  }
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    switch (message.type) {
      case MessageType.INIT_ENGINE:
        initEngine()
          .then(() => {
            chrome.runtime.sendMessage({ type: MessageType.ENGINE_READY });
          })
          .catch((err) => {
            console.error('Engine init failed:', err);
          });
        return false;

      case MessageType.SPEAK:
        if (sender.tab) return false;
        handleSpeak(message);
        return false;

      case MessageType.STOP:
        if (sender.tab) return false;
        speakQueue.length = 0;
        speakAborted = true;
        stopAudio();
        sendState(TtsState.STOPPED);
        return false;

      case MessageType.DOWNLOAD_VOICE:
        handleDownloadVoice(message);
        return false;

      case MessageType.REMOVE_VOICE:
        removeVoice(message.voiceId)
          .then(() => {
            // Destroy engine so it doesn't hold stale references
            destroyEngine();
          })
          .catch((err) => {
            console.error('Remove voice failed:', err);
          });
        return false;

      case MessageType.LIST_CACHED_VOICES:
        listCached().then((voices) => {
          sendResponse({
            type: MessageType.LIST_CACHED_VOICES_RESULT,
            voices,
          });
        });
        return true; // async sendResponse

      default:
        return false;
    }
  }
);

console.log('cherami-tts offscreen document loaded');
