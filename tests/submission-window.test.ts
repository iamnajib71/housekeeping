import test from 'node:test';
import assert from 'node:assert/strict';
import { canSubmitInWindow, isLateSubmission, submissionWindow } from '../lib/submission-window';
import { localClock, reminderTypes } from '../lib/schedule';
import { defaultSettings } from './fixtures';

test('the original date remains open and the next morning is a late window until noon', () => {
  assert.equal(submissionWindow('2026-10-18', undefined, { date: '2026-10-18', hour: 23 }), 'open');
  assert.equal(submissionWindow('2026-10-18', 'draft', { date: '2026-10-19', hour: 0 }), 'late');
  assert.equal(submissionWindow('2026-10-18', 'draft', { date: '2026-10-19', hour: 11 }), 'late');
  assert.equal(submissionWindow('2026-10-18', 'draft', { date: '2026-10-19', hour: 12 }), 'closed');
  assert.equal(submissionWindow('2026-10-18', undefined, { date: '2026-10-20', hour: 0 }), 'closed');
});

test('noon cutoff follows Melbourne wall time across daylight saving, month and year boundaries', () => {
  assert.equal(submissionWindow('2026-10-03', undefined, localClock(new Date('2026-10-04T00:59:59Z'))), 'late');
  assert.equal(submissionWindow('2026-10-03', undefined, localClock(new Date('2026-10-04T01:00:00Z'))), 'closed');
  assert.equal(submissionWindow('2026-04-04', undefined, localClock(new Date('2026-04-05T01:59:59Z'))), 'late');
  assert.equal(submissionWindow('2026-04-04', undefined, localClock(new Date('2026-04-05T02:00:00Z'))), 'closed');
  assert.equal(submissionWindow('2026-12-31', undefined, { date: '2027-01-01', hour: 11 }), 'late');
});

test('future and submitted work stay locked, but admin-requested fixes remain actionable', () => {
  const clock = { date: '2026-10-19', hour: 15 };
  assert.equal(canSubmitInWindow(submissionWindow('2026-10-20', undefined, clock)), false);
  assert.equal(canSubmitInWindow(submissionWindow('2026-10-18', 'submitted', clock)), false);
  assert.equal(canSubmitInWindow(submissionWindow('2026-10-18', 'approved', clock)), false);
  assert.equal(canSubmitInWindow(submissionWindow('2026-10-12', 'rework', clock)), true);
});

test('late labels are derived from actual submission timestamps after Melbourne midnight', () => {
  assert.equal(isLateSubmission('2026-10-18', { submitted_at: '2026-10-18T12:59:59Z' }), false);
  assert.equal(isLateSubmission('2026-10-18', { submitted_at: '2026-10-18T13:00:00Z' }), true);
  assert.equal(isLateSubmission('2026-10-14', { submitted_at: '2026-10-18T12:52:32Z' }), true);
  assert.equal(isLateSubmission('2026-10-18', { submitted_at: null }), false);
  assert.equal(isLateSubmission('2026-10-18', { submitted_at: 'invalid' }), false);
});

test('overdue reminders stop when the initial upload window closes', () => {
  assert.deepEqual(reminderTypes('2026-10-18', '2026-10-19', 11, defaultSettings, false), ['overdue']);
  assert.deepEqual(reminderTypes('2026-10-18', '2026-10-19', 12, defaultSettings, false), []);
});
