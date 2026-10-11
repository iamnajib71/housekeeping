import test from 'node:test';
import assert from 'node:assert/strict';
import { localClock } from '../lib/schedule';
import { memberReminderTypes, reminderIsCurrent } from '../lib/reminders';
import { defaultSettings } from './fixtures';
import type { Assignment, Submission } from '../lib/types';

const settings = { ...defaultSettings, deadline_hour: 22 };
const daily: Assignment = { id: 'daily-2026-10-11', household_id: 1, date: '2026-10-11', kind: 'daily', member_ids: ['siam'], tasks: ['Clean kitchen'] };
const submission = (memberId: string, status: Submission['status'], a = daily): Submission => ({ id: memberId, assignment_id: a.id, member_id: memberId, tasks: a.tasks, notes: '', status, submitted_at: null, review_note: '' });

test('overdue email begins at 10 PM Melbourne time, in summer and winter', () => {
  for (const [date, before, due] of [
    ['2026-10-11', '2026-10-11T10:59:59Z', '2026-10-11T11:00:00Z'],
    ['2027-06-06', '2027-06-06T11:59:59Z', '2027-06-06T12:00:00Z'],
  ]) {
    const a = { ...daily, date };
    const beforeClock = localClock(new Date(before)), dueClock = localClock(new Date(due));
    assert.deepEqual(memberReminderTypes(a, 'siam', [], beforeClock.date, beforeClock.hour, settings), ['today']);
    assert.deepEqual(memberReminderTypes(a, 'siam', [], dueClock.date, dueClock.hour, settings), ['overdue']);
    assert.deepEqual(memberReminderTypes(a, 'siam', [], date, 23, settings), ['overdue']);
  }
});

test('Monday only reminds the partner who still needs to submit', () => {
  const a: Assignment = { ...daily, id: 'weekly-2026-10-12', date: '2026-10-12', kind: 'weekly', member_ids: ['najib', 'zarif'] };
  for (const status of ['submitted', 'approved'] as const) {
    const subs = [submission('najib', status, a)];
    assert.deepEqual(memberReminderTypes(a, 'najib', subs, a.date, 22, settings), []);
    assert.deepEqual(memberReminderTypes(a, 'zarif', subs, a.date, 22, settings), ['overdue']);
    assert.equal(reminderIsCurrent('overdue', a, 'najib', subs, a.date, 22, settings), false);
  }
});

test('drafts and rejected work need a reminder; unrelated submissions do not complete this assignment', () => {
  for (const status of ['draft', 'rework'] as const) {
    assert.deepEqual(memberReminderTypes(daily, 'siam', [submission('siam', status)], daily.date, 22, settings), ['overdue']);
  }
  const old = { ...submission('siam', 'approved'), assignment_id: 'daily-2026-10-04' };
  assert.deepEqual(memberReminderTypes(daily, 'siam', [old], daily.date, 22, settings), ['overdue']);
  assert.deepEqual(memberReminderTypes(daily, 'najib', [], daily.date, 22, settings), []);
  assert.deepEqual(memberReminderTypes(daily, 'siam', [], daily.date, 22, { ...settings, reminders_enabled: false }), []);
});

test('queued messages are rechecked after a last-minute submission or reminder window change', () => {
  assert.equal(reminderIsCurrent('overdue', daily, 'siam', [], daily.date, 21, settings), false);
  assert.equal(reminderIsCurrent('overdue', daily, 'siam', [], daily.date, 22, settings), true);
  assert.equal(reminderIsCurrent('today', daily, 'siam', [], daily.date, 22, settings), false);
  assert.equal(reminderIsCurrent('overdue', daily, 'siam', [submission('siam', 'submitted')], daily.date, 22, settings), false);
  assert.equal(reminderIsCurrent('overdue', daily, 'siam', [], '2026-10-13', 8, settings), false);
  assert.equal(reminderIsCurrent('rework', daily, 'siam', [submission('siam', 'rework')], daily.date, 22, settings), true);
});
