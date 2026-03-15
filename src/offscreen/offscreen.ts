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

function sendState(state: TtsState, error?: string) {
  chrome.runtime.sendMessage({
    type: MessageType.TTS_STATE,
    state,
    error,
  });
}

// Split text into sentences for sequential synthesis
function splitIntoChunks(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace
  const chunks = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
  // Filter empty/whitespace-only chunks and trim
  return chunks.map(c => c.trim()).filter(c => c.length > 0);
}

let speakAborted = false;

async function handleSpeak(msg: SpeakMessage) {
  speakAborted = false;
  sendState(TtsState.LOADING);

  try {
    await initEngine();

    const chunks = splitIntoChunks(msg.text);

    for (let i = 0; i < chunks.length; i++) {
      if (speakAborted) {
        sendState(TtsState.STOPPED);
        return;
      }

      const wavBlob = await synthesize(chunks[i], msg.voiceId, msg.speed);

      if (speakAborted) {
        sendState(TtsState.STOPPED);
        return;
      }

      sendState(TtsState.SPEAKING);

      // Play and wait for it to finish
      await new Promise<void>((resolve) => {
        playAudio(wavBlob, resolve);
      });
    }

    if (!speakAborted) {
      sendState(TtsState.IDLE);
    }
  } catch (err: any) {
    console.error('TTS error:', err);
    sendState(TtsState.ERROR, err.message || 'Unknown TTS error');
  }
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
  (message: ExtensionMessage, _sender, sendResponse) => {
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
        handleSpeak(message);
        return false;

      case MessageType.STOP:
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
