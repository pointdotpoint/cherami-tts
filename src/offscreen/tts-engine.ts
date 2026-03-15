// @ts-ignore - piper-tts-web has no type declarations
import { PiperWebEngine, OnnxWebRuntime, PhonemizeWebRuntime } from 'piper-tts-web';
import { getVoiceData } from './voice-manager.js';

let engine: any = null;

/**
 * Custom voice provider that serves models from IndexedDB cache
 * instead of fetching from HuggingFace each time.
 */
class CachedVoiceProvider {
  #cache: Record<string, [any, string]> = {};

  destroy() {
    for (const key in this.#cache) {
      URL.revokeObjectURL(this.#cache[key][1]);
    }
    this.#cache = {};
  }

  async fetch(voiceId: string): Promise<[any, string]> {
    if (!this.#cache[voiceId]) {
      this.#cache[voiceId] = await getVoiceData(voiceId);
    }
    return this.#cache[voiceId];
  }
}

let voiceProvider: CachedVoiceProvider | null = null;

export async function initEngine(): Promise<void> {
  if (engine) return;

  const onnxBasePath = chrome.runtime.getURL('onnx/');
  const piperBasePath = chrome.runtime.getURL('piper/');

  const onnxRuntime = new OnnxWebRuntime({
    basePath: onnxBasePath,
    numThreads: 1, // SharedArrayBuffer not reliable in extensions
  });

  const phonemizeRuntime = new PhonemizeWebRuntime({
    basePath: piperBasePath,
  });

  // We don't need expression runtime for TTS-only usage.
  const dummyExpressionRuntime = {
    destroy() {},
    generate() { return Promise.resolve({}); },
  };

  voiceProvider = new CachedVoiceProvider();

  engine = new PiperWebEngine({
    onnxRuntime,
    phonemizeRuntime,
    expressionRuntime: dummyExpressionRuntime,
    voiceProvider,
  });
}

export async function synthesize(
  text: string,
  voiceId: string,
  speed: number
): Promise<Blob> {
  if (!engine) {
    await initEngine();
  }

  // Pre-load voice data to modify length_scale for speed
  const voiceData = await voiceProvider!.fetch(voiceId);
  const originalLengthScale = voiceData[0].inference.length_scale;
  voiceData[0].inference.length_scale = originalLengthScale / speed;

  try {
    const response = await engine.generate(text, voiceId, 0);
    return response.file as Blob;
  } finally {
    // Restore original length_scale
    voiceData[0].inference.length_scale = originalLengthScale;
  }
}

export function destroyEngine(): void {
  if (engine) {
    engine.destroy();
    engine = null;
  }
  if (voiceProvider) {
    voiceProvider.destroy();
    voiceProvider = null;
  }
}
