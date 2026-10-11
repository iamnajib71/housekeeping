import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import webpush from 'web-push';
import { validateSubscription } from '../lib/push-validation';
import { buildPushJobs } from '../lib/push-jobs';
import { defaultSettings, testMembers } from './fixtures';
import type { Assignment, Submission } from '../lib/types';

function validSub(endpoint = 'https://fcm.googleapis.com/fcm/send/test-token') {
  const curve = createECDH('prime256v1'); curve.generateKeys();
  return { endpoint, keys: { p256dh: curve.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
}
test('push subscriptions accept real browser encryption keys and reject SSRF destinations and invalid points', () => {
  const sub = validSub(); assert.deepEqual(validateSubscription(sub), sub);
  for (const endpoint of ['http://fcm.googleapis.com/send', 'https://localhost/test', 'https://127.0.0.1/test', 'https://fcm.googleapis.com.evil.example/test', 'https://fcm.googleapis.com:8443/test', 'https://user@fcm.googleapis.com/test', 'https://evil.example/.notify.windows.com']) assert.throws(() => validateSubscription({ ...sub, endpoint }));
  assert.throws(() => validateSubscription({ ...sub, keys: { ...sub.keys, p256dh: Buffer.alloc(65, 4).toString('base64url') } }));
  assert.throws(() => validateSubscription({ ...sub, keys: { ...sub.keys, auth: 'short' } }));
});
test('Web Push payloads are encrypted with persistent VAPID credentials, without calling a provider', () => {
  const sub = validSub(), keys = webpush.generateVAPIDKeys();
  const request = webpush.generateRequestDetails(sub, JSON.stringify({ title: 'Missing proof', url: '/app' }), { vapidDetails: { subject: 'mailto:test@example.invalid', ...keys }, TTL: 3600 });
  assert.equal(request.headers['Content-Encoding'], 'aes128gcm');
  assert.ok(request.body && !request.body.toString().includes('Missing proof'));
  assert.match(String(request.headers.Authorization), /^vapid /);
});
test('push jobs belong only to each missing member and their verified account, independently of email delivery', () => {
  const members = testMembers.map((m, i) => ({ ...m, household_id: 1, email: `member${i}@example.invalid`, user_id: `user${i}` }));
  const a: Assignment = { id: 'weekly-2026-10-12', household_id: 1, kind: 'weekly', date: '2026-10-12', member_ids: [members[0].id, members[1].id], tasks: ['Kitchen', 'Bathroom'] };
  const sub: Submission = { id: 'submitted', assignment_id: a.id, member_id: members[0].id, tasks: ['Kitchen'], status: 'submitted', notes: '', review_note: '', submitted_at: null };
  const devices = members.map((m, i) => ({ id: `device${i}`, email: m.email, user_id: m.user_id }));
  const settings = [{ ...defaultSettings, deadline_hour: 22 }];
  assert.deepEqual(buildPushJobs([a], members, [sub], settings, devices, a.date, 21), []);
  assert.deepEqual(buildPushJobs([a], members, [sub], settings, devices, a.date, 22), [{ subscription_id: 'device1', member_id: members[1].id, assignment_id: a.id, recipient_user_id: 'user1' }]);
  assert.deepEqual(buildPushJobs([a], members, [sub], settings, [{ ...devices[1], user_id: 'other-account' }], a.date, 22), []);
  assert.deepEqual(buildPushJobs([a], members, [sub], [{ ...settings[0], reminders_enabled: false }], devices, a.date, 22), []);
});
test('service worker opens only app links and does not cache private responses', async () => {
  const handlers: Record<string, Function> = {}, shown: unknown[] = [], opened: string[] = [];
  const self = { location: { origin: 'https://household.example' }, addEventListener: (name: string, fn: Function) => handlers[name] = fn, registration: { showNotification: async (_title: string, options: unknown) => shown.push(options) }, clients: { matchAll: async () => [], openWindow: async (url: string) => opened.push(url) } };
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, URL });
  assert.equal(handlers.fetch, undefined);
  let work: Promise<unknown> = Promise.resolve();
  handlers.push({ data: { json: () => ({ title: 'Reminder', url: 'https://evil.example/phishing' }) }, waitUntil: (p: Promise<unknown>) => work = p }); await work;
  assert.equal((shown[0] as { data: { url: string } }).data.url, '/app');
  handlers.notificationclick({ notification: { close() {}, data: { url: '/app?assignment=daily-2026-10-11&home=1' } }, waitUntil: (p: Promise<unknown>) => work = p }); await work;
  assert.equal(opened[0], 'https://household.example/app?assignment=daily-2026-10-11&home=1');
});
