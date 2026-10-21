import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { defaultSettings, testMembers } from '../tests/fixtures';
import { generateSchedule } from '../lib/schedule';

const base = process.env.CHECK_BASE_URL || 'http://localhost:3011';
const members = testMembers.map(m => ({ ...m, guide_completed: true }));
const today = '2026-10-19';
const assignments = generateSchedule(members, defaultSettings, today, '2027-01-03');
const household = { id: 1, name: 'Demo household', address: 'Fictional demo property' };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
await page.emulateMedia({ colorScheme: 'light' });
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => localStorage.setItem('housekeeping-phone-later', String(Date.now() + 86400000)));
await page.route('**/api/dashboard', r => r.fulfill({ json: {
  me: members[0], members, household, settings: defaultSettings,
  assignments, submissions: [], today,
} }));
await page.route('**/api/account', r => r.fulfill({ json: { ok: true, homes: [household], name: 'Alex', email: 'alex@example.invalid' } }));
await page.route('**/api/assignments/*', r => r.fulfill({ json: { submissions: [], photos: [] } }));
await page.route('**/api/push', r => r.fulfill({ json: { publicKey: null, userId: null } }));
await page.route('**/api/meals', r => r.fulfill({ json: { groups: [], today } }));
await page.route('**/api/onboarding', r => r.fulfill({ json: { configured: true, trials: [] } }));
async function fits() {
  const overflow = await page.evaluate(() => ({
    fits: document.documentElement.scrollWidth <= innerWidth,
    route: location.pathname,
    width: innerWidth,
    elements: [...document.querySelectorAll('main *,header *')].filter(el => {
      const r = el.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1;
    }).slice(0, 8).map(el => ({ tag: el.tagName, cls: el.className, text: el.textContent?.slice(0, 65) })),
  }));
  expect(overflow.fits, JSON.stringify(overflow)).toBe(true);
}
try {
  await mkdir('.local', { recursive: true });
  await page.goto(base + '/app', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Today at home' })).toBeVisible();
  await expect(page.getByText(household.address)).toBeVisible();
  const personal = await page.locator('.your-turn').boundingBox();
  const stats = await page.locator('.stat-grid').boundingBox();
  expect(personal!.y).toBeLessThan(stats!.y);
  await fits();
  await page.screenshot({ path: '.local/design-desktop.png', fullPage: true });

  for (const width of [1024, 768, 430, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await fits();
    if (width > 700) continue;
    const tabs = page.getByRole('navigation', { name: 'Quick navigation' });
    await expect(tabs).toBeVisible();
    const todayButton = tabs.getByRole('button', { name: 'Today', exact: true });
    await expect(todayButton).toHaveAttribute('aria-current', 'page');
    await page.screenshot({ path: `.local/design-mobile-${width}.png`, fullPage: true });
    await tabs.getByRole('button', { name: 'Schedule', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Cleaning schedule', exact: true })).toBeVisible();
    await page.getByLabel('Jump to schedule date').fill('2026-10-26');
    await page.locator('.assignment-row').filter({ hasText: 'The Monday deep clean' }).click();
    await expect(page.getByRole('region', { name: 'Assigned duties' })).toBeVisible();
    await page.getByRole('button', { name: 'Close task', exact: true }).click();
    await fits();
    await tabs.getByRole('button', { name: 'Meals', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Start a meal group' })).toBeVisible();
    await fits();
    const more = tabs.getByRole('button', { name: 'More navigation' });
    await more.click();
    const drawer = page.getByRole('dialog', { name: 'Household navigation' });
    await expect(drawer).toBeVisible();
    const close = drawer.getByRole('button', { name: 'Close navigation drawer' });
    await expect(close).toBeFocused();
    // The last control wraps back to the first, keeping keyboard users in the drawer.
    await drawer.getByRole('button', { name: 'Log out', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect(more).toBeFocused();
    await todayButton.click();
  }

  // All dashboard pages must fit, not just the opening screen.
  for (const width of [1440, 768, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [nav, heading] of [
      ['Cleaning history', 'Cleaning history'],
      ['Our household', 'Our household'],
      ['Household settings', 'Household settings'],
      ['Household QR code', 'Your household QR code'],
    ]) {
      if (width <= 700) await page.getByRole('button', { name: 'More navigation' }).click();
      await page.locator('.sidebar').getByRole('button', { name: nav, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await fits();
      await page.screenshot({ path: `.local/design-${nav.replaceAll(' ', '-').toLowerCase()}-${width}.png`, fullPage: true });
    }
  }
  // A short landscape viewport keeps the drawer scrollable and the task reachable.
  await page.setViewportSize({ width: 667, height: 375 });
  await page.getByRole('button', { name: 'More navigation' }).click();
  const landscapeDrawer = page.getByRole('dialog', { name: 'Household navigation' });
  await landscapeDrawer.getByRole('button', { name: 'Household settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Household settings', exact: true })).toBeVisible();
  await fits();

  // Reduced-motion mode and unconfigured sign-up stay usable without touching auth.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  expect(await page.locator('.task-icon').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + '/signup', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Manage properties/ })).toBeVisible();
  await page.screenshot({ path: '.local/design-signup-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 });
  await fits();
  // Check rendered option geometry rather than assuming CSS took effect.
  const options = page.locator('.signup-options label');
  for (const option of await options.all()) {
    const input = await option.locator('input').boundingBox();
    const text = await option.locator('span').boundingBox();
    expect(input!.x + input!.width).toBeLessThanOrEqual(text!.x);
    expect(Math.abs(input!.y - text!.y)).toBeLessThan(10);
  }
  await page.getByRole('radio', { name: /Manage my shared home/ }).check();
  await expect(page.getByRole('radio', { name: /Manage my shared home/ })).toBeChecked();
  await page.getByRole('radio', { name: /Manage properties/ }).check();
  await expect(page.getByRole('radio', { name: /Manage properties/ })).toBeChecked();
  await page.screenshot({ path: '.local/design-signup-mobile.png', fullPage: true });
  for (const path of ['/', '/invite?token=invalid', '/welcome?mode=admin_tenant', '/setup']) {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await fits();
    await page.screenshot({ path: `.local/design-route-${path.split('?')[0].replaceAll('/', '') || 'login'}-mobile.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('housekeeping-theme'))).toBe('dark');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Switch to light mode', exact: true })).toBeVisible();
  for (const path of ['/signup', '/welcome?mode=admin_tenant', '/setup']) {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await fits();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: `.local/design-dark-${path.split('?')[0].replaceAll('/', '')}-mobile.png`, fullPage: true });
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + '/app', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Today at home', exact: true })).toBeVisible();
    await fits();
    expect(await page.locator('.your-turn').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(32, 35, 41)');
    expect(await page.locator('.your-turn .button.primary').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(123, 216, 183)');
    await page.screenshot({ path: `.local/design-dark-overview-${width}.png`, fullPage: true });
    for (const nav of ['Shared meals', 'Our household', 'Cleaning history', 'Household settings', 'Household QR code']) {
      if (width <= 700) await page.getByRole('button', { name: 'More navigation' }).click();
      await page.locator('.sidebar').getByRole('button', { name: nav, exact: true }).click();
      await fits();
      await page.screenshot({ path: `.local/design-dark-${nav.replaceAll(' ', '-').toLowerCase()}-${width}.png`, fullPage: true });
    }
  }
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  if (errors.length) throw new Error(errors.join('; '));
  console.log('Design checks passed: all dashboard pages and public flows, 1440/1024/768/430/390/360/320 and landscape layouts, signup radio alignment and selection, future Monday duties, private meal empty state, drawer keyboard containment, reduced motion, dark surfaces and saved light/dark preference across reloads and routes.');
} finally {
  await browser.close();
}
