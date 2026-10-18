import { chromium, expect } from '@playwright/test';
import { defaultSettings, testMembers } from '../tests/fixtures';
import type { Assignment, Submission } from '../lib/types';

const base = process.env.CHECK_BASE_URL || 'http://localhost:3011';
const me = { ...testMembers[0], guide_completed: true };
const yesterday: Assignment = { id: 'daily-2026-10-18', date: '2026-10-18', kind: 'daily', member_ids: [me.id], tasks: defaultSettings.daily_tasks };
const next: Assignment = { id: 'weekly-2026-10-19', date: '2026-10-19', kind: 'weekly', member_ids: [me.id, testMembers[1].id], tasks: defaultSettings.weekly_tasks };
let stamp = '2026-10-18T14:00:00Z'; // 1 AM Monday in Melbourne.
let subs: Submission[] = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.emulateMedia({ reducedMotion: 'reduce' });
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
await page.clock.install({ time: new Date(stamp) });
await page.addInitScript(() => localStorage.setItem('housekeeping-phone-later', String(Date.now() + 86400000)));
await page.route('**/api/dashboard', r => r.fulfill({ json: { me, members: testMembers, settings: defaultSettings, assignments: [yesterday, next], submissions: subs, today: '2026-10-19', server_now: stamp } }));
await page.route('**/api/account', r => r.fulfill({ json: { ok: true, homes: [] } }));
await page.route('**/api/push', r => r.fulfill({ json: { publicKey: null, userId: null } }));
await page.route('**/api/assignments/*', r => r.fulfill({ json: { submissions: subs, photos: [] } }));
try {
  await page.goto(base + '/app', { waitUntil: 'networkidle' });
  const card = page.locator('.your-turn');
  await expect(card.getByRole('heading', { name: 'Finish yesterday’s clean' })).toBeVisible();
  await expect(card.getByText('Late', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Open my task', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Late submission', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Upload photos', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Take a photo', exact: true })).toBeEnabled();
  await page.screenshot({ path: '.local/late-upload-mobile.png' });
  await page.getByRole('button', { name: 'Close task', exact: true }).click();

  stamp = '2026-10-19T00:59:50Z'; // 11:59:50 AM Melbourne.
  await page.clock.setSystemTime(new Date(stamp));
  await page.reload({ waitUntil: 'networkidle' });
  await card.getByRole('button', { name: 'Open my task', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Upload photos', exact: true })).toBeVisible();
  await page.clock.runFor(20000);
  await expect(dialog).toContainText('The upload window closed at 12 PM');
  await expect(dialog.getByRole('button', { name: 'Upload photos', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close task', exact: true }).click();
  await expect(card.getByRole('heading', { name: 'Your clean today' })).toBeVisible();
  await page.clock.resume();

  // A real late timestamp stays visible in history and proof, including admin entries.
  stamp = '2026-10-19T02:00:00Z';
  subs = [{ id: 'late-proof', assignment_id: yesterday.id, member_id: me.id, tasks: yesterday.tasks, notes: '', status: 'submitted', submitted_at: '2026-10-18T14:00:00Z', finished_at: '2026-10-18T14:00:00Z', review_note: '' }];
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Cleaning history/ }).click();
  const row = page.locator('.assignment-row');
  await expect(row.getByText('Late', { exact: true })).toBeVisible();
  await row.click();
  await expect(dialog.locator('.submission-card').getByText('Late', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close task', exact: true }).click();

  subs = [{ ...subs[0], status: 'rework', task_feedback: [{ task: yesterday.tasks[0], status: 'rework', note: 'Please finish this area.' }] }];
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Cleaning history/ }).click();
  await row.click();
  await expect(dialog.getByRole('button', { name: 'Upload photos', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('heading', { name: 'Tasks to fix and resubmit' })).toBeVisible();
  if (errors.length) throw new Error(errors.join('; '));
  console.log('Late UI passed: yesterday prioritized after midnight, upload/capture enabled, noon cutoff while open, late history and proof labels, and requested fixes preserved.');
} catch (error) {
  await page.screenshot({ path: '.local/late-check-failure.png' });
  console.error(JSON.stringify({ errors, screen: (await page.locator('body').innerText()).slice(0, 3000) }));
  throw error;
} finally { await browser.close(); }
