import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  resolve: {
    alias: {
      // Trailing slash on both sides so this only matches "@/..." imports and
      // never prefix-collides with scoped npm packages (@tanstack/*, @radix-ui/*).
      // Mirrors the jsconfig.json paths mapping ("@/*": ["./src/*"]).
      '@/': fileURLToPath(new URL('./src/', import.meta.url)),
    },
  },
  server: {
    // Dev-only. `host: true` + `allowedHosts: true` are required so the Vite dev
    // server is reachable through the container's tunneled preview hostname.
    // Production is served as a static Vercel build, not `vite dev`.
    host: true,
    allowedHosts: true,
  },
  plugins: [react()],
});
