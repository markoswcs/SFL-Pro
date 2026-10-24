import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

if (import.meta.env.PROD) {
  registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));
}

// Imagens dos itens do jogo quase nunca mudam.
registerRoute(
  ({ url }) => url.hostname === 'sfl.world' && url.pathname.startsWith('/img/'),
  new CacheFirst({ cacheName: 'sfl-images', plugins: [new ExpirationPlugin({ maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 })] }),
);

// Dados do jogo: rede primeiro, cache como reserva quando estiver offline.
registerRoute(
  ({ url }) => url.pathname === '/api/sfl',
  new NetworkFirst({ cacheName: 'sfl-data', networkTimeoutSeconds: 8, plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 })] }),
);

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// A arte do jogo é pixelada e pequena (16–32 px); o sistema a amplia borrada.
// Aqui ela é ampliada sem suavizar, sobre um quadro arredondado no tema do app.
async function pixelIcon(src) {
  if (!src || typeof OffscreenCanvas === 'undefined') return src;
  try {
    const url = new URL(src, self.location.origin);
    const fetchUrl = url.hostname === 'sfl.world' ? `/api/sfl?url=${encodeURIComponent(url.href)}` : url.href;
    const res = await fetch(fetchUrl, { mode: 'cors' });
    if (!res.ok) return src;
    const bitmap = await createImageBitmap(await res.blob());
    const size = 192;
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#18221a';
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, 44);
    ctx.fill();
    ctx.imageSmoothingEnabled = false;
    const scale = Math.max(1, Math.floor(124 / Math.max(bitmap.width, bitmap.height)));
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:image/png;base64,${btoa(bin)}`;
  } catch {
    return src;
  }
}

self.addEventListener('message', event => {
  // O app aberto pede para mostrar um aviso local com o mesmo tratamento de ícone do push.
  if (event.data?.type === 'SHOW') {
    const { title, options } = event.data;
    event.waitUntil((async () => self.registration.showNotification(title, { ...options, icon: await pixelIcon(options.icon) }))());
  }
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { data = { title: 'SFL Pro', body: event.data?.text() }; }
  const title = data.title ?? 'SFL Pro';
  event.waitUntil((async () => self.registration.showNotification(title, {
    body: data.body ?? '',
    icon: data.icon ? await pixelIcon(data.icon) : '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    image: data.image,
    tag: data.tag ?? 'sfl',
    renotify: true,
    timestamp: data.timestamp ?? Date.now(),
    data: { url: data.url ?? '/?tab=farm' },
  }))());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href;
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = clientsList.find(c => new URL(c.url).origin === self.location.origin);
    if (open) {
      await open.focus();
      open.postMessage({ type: 'NAVIGATE', url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});

// Se o navegador trocar a inscrição de push, avisa o app para reenviar ao servidor.
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clientsList.forEach(c => c.postMessage({ type: 'RESUBSCRIBE' }));
  })());
});
