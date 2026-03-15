import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  globalSetup: './global-setup.ts',
  use: {
    // Chrome extensions require headed mode
    headless: false,
  },
});
