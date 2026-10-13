import test from 'node:test';
import assert from 'node:assert/strict';
import { MONDAY_BIN_TASK, weeklyTasksWithBins, isWeeklyBinTask } from '../lib/weekly-bins';
import { generateSchedule, weeklyTaskPlan } from '../lib/schedule';
import { reminderEmail } from '../lib/reminder-email';
import { testMembers, defaultSettings } from './fixtures';

test('Monday includes one bin change; Tuesday collection remains separate', () => {
  const [monday, tuesday] = generateSchedule(testMembers, defaultSettings, '2026-10-19', '2026-10-20');
  assert.deepEqual(monday.tasks.filter(isWeeklyBinTask), [MONDAY_BIN_TASK]);
  assert.ok(!monday.tasks.some(task => task.startsWith('Put collection bins out')));
  assert.ok(tuesday.tasks.some(task => task.startsWith('Put collection bins out Tuesday night')));
  assert.deepEqual(weeklyTasksWithBins(monday.tasks), monday.tasks);
  assert.deepEqual(weeklyTasksWithBins([]), []);
  assert.deepEqual(weeklyTasksWithBins(['Kitchen: Change bin liner']), ['Kitchen: Change bin liner']);
});

test('one Monday bin owner, rotating away from their last completed bin change', () => {
  const [current] = generateSchedule(testMembers, defaultSettings, '2026-10-19', '2026-10-19');
  const initial = weeklyTaskPlan(current, [current], []);
  const owner = current.member_ids.find(id => initial[id].includes(MONDAY_BIN_TASK))!;
  const other = current.member_ids.find(id => id !== owner)!;
  const past = { ...current, id:'previous-clean', date:'2026-10-12' };
  const proof = { id:'proof', assignment_id:past.id, member_id:owner, tasks:[MONDAY_BIN_TASK], notes:'', status:'approved' as const, submitted_at:'2026-10-12T10:00:00Z', review_note:'' };
  const rotated = weeklyTaskPlan(current, [past, current], [proof]);
  assert.ok(rotated[other].includes(MONDAY_BIN_TASK));
  assert.ok(!rotated[owner].includes(MONDAY_BIN_TASK));
  assert.deepEqual(Object.values(rotated).flat().sort(), [...current.tasks].sort());
  assert.ok(Math.abs(rotated[owner].length - rotated[other].length) <= 1);
  for (const id of current.member_ids) {
    const member = { ...testMembers.find(m => m.id === id)!, email:'cleaner@example.com' };
    const email = reminderEmail(current, member, testMembers, 'today', undefined, [past,current], [proof], 'https://household.example');
    assert.equal(email.body.includes(MONDAY_BIN_TASK), id === other);
  }
  // Historical/started checklists are read as stored, without inventing duties.
  const old = { ...past, tasks:defaultSettings.weekly_tasks, legacy_task_split:true };
  assert.ok(!Object.values(weeklyTaskPlan(old, [old], [])).flat().includes(MONDAY_BIN_TASK));
});
