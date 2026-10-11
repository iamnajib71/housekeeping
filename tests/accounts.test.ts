import test from 'node:test';
import assert from 'node:assert/strict';
import {accountName,inviteEmail,signupMode,validInviteToken} from '../lib/accounts';
import {generateSchedule,pairCycle,weeklyTaskPlan,taskEffort} from '../lib/schedule';
import {defaultSettings,testMembers} from './fixtures';
test('signup roles reject arbitrary privileges and invitation inputs are bounded',()=>{
 assert.equal(signupMode('admin_tenant'),'admin_tenant');assert.throws(()=>signupMode('owner'));
 assert.equal(inviteEmail(' Tenant@Example.COM '),'tenant@example.com');assert.throws(()=>inviteEmail('wrong'));
 assert.equal(accountName(' Home '),'Home');assert.throws(()=>accountName(' '));assert.throws(()=>accountName('x'.repeat(241),240));
 assert.ok(validInviteToken('a'.repeat(64)));assert.ok(!validInviteToken('../secret'));assert.ok(!validInviteToken('a'.repeat(63)));
});
test('new homes have no schedule before setup and admins alone receive no chores',()=>{
 const settings={...defaultSettings,id:23,council_bins_enabled:false};
 assert.deepEqual(generateSchedule(testMembers,{...settings,daily_tasks:[]},'2026-10-12','2026-11-01'),[]);
 assert.deepEqual(generateSchedule(testMembers.map(m=>({...m,participates:false})),settings,'2026-10-12','2026-11-01'),[]);
 const roster=generateSchedule(testMembers.map((m,i)=>({...m,participates:i!==0})),settings,'2026-10-12','2027-02-01');
 assert.ok(roster.every(a=>a.id.startsWith('23-')&&a.household_id===23&&!a.member_ids.includes(testMembers[0].id)));
 assert.ok(roster.filter(a=>a.kind==='daily').every(a=>!a.tasks.some(t=>t.startsWith('Put collection bins'))));
});
test('two to twelve tenants get every partner once and equal full-cycle weekly turns',()=>{
 for(let count=2;count<=12;count++){
  const ids=Array.from({length:count},(_,i)=>String(i)),pairs=pairCycle(ids);
  assert.equal(pairs.length,count*(count-1)/2);assert.equal(new Set(pairs.map(p=>p.sort().join(':'))).size,pairs.length);
  for(const id of ids)assert.equal(pairs.flat().filter(m=>m===id).length,count-1);
 }
});
test('daily turns are balanced for arbitrary tenant counts',()=>{
 for(let count=1;count<=12;count++){
  const members=Array.from({length:count},(_,i)=>({...testMembers[0],id:String(i),position:i}));
  const a=generateSchedule(members,{...defaultSettings,id:2,daily_start:'2026-10-13',weekly_start:'2026-10-19',council_bins_enabled:false},'2026-10-13','2027-05-09').filter(a=>a.kind==='daily');
  const counts=members.map(m=>a.filter(a=>a.member_ids[0]===m.id).length);
  assert.ok(Math.max(...counts)-Math.min(...counts)<=1,`unfair daily rotation for ${count} tenants`);
 }
});
test('heavy weekly duties are shared without duplicates or missing work',()=>{
 const tasks=['Oven: Deep clean','Bathroom: Shower','Kitchen: Surfaces','Toilet: Deep clean','Common space: Dust','Hall: Tidy','Lounge: Tidy','Shelf: Dust'];
 const a={id:'2-weekly-2026-10-12',date:'2026-10-12',kind:'weekly' as const,member_ids:['a','b'],tasks};
 const plan=weeklyTaskPlan(a,[a],[]),weight=(id:string)=>plan[id].reduce((sum,t)=>sum+taskEffort(t),0);
 assert.equal(new Set([...plan.a,...plan.b]).size,tasks.length);assert.equal(plan.a.length,plan.b.length);
 assert.ok(Math.abs(weight('a')-weight('b'))<=2);
});
