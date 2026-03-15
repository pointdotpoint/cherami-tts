import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Page } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const CACHE_DIR = path.join(ROOT, '.test-cache');
const VOICE_ID = 'en_US-lessac-low';

export async function seedVoice(page: Page, extensionId: string): Promise<void> {
  const modelBuffer = fs.readFileSync(path.join(CACHE_DIR, `${VOICE_ID}.onnx`));
  const configText = fs.readFileSync(path.join(CACHE_DIR, `${VOICE_ID}.onnx.json`), 'utf-8');
  const config = JSON.parse(configText);

  await page.goto(`chrome-extension://${extensionId}/options/options.html`);
  await page.waitForLoadState('domcontentloaded');

  await page.evaluate(
    async ({ voiceId, config, modelData }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('cherami-tts-voices', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('models')) {
            db.createObjectStore('models', { keyPath: 'voiceId' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      const blob = new Blob([new Uint8Array(modelData)]);
      const tx = db.transaction('models', 'readwrite');
      const store = tx.objectStore('models');
      await new Promise<void>((resolve, reject) => {
        const req = store.put({
          voiceId,
          config,
          modelBlob: blob,
          timestamp: Date.now(),
        });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      db.close();

      await chrome.storage.sync.set({
        selectedVoice: voiceId,
        speed: 1.0,
      });
    },
    {
      voiceId: VOICE_ID,
      config,
      modelData: Array.from(modelBuffer),
    }
  );
}
