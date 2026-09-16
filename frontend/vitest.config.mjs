import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/*
 * No @vitejs/plugin-react.
 *
 * Vite 8's built-in oxc transform handles JSX natively for .jsx files, so the
 * plugin adds nothing here — its remaining job, Fast Refresh, is Next.js's
 * concern in dev and irrelevant in tests.
 *
 * This is why the project uses the .jsx extension for files containing JSX and
 * .js for plain JavaScript: the extension is what tells every tool how to parse
 * the file. It is still JavaScript throughout — there is no TypeScript here.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
    // Playwright specs live in e2e/ and are run by Playwright, not Vitest.
    exclude: ['node_modules', '.next', 'e2e'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
