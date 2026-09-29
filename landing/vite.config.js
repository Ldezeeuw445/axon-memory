import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The landing page is its own build, deployed to the `axon-memory` Pages
// project (axon-memory.com). The app is a separate build on app.axon-memory.com.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Chunking is left to rolldown (Vite 8's bundler) — it splits the three /
    // r3f vendor code out on its own, and its object form of manualChunks is
    // not supported.
  },
});
