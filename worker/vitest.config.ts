import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // Fake key for tests only; every Groq fetch is mocked.
      miniflare: { bindings: { GROQ_API_KEY: 'test-key' } },
    }),
  ],
});
