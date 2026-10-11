import { ECDH } from 'node:crypto';

export type BrowserSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
export function validateSubscription(input: unknown): BrowserSubscription {
  const sub = input as Partial<BrowserSubscription> | null;
  if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 2000) throw new Error('Invalid notification subscription.');
  const url = new URL(sub.endpoint);
  const host = url.hostname;
  const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(host) || host.endsWith('.notify.windows.com');
  if (url.protocol !== 'https:' || !allowed || url.username || url.password || (url.port && url.port !== '443') || url.hash) throw new Error('Unsupported notification service.');
  const key = sub.keys?.p256dh, auth = sub.keys?.auth;
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{87}$/.test(key) || typeof auth !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(auth)) throw new Error('Invalid notification keys.');
  const point = Buffer.from(key, 'base64url');
  if (point.length !== 65 || point[0] !== 4 || Buffer.from(auth, 'base64url').length !== 16) throw new Error('Invalid notification keys.');
  ECDH.convertKey(point, 'prime256v1');
  return { endpoint: sub.endpoint, keys: { p256dh: key, auth } };
}
