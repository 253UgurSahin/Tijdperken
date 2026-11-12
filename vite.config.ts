import { defineConfig } from 'vite';

// Relative base so the build also works from a GitHub Pages sub-path.
// three.js gets its own file: it rarely changes, so browsers keep it cached when only the game code is updated.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
});
