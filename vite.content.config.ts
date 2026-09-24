import { defineConfig, type Plugin } from 'vite';

// MV3 content scripts declared in the manifest can't use ES imports, so fail the build if any slip in.
const noImports: Plugin = {
  name: 'content-no-imports',
  generateBundle(_, bundle) {
    const chunks = Object.values(bundle).filter((f) => f.type === 'chunk');
    if (chunks.length !== 1) this.error(`content script must be one file, got ${chunks.length} chunks`);
    for (const c of chunks) {
      if (c.type === 'chunk' && /^\s*import\b|\bimport\s*\(/m.test(c.code)) {
        this.error(`content script output ${c.fileName} contains an import statement`);
      }
    }
  },
};

export default defineConfig({
  publicDir: false,
  plugins: [noImports],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/content/index.ts',
      formats: ['iife'],
      name: 'formsAutofill',
      fileName: () => 'content.js',
    },
  },
});
