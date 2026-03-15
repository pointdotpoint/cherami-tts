import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        'background/service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        'offscreen/offscreen': resolve(__dirname, 'src/offscreen/offscreen.ts'),
        'options/options': resolve(__dirname, 'src/options/options.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: '[name].[ext]',
        format: 'es',
      },
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'src/manifest.json', dest: '.' },
        { src: 'src/offscreen/offscreen.html', dest: 'offscreen' },
        { src: 'src/options/options.html', dest: 'options' },
        { src: 'src/options/options.css', dest: 'options' },
        { src: 'src/icons/*', dest: 'icons' },
        { src: 'node_modules/piper-tts-web/dist/onnx', dest: '.' },
        { src: 'node_modules/piper-tts-web/dist/piper', dest: '.' },
        { src: 'node_modules/piper-tts-web/dist/worker', dest: '.' },
      ],
    }),
  ],
});
