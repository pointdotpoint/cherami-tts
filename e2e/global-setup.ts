import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const CACHE_DIR = path.join(ROOT, '.test-cache');

const VOICE_ID = 'en_US-lessac-low';
const HF_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/low';
const MODEL_FILE = `${VOICE_ID}.onnx`;
const CONFIG_FILE = `${VOICE_ID}.onnx.json`;

async function globalSetup() {
  console.log('Building extension...');
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });

  const manifest = path.join(DIST, 'manifest.json');
  if (!fs.existsSync(manifest)) {
    throw new Error(`Build failed: ${manifest} not found`);
  }
  console.log('Build verified.');

  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const modelPath = path.join(CACHE_DIR, MODEL_FILE);
  const configPath = path.join(CACHE_DIR, CONFIG_FILE);

  if (!fs.existsSync(modelPath) || !fs.existsSync(configPath)) {
    console.log('Downloading voice model (en_US-lessac-low)...');

    for (const file of [MODEL_FILE, CONFIG_FILE]) {
      const url = `${HF_BASE}/${file}`;
      const dest = path.join(CACHE_DIR, file);
      console.log(`  Fetching ${file}...`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download ${url}: ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(dest, buffer);
      console.log(`  Saved ${file} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
    }
  } else {
    console.log('Voice model already cached.');
  }
}

export default globalSetup;
