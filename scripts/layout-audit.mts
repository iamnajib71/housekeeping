import { chromium, expect, type Locator } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { defaultSettings, testMembers } from '../tests/fixtures';
import { generateSchedule } from '../lib/schedule';
import { emptyMealState, ensureDailyRice, type MealGroup } from '../lib/meals';

// Populated, local fixtures only. No household changes or notifications.
const base = process.env.CHECK_BASE_URL || 'http://localhost:3011';
const today = '2026-10-19', now = new Date('2026-10-19T01:00:00Z');
const members = testMembers.map((m, i) => ({ ...m, name: ['Alexandra', 'Jamie', 'Sam', 'Taylor', 'Morgan', 'Casey'][i], email: `housemate-${i}@example.invalid`, guide_completed: true }));
const household = { id: 1, name: 'Our shared home', address: '123 Park Street, Melbourne, Victoria 3000' };
const assignments = generateSchedule(members, defaultSettings, today, '2026-12-31');
const group: MealGroup = ensureDailyRice({ id: 'layout-group', household_id: 1, name: 'Alexandra, Jamie & Sam', member_ids: members.slice(0, 3).map(m => m.id), created_by: members[0].id, created_at: now.toISOString(), version: 1, state: emptyMealState() }, now);
group.state.batches = [
  { id: 'ready', dishes: ['Chicken curry with vegetables', 'Dal'], when: now.toISOString(), ready_at: now.toISOString(), confirmed: true, status: 'ready', roles: { cook: members[1].id, prep: members[2].id, shopper: null }, participants: group.member_ids, days: 3, food: 'low', help: [] },
  { id: 'planned', dishes: ['Fish curry', 'Lentils and mixed vegetables'], when: '2026-10-20T08:00:00Z', confirmed: true, status: 'planned', roles: { cook: members[2].id, prep: members[0].id, shopper: members[1].id }, participants: group.member_ids, days: 2, food: 'enough', help: ['shopper'] },
];
group.state.items = [{ id: 'item', text: 'Fresh vegetables, lentils and the ingredients for tomorrow’s dinner', status: 'needed', urgency: 'next', updated_by: members[0].id }, { id: 'bought', text: 'Rice 5 kg', status: 'bought', urgency: 'later', updated_by: members[1].id }];
group.state.events = [{ id: 'trip', kind: 'grocery', members: group.member_ids.slice(1), on: today, recorded_at: now.toISOString(), actor: members[0].id, note: 'Vegetables and ingredients for this week’s shared meals.' }];
const groups = [group, { ...group, id: 'second-group', name: 'Another household dinner group with a longer name' }];
await mkdir('.local/layout-audit', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const errors: string[] = [], findings: unknown[] = [];
page.on('pageerror', e => errors.push(e.message));
await page.clock.setFixedTime(now);
await page.addInitScript(() => localStorage.setItem('housekeeping-phone-later', String(Date.now() + 86400000)));
await page.route('**/api/dashboard', r => r.fulfill({ json: { me: members[0], members, household, settings: defaultSettings, assignments, submissions: [], today, server_now: now.toISOString() } }));
await page.route('**/api/account', r => r.fulfill({ json: { ok: true, homes: [household], email: members[0].email, name: members[0].name } }));
await page.route('**/api/meals', r => r.fulfill({ json: { groups, today } }));
await page.route('**/api/push', r => r.fulfill({ json: { publicKey: null, userId: null } }));
await page.route('**/api/onboarding', r => r.fulfill({ json: { configured: true, trials: [] } }));
await page.route('**/api/assignments/*', r => r.fulfill({ json: { submissions: [], photos: [] } }));
async function audit(state: string, root: Locator = page.locator('main')) {
  const geometry = await root.evaluate(el => {
    const overflow = [...el.querySelectorAll<HTMLElement>('*')].filter(e => {
      if (!e.checkVisibility() || e.closest('[hidden],input[type=file],.sr-only')) return false;
      const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      return r.width > 0 && s.visibility !== 'hidden' && (r.right > innerWidth + 1 || r.left < -1);
    }).slice(0, 12).map(e => ({ tag: e.tagName, cls: e.className, text: e.textContent?.slice(0, 80) }));
    const clipped = [...el.querySelectorAll<HTMLElement>('button, h1, h2, h3, h4, .meal-fairness [role=cell]')].filter(e => e.checkVisibility() && e.clientWidth && e.scrollWidth > e.clientWidth + 2).map(e => ({ tag: e.tagName, cls: e.className, text: e.textContent?.slice(0, 80) }));
    const controls = [...el.querySelectorAll<HTMLElement>('button,input:not([type=checkbox]):not([type=radio]):not([type=file]),select,textarea')].filter(e => e.checkVisibility() && e.getBoundingClientRect().width > 0);
    const overlaps = [];
    for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i], b = controls[j];
      if (a.contains(b) || b.contains(a) || a.closest('.dialog-footer') !== b.closest('.dialog-footer')) continue;
      const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
      if (Math.min(x.right, y.right) - Math.max(x.left, y.left) > 2 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 2) overlaps.push([a.textContent?.slice(0, 45) || a.getAttribute('aria-label'), b.textContent?.slice(0, 45) || b.getAttribute('aria-label')]);
    }
    return { overflow, clipped, overlaps };
  });
  if (geometry.overflow.length || geometry.clipped.length || geometry.overlaps.length) findings.push({ state, width: page.viewportSize()!.width, ...geometry });
}
async function navigate(name: string) {
  if (page.viewportSize()!.width <= 700) await page.getByRole('button', { name: 'More navigation' }).click();
  await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
}
try {
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(t => localStorage.setItem('housekeeping-theme', t), theme);
    for (const width of [320, 360, 390, 430, 700, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + '/app?view=meals', { waitUntil: 'networkidle' });
      await expect(page.getByLabel('Meal group', { exact: true })).toBeVisible();
      await audit('meals-' + theme);
      const select = await page.getByLabel('Meal group', { exact: true }).boundingBox();
      const menu = page.locator('.meal-group-options > summary');
      const menuBox = await menu.boundingBox();
      expect(Math.abs(select!.y - menuBox!.y), 'Selector and options share a top edge').toBeLessThan(2);
      expect(select!.height).toBe(44);
      expect(menuBox!.height).toBe(44);
      await page.screenshot({ path: `.local/layout-audit/meals-default-${theme}-${width}.png`, fullPage: true });
      await menu.click();
      await page.getByRole('button', { name: 'New group', exact: true }).click();
      await audit('create-meal-group-' + theme);
      await page.getByRole('button', { name: 'Edit plan / swap roles', exact: true }).click();
      await page.locator('.meal-shopping > summary').click();
      await page.locator('.meal-contributions > summary').click();
      await page.getByText('Log a grocery trip · one or more people', { exact: true }).click();
      await page.locator('.meal-reminder-settings > summary').click();
      await page.getByText('Available ingredients', { exact: true }).click();
      await audit('expanded-meal-forms-' + theme);
      if ([320, 390, 768, 1024].includes(width)) await page.screenshot({ path: `.local/layout-audit/meals-${theme}-${width}.png`, fullPage: true });
      for (const nav of ['Overview', 'Cleaning schedule', 'Our household', 'Household settings', 'Household QR code']) {
        await navigate(nav);
        await audit(nav + '-' + theme);
        if (nav === 'Our household') {
          await page.getByRole('button', { name: 'Edit housemate', exact: true }).first().click();
          await audit('edit-housemate-' + theme);
        }
        if (nav === 'Overview') {
          await page.getByRole('button', { name: 'Open my task', exact: true }).click();
          await expect(page.getByRole('dialog')).toBeVisible();
          await audit('task-' + theme, page.getByRole('dialog'));
          await page.getByRole('button', { name: 'Close task', exact: true }).click();
        }
      }
      await page.goto(base + '/welcome?mode=admin_tenant', { waitUntil: 'networkidle' });
      await expect(page.getByLabel('Your name', { exact: true })).toBeVisible();
      await audit('property-setup-' + theme);
    }
  }
  await writeFile('.local/layout-audit/findings.json', JSON.stringify(findings, null, 2));
  console.log(JSON.stringify({ findings: findings.slice(0, 5), totalFindings: findings.length, errors }, null, 2));
  expect(errors).toEqual([]);
  expect(findings).toEqual([]);
  console.log('Populated layout audit passed: meal controls, cooking and grocery forms, shopping, property setup, household edits, settings, task dialog and QR at 8 widths in both themes.');
} finally { await browser.close(); }
