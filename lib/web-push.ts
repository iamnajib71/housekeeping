import 'server-only';
import webpush from 'web-push';
import type { BrowserSubscription } from './push-validation';

export function pushConfigured() { return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY); }
export async function sendBrowserPush(subscription: BrowserSubscription, payload: { title: string; body: string; url: string; tag: string }) {
  if (!pushConfigured()) throw new Error('Phone notifications are not configured.');
  return webpush.sendNotification(subscription, JSON.stringify(payload), {
    vapidDetails: { subject: process.env.VAPID_SUBJECT || 'mailto:iam.najib16@gmail.com', publicKey: process.env.VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY! },
    TTL: 3600, timeout: 5000, urgency: 'normal',
  });
}
