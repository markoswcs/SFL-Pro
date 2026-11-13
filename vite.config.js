import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import sflProxy from './api/sfl.js';
import translateApi from './api/translate.js';

// Em desenvolvimento, serve /api/sfl com o mesmo handler da função da Vercel.
const devApi = {
  name: 'dev-api',
  configureServer(server) {
    // Disponibiliza SFL_API_KEY do .env.local para o proxy, como a Vercel faz em produção.
    process.env.SFL_API_KEY ??= loadEnv(server.config.mode, process.cwd(), '').SFL_API_KEY;
    // Mesmo formato (req/res) das funções da Vercel, para rodar os handlers de api/ sem mudanças.
    const route = (path, handler) => server.middlewares.use(path, async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const shim = {
        status(code) { res.statusCode = code; return shim; },
        setHeader: (k, v) => res.setHeader(k, v),
        json(body) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return shim; },
        send(body) { res.end(body); return shim; },
      };
      await handler({ method: req.method, headers: req.headers, query: Object.fromEntries(url.searchParams) }, shim);
    });
    route('/api/sfl', sflProxy);
    route('/api/translate', translateApi);
  },
};

export default defineConfig({
  plugins: [
    react(),
    devApi,
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'prompt',
      injectRegister: false,
      devOptions: { enabled: true, type: 'module' },
      injectManifest: { globPatterns: ['**/*.{js,css,html,png,webp,svg,woff2}'] },
      manifest: {
        id: '/',
        name: 'SFL Pro — Sunflower Land',
        short_name: 'SFL Pro',
        description: 'Timers da fazenda, mercado e notificações em tempo real para Sunflower Land.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'portrait',
        background_color: '#0c110d',
        theme_color: '#0c110d',
        categories: ['games', 'utilities'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Fazenda', url: '/?tab=farm', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Notificações', url: '/?tab=alerts', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
    }),
  ],
});
