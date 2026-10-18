import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTimeOfDay, formatLocalDateTime } from '../lib/display-time';

test('clock labels use am/pm and preserve minutes around noon and midnight', () => {
  assert.equal(formatTimeOfDay(22), '10pm');
  assert.equal(formatTimeOfDay(0), '12am');
  assert.equal(formatTimeOfDay(12), '12pm');
  assert.equal(formatTimeOfDay('12:30'), '12:30pm');
  assert.equal(formatTimeOfDay('00:15'), '12:15am');
  assert.equal(formatTimeOfDay('21:00'), '9pm');
});

test('timestamp labels follow Melbourne daylight saving and always use am/pm', () => {
  assert.match(formatLocalDateTime('2026-10-19T11:00:00Z'), /10pm$/);
  assert.match(formatLocalDateTime('2026-06-19T11:00:00Z'), /9pm$/);
  assert.match(formatLocalDateTime('2026-10-19T01:30:00Z'), /12:30pm$/);
});
