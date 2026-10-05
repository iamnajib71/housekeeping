import test from 'node:test';
import assert from 'node:assert/strict';
import { reminderEmail } from '../lib/reminder-email';
import { generateSchedule, weeklyTaskPlan } from '../lib/schedule';
import { dailyTasksForDate, binOutTask } from '../lib/waste';
import { defaultSettings, testMembers } from './fixtures';

test('Tuesday cleaner gets a separate bin duty with that week’s lids; other days do not',()=>{
  const assignments=generateSchedule(testMembers,defaultSettings,'2026-10-06','2026-10-11');
  assert.equal(assignments[0].tasks.length,7);
  assert.match(assignments[0].tasks.at(-1)!,/Red lid, Green lid, Yellow lid/);
  for(const a of assignments.slice(1))assert.equal(a.tasks.length,6);
  assert.match(binOutTask('2026-10-13')!,/Red lid, Green lid \(Wednesday/);
  assert.match(binOutTask('2026-10-27')!,/Purple lid/);
  assert.doesNotMatch(binOutTask('2026-10-27')!,/Yellow lid/);
  assert.match(binOutTask('2027-01-05')!,/check council calendar/);
  const old=['Kitchen: Check bins; empty only when over 80% full; put due collection bins out Tuesday night','Check for Bin Collection (Tuesday)'];
  const tasks=dailyTasksForDate(old,'2026-10-06');
  assert.deepEqual(dailyTasksForDate(tasks,'2026-10-06'),tasks);
  assert.deepEqual(dailyTasksForDate(tasks,'2026-10-07'),['Kitchen: Check bins; empty only when over 80% full']);
});

test('Tuesday reminder contains bin duty and only goes to the scheduled cleaner',()=>{
  const a=generateSchedule(testMembers,defaultSettings,'2026-10-06','2026-10-06')[0];
  const member={...testMembers.find(m=>a.member_ids.includes(m.id))!,email:'cleaner@example.com'};
  for(const kind of ['tomorrow','today','overdue']){
    const email=reminderEmail(a,member,testMembers,kind,undefined,[],[],'https://household.example');
    assert.equal(email.to,member.email);
    assert.match(email.body,/Put collection bins out Tuesday night: Red lid, Green lid, Yellow lid/);
    assert.match(email.body,/\/app\?assignment=daily-2026-10-06/);
  }
});

test('Monday reminders match each person’s rotated share, including earlier cleaning history',()=>{
  const a=generateSchedule(testMembers,defaultSettings,'2026-10-12','2026-10-12')[0];
  const past={...a,id:'weekly-2026-10-05',date:'2026-10-05'};
  const sub={id:'proof',assignment_id:past.id,member_id:a.member_ids[0],tasks:['Toilet'],notes:'',status:'approved' as const,submitted_at:'2026-10-05T10:00:00Z',review_note:''};
  const history=[past,a],plan=weeklyTaskPlan(a,history,[sub]);
  for(const id of a.member_ids){
    const member={...testMembers.find(m=>m.id===id)!,email:'cleaner@example.com'};
    const email=reminderEmail(a,member,testMembers,'tomorrow',undefined,history,[sub],'https://household.example');
    assert.deepEqual(email.body.split('\n').filter(line=>line.startsWith('• ')).map(line=>line.slice(2)),plan[id]);
    assert.equal(plan[id].length,4);
  }
});
