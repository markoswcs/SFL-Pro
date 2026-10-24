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

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { data = { title: 'SFL Pro', body: event.data?.text() }; }
  const title = data.title ?? 'SFL Pro';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body ?? '',
    icon: data.icon ?? '/icons/icon-192.png',
    badge: '/icons/favicon-64.png',
    image: data.image,
    tag: data.tag ?? 'sfl',
    renotify: true,
    timestamp: data.timestamp ?? Date.now(),
    data: { url: data.url ?? '/?tab=farm' },
  }));
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
