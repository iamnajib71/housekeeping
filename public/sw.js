// Push only: never cache private dashboards, authentication, APIs or proof.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  let url = '/app';
  try { const target = new URL(data.url || '/app', self.location.origin); if (target.origin === self.location.origin && target.pathname === '/app') url = target.pathname + target.search; } catch {}
  event.waitUntil(self.registration.showNotification(data.title || 'Housekeeping reminder', {
    body: data.body || 'Open the app to check your cleaning task.',
    icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    tag: data.tag || 'housekeeping-reminder', data: { url },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/app', self.location.origin);
  if (url.origin !== self.location.origin || url.pathname !== '/app') return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) if (new URL(client.url).origin === self.location.origin) {
      await client.navigate(url.href); await client.focus(); return;
    }
    await self.clients.openWindow(url.href);
  })());
});
