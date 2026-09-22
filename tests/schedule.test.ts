import test from 'node:test';
import assert from 'node:assert/strict';
import {addDays,generateSchedule,localClock,mondayOf,pairCycle,reminderTypes,assignmentStatus} from '../lib/schedule';
import {demoMembers,defaultSettings} from '../lib/demo';
test('daily start and first Monday match agreed dates',()=>{
 const a=generateSchedule(demoMembers,defaultSettings,'2026-09-22','2026-10-12');
 assert.equal(a[0].date,'2026-09-29');assert.equal(a.filter(x=>x.kind==='weekly')[0].date,'2026-10-05');
 assert.equal(a.filter(x=>x.date>='2026-09-29'&&x.date<='2026-10-04').length,6);
});
test('six-week daily cycle gives everyone every weekday once',()=>{
 const a=generateSchedule(demoMembers,defaultSettings,'2026-09-29','2026-11-08').filter(a=>a.kind==='daily');
 assert.equal(a.length,36);
 for(const m of demoMembers){const own=a.filter(a=>a.member_ids.includes(m.id));assert.equal(own.length,6);assert.equal(new Set(own.map(a=>new Date(a.date+'T12:00:00Z').getUTCDay())).size,6);}
 for(let w=0;w<6;w++){const days=a.filter(a=>a.date>=addDays('2026-09-29',w*7)&&a.date<=addDays('2026-09-29',w*7+5));assert.equal(new Set(days.flatMap(a=>a.member_ids)).size,6);}
});
test('Monday cycle covers all 15 pairs, five turns each, with balanced blocks',()=>{
 const p=pairCycle(demoMembers.map(m=>m.id));assert.equal(p.length,15);assert.equal(new Set(p.map(p=>[...p].sort().join(':'))).size,15);
 for(const m of demoMembers)assert.equal(p.flat().filter(id=>id===m.id).length,5);
 for(let i=0;i<15;i+=3)assert.equal(new Set(p.slice(i,i+3).flat()).size,6);
 for(let i=1;i<p.length;i++)assert.ok(p[i].every(id=>!p[i-1].includes(id)));
});
test('Melbourne dates and reminder hours handle DST transition',()=>{
 assert.deepEqual(localClock(new Date('2026-10-03T15:59:00Z')),{date:'2026-10-04',hour:1});
 assert.deepEqual(localClock(new Date('2026-10-03T16:00:00Z')),{date:'2026-10-04',hour:3});
 assert.deepEqual(localClock(new Date('2026-10-04T13:00:00Z')),{date:'2026-10-05',hour:0});
 assert.equal(mondayOf('2026-10-04'),'2026-09-28');
});
test('reminder windows suppress completed tasks and old backlog',()=>{
 assert.deepEqual(reminderTypes('2026-10-05','2026-10-04',19,defaultSettings,false),['tomorrow']);
 assert.deepEqual(reminderTypes('2026-10-05','2026-10-05',8,defaultSettings,false),['today']);
 assert.deepEqual(reminderTypes('2026-10-05','2026-10-05',21,defaultSettings,false),['overdue']);
 assert.deepEqual(reminderTypes('2026-10-05','2026-10-05',8,defaultSettings,true),[]);
 assert.deepEqual(reminderTypes('2026-10-03','2026-10-05',8,defaultSettings,false),[]);
});
test('a weekly clean is complete only after both members submit',()=>{
 const a=generateSchedule(demoMembers,defaultSettings,'2026-10-05','2026-10-05')[0];
 const sub={id:'s1',assignment_id:a.id,member_id:a.member_ids[0],tasks:['Kitchen'],notes:'',status:'submitted' as const,submitted_at:null,review_note:''};
 assert.equal(assignmentStatus(a,[sub],'2026-10-05'),'Part submitted');
 assert.equal(assignmentStatus(a,[sub,{...sub,id:'s2',member_id:a.member_ids[1]}],'2026-10-05'),'In review');
});
