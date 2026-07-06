import { defineConfig } from 'vitest/config';
import path from 'path';
import 'dotenv/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Agent worktrees under .claude/ contain full repo copies — never run their tests
    exclude: ['**/node_modules/**', '**/.claude/**', '**/dist/**'],
    setupFiles: ['./tests/setup-vitest.js'],
    // Expose local Supabase env to import.meta.env for modules loaded in tests
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
    },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
