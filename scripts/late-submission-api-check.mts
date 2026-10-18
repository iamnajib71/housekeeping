import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { chromium, expect } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { addDays, localClock } from '../lib/schedule';

createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const base = process.env.CHECK_BASE_URL || 'http://localhost:3011';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const db = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch();
const context = await browser.newContext();
let home: number | undefined, user: string | undefined;
let auth: ReturnType<typeof createServerClient> | undefined;
function checked<T>(result: { data: T; error: unknown }): T { if (result.error) throw result.error; return result.data; }
try {
  const email = `late-check-${randomUUID()}@example.invalid`, password = randomBytes(24).toString('base64url');
  const created = checked(await db.auth.admin.createUser({ email, password, email_confirm: true }));
  user = created.user!.id;
  let jar: { name: string; value: string; options?: unknown }[] = [];
  auth = createServerClient(url, key, { cookies: { getAll: () => jar, setAll: values => { jar = values; } } });
  const signed = await auth.auth.signInWithPassword({ email, password }); if (signed.error) throw signed.error;
  await context.addCookies(jar.map(c => ({ name: c.name, value: c.value, url: base, httpOnly: false, sameSite: 'Lax' as const })));
  home = checked(await db.rpc('create_household', { p_user: user, p_email: email, p_name: 'Late window integration fixture', p_address: 'Test fixture only', p_member_name: 'Window tester', p_participates: true })) as number;
  const owner = checked(await db.from('members').select('id').eq('household_id', home).eq('user_id', user).single())!;
  const clock = localClock(), old = `${home}-daily-${addDays(clock.date, -2)}`;
  const positiveDate = clock.hour < 12 ? addDays(clock.date, -1) : clock.date;
  const positive = `${home}-daily-${positiveDate}`, task = 'Kitchen: Test surfaces';
  checked(await db.from('assignments').insert([old, positive].map(id => ({ id, date: id.slice(-10), kind: 'daily', household_id: home, member_ids: [owner.id], tasks: [task] }))));
  const headers = { Origin: base, 'x-household-id': String(home) };
  async function post(id: string, action: string) { return context.request.post(`${base}/api/assignments/${id}`, { headers, data: { action, tasks: [task], notes: 'Integration fixture' } }); }
  for (const action of ['start', 'draft', 'submit']) expect((await post(old, action)).status()).toBe(409);
  const closedUpload = await context.request.post(`${base}/api/assignments/${old}/photos`, { headers, multipart: { photo: { name: 'blocked.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([255, 216, 255, 217]) } } });
  expect(closedUpload.status()).toBe(409);
  expect(checked(await db.from('submissions').select('id').eq('assignment_id', old))).toHaveLength(0);
  expect((await context.request.get(`${base}/api/assignments/${old}`, { headers })).status()).toBe(200);

  const page = await context.newPage();
  const encoded = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 8; const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#999'; ctx.fillRect(0, 0, 8, 8); return canvas.toDataURL('image/jpeg').split(',')[1]; });
  const photo = { name: 'fixture.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(encoded, 'base64') };
  expect((await post(positive, 'draft')).status()).toBe(200);
  expect((await context.request.post(`${base}/api/assignments/${positive}/photos`, { headers, multipart: { photo } })).status()).toBe(200);
  expect((await post(positive, 'submit')).status()).toBe(200);
  const submitted = checked(await db.from('submissions').select('status,submitted_at,started_at').eq('assignment_id', positive).single())!;
  expect(submitted.status).toBe('submitted'); expect(submitted.started_at).toBeNull(); expect(submitted.submitted_at).toBeTruthy();

  // A requested correction is an explicit exception to the initial noon deadline.
  const draft = checked(await db.rpc('save_draft', { p_assignment: old, p_member: owner.id, p_tasks: [task], p_notes: '' }));
  checked(await db.from('submissions').update({ status: 'rework', tasks: [task], task_feedback: [{ task, status: 'rework', note: 'Fixture correction' }] }).eq('id', draft.id));
  expect((await post(old, 'start')).status()).toBe(200);
  expect((await context.request.post(`${base}/api/assignments/${old}/photos`, { headers, multipart: { photo } })).status()).toBe(200);
  expect((await post(old, 'submit')).status()).toBe(200);
  expect((await context.request.post(`${base}/api/assignments/${old}`, { headers: { ...headers, 'x-household-id': '999999' }, data: { action: 'start' } })).status()).toBe(403);
  console.log('API window passed: closed start/draft/submit/upload blocked without creating rows; valid upload and submission accepted; optional timer preserved; requested fixes allowed; household access checked. No notifications sent.');
} finally {
  if (home) {
    const assignments = checked(await db.from('assignments').select('id').eq('household_id', home)) || [];
    const subs = assignments.length ? checked(await db.from('submissions').select('id').in('assignment_id', assignments.map(a => a.id))) || [] : [];
    const photos = subs.length ? checked(await db.from('photos').select('path').in('submission_id', subs.map(s => s.id))) || [] : [];
    if (photos.length) checked(await db.storage.from('cleaning-proof').remove(photos.map(p => p.path)));
    if (subs.length) checked(await db.from('photos').delete().in('submission_id', subs.map(s => s.id)));
    if (assignments.length) checked(await db.from('submissions').delete().in('assignment_id', assignments.map(a => a.id)));
    checked(await db.from('assignments').delete().eq('household_id', home));
    checked(await db.from('household_settings').delete().eq('id', home));
    checked(await db.from('members').delete().eq('household_id', home));
    checked(await db.from('households').delete().eq('id', home));
  }
  await auth?.auth.signOut();
  if (user) checked(await db.auth.admin.deleteUser(user));
  await browser.close();
}
