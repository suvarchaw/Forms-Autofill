import { defineConfig } from 'vitest/config';

// Popup + background (ES module). The content script has its own IIFE build: vite.content.config.ts.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false, // npm scripts clear dist/ so the two builds don't wipe each other
    rollupOptions: {
      input: {
        popup: 'src/popup/index.html',
        background: 'src/background/index.ts',
      },
      output: { entryFileNames: '[name].js' },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
  },
});
