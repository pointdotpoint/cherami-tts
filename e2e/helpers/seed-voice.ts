import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import type { Page } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const CACHE_DIR = path.join(ROOT, '.test-cache');
const VOICE_ID = 'en_US-lessac-low';

/**
 * Seeds the voice model into IndexedDB on the extension origin.
 * Uses a temporary local HTTP server to transfer the 60MB model file
 * to the browser without going through page.evaluate serialization (which OOMs).
 */
export async function seedVoice(page: Page, extensionId: string): Promise<void> {
  const modelPath = path.join(CACHE_DIR, `${VOICE_ID}.onnx`);
  const configPath = path.join(CACHE_DIR, `${VOICE_ID}.onnx.json`);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  // Start a temporary HTTP server to serve the model file
  const modelData = fs.readFileSync(modelPath);
  const server = http.createServer((req, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(modelData);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;

  try {
    // Navigate to options page (extension origin for IndexedDB access)
    await page.goto(`chrome-extension://${extensionId}/options/options.html`);
    await page.waitForLoadState('domcontentloaded');

    // Fetch model from local server and write to IndexedDB
    await page.evaluate(
      async ({ voiceId, config, modelUrl }) => {
        // Fetch the model from the local HTTP server (avoids serialization)
        const response = await fetch(modelUrl);
        const modelBlob = await response.blob();

        // Write voice to IndexedDB
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

        const tx = db.transaction('models', 'readwrite');
        const store = tx.objectStore('models');
        await new Promise<void>((resolve, reject) => {
          const req = store.put({
            voiceId,
            config,
            modelBlob,
            timestamp: Date.now(),
          });
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
        db.close();

        // Set chrome.storage.sync to use this voice
        await chrome.storage.sync.set({
          selectedVoice: voiceId,
          speed: 1.0,
        });
      },
      { voiceId: VOICE_ID, config, modelUrl: `http://127.0.0.1:${port}/model.onnx` }
    );

    // Ensure the offscreen document exists and engine is initialized AFTER
    // seeding IDB — the offscreen doc needs the voice data to be present.
    await page.evaluate(async () => {
      chrome.runtime.sendMessage({ type: 'INIT_ENGINE' });
      await new Promise<void>((resolve) => {
        const handler = (msg: any) => {
          if (msg.type === 'ENGINE_READY') {
            chrome.runtime.onMessage.removeListener(handler);
            resolve();
          }
        };
        chrome.runtime.onMessage.addListener(handler);
        setTimeout(resolve, 15000);
      });
    });
  } finally {
    server.close();
  }
}
