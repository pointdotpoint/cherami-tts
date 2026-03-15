import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist/content',
    emptyOutDir: false,
    sourcemap: false,
    rollupOptions: {
      input: {
        'content-script': resolve(__dirname, 'src/content/content-script.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
});
