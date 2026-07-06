import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// The SPA lives under /app (shell: app.html); / serves the static marketing
// landing page (index.html). In production Vercel rewrites /app/* -> /app.html
// (see vercel.json); this plugin does the same for `vite dev` and `vite preview`.
const appShellRewrite = () => {
  const rewrite = (req, _res, next) => {
    const path = req.url.split('?')[0];
    if (path === '/app' || path.startsWith('/app/')) req.url = '/app.html';
    next();
  };
  return {
    name: 'app-shell-rewrite',
    configureServer(server) { server.middlewares.use(rewrite); },
    configurePreviewServer(server) { server.middlewares.use(rewrite); },
  };
};

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  build: {
    rollupOptions: {
      input: {
        landing: fileURLToPath(new URL('./index.html', import.meta.url)),
        app: fileURLToPath(new URL('./app.html', import.meta.url)),
      },
    },
  },
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
  plugins: [react(), appShellRewrite()],
});
