import { HUGGINGFACE_BASE_URL } from '../shared/constants.js';

const DB_NAME = 'cherami-tts-voices';
const DB_VERSION = 1;
const STORE_NAME = 'models';

interface CachedModel {
  voiceId: string;
  config: object;
  modelBlob: Blob;
  timestamp: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'voiceId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function buildModelUrl(voiceId: string): { configUrl: string; modelUrl: string } {
  // Voice ID format: en_US-lessac-medium
  // Split by '-' separator
  const parts = voiceId.split('-');
  const lang = parts[0].split('_')[0]; // "en" from "en_US"
  const voicePath = parts.join('/'); // "en_US/lessac/medium"
  const voiceFile = parts.join('-'); // "en_US-lessac-medium"

  const base = HUGGINGFACE_BASE_URL + lang + '/' + voicePath + '/' + voiceFile;
  return {
    configUrl: base + '.onnx.json',
    modelUrl: base + '.onnx',
  };
}

export async function downloadVoice(
  voiceId: string,
  onProgress: (progress: number) => void
): Promise<void> {
  const { configUrl, modelUrl } = buildModelUrl(voiceId);

  // Fetch config (small JSON file)
  onProgress(5);
  const configResponse = await fetch(configUrl);
  if (!configResponse.ok) throw new Error(`Failed to fetch voice config: ${configResponse.status}`);
  const config = await configResponse.json();

  // Fetch model (large ONNX file) with progress
  onProgress(10);
  const modelResponse = await fetch(modelUrl);
  if (!modelResponse.ok) throw new Error(`Failed to fetch voice model: ${modelResponse.status}`);

  const contentLength = modelResponse.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  const reader = modelResponse.body!.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total > 0) {
      // Progress from 10-95 for model download
      onProgress(10 + Math.floor((received / total) * 85));
    }
  }

  const modelBlob = new Blob(chunks);

  // Store in IndexedDB
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const entry: CachedModel = {
    voiceId,
    config,
    modelBlob,
    timestamp: Date.now(),
  };

  await new Promise<void>((resolve, reject) => {
    const request = store.put(entry);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  db.close();
  onProgress(100);
}

export async function isCached(voiceId: string): Promise<boolean> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.getKey(voiceId);
    request.onsuccess = () => {
      db.close();
      resolve(request.result !== undefined);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export async function listCached(): Promise<string[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.getAllKeys();
    request.onsuccess = () => {
      db.close();
      resolve(request.result as string[]);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export async function removeVoice(voiceId: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.delete(voiceId);
    request.onsuccess = () => {
      db.close();
      resolve();
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/**
 * Returns voice data in the format expected by piper-tts-web:
 * [configJson, modelBlobUrl]
 */
export async function getVoiceData(voiceId: string): Promise<[any, string]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.get(voiceId);
    request.onsuccess = () => {
      db.close();
      const entry = request.result as CachedModel | undefined;
      if (!entry) {
        reject(new Error(`Voice "${voiceId}" not cached`));
        return;
      }
      const blobUrl = URL.createObjectURL(entry.modelBlob);
      resolve([entry.config, blobUrl]);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}
