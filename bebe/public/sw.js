/* Ninho · Service Worker: recebe as notificações push e abre o app no bebê certo ao tocar. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Ninho', {
    body: d.body || '',
    icon: d.icon || './icon-192.png',
    badge: './badge-96.png',
    tag: d.tag,
    renotify: !!d.tag,
    data: { url: d.url || './' },
    lang: 'pt-BR',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const alvo = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of janelas) {
      if (c.url.startsWith(self.registration.scope)) {
        await c.focus();
        c.postMessage({ tipo: 'abrir', url: alvo });
        return;
      }
    }
    await self.clients.openWindow(alvo);
  })());
});
