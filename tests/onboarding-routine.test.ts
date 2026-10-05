import test from 'node:test';
import assert from 'node:assert/strict';
import { lightCleaningRoutine } from '../lib/onboarding-routine';
import { CleaningPlan, planChecklists } from '../lib/onboarding';
import { weeklyTaskPlan } from '../lib/schedule';
import { detectCleaningPlan, detectVideoCleaningPlan } from '../lib/onboarding-ai';

const plan:CleaningPlan={areas:[
  {name:'Kitchen',fixtures:['Sink','Stove/oven','Microwave'],daily:['Wipe countertops','Clean microwave'],weekly:['Clean windows','Clean kitchen floor'],frameIndex:null,seconds:2,confidence:'high'},
  {name:'Lounge room',fixtures:['Sofa','Table'],daily:['Vacuum floor','Dust tables'],weekly:['Clean blinds'],frameIndex:null,seconds:12,confidence:'high'},
  {name:'Toilet 1',fixtures:['Toilet'],daily:['Clean toilet bowl'],weekly:['Mop floor'],frameIndex:null,seconds:null,confidence:'low'},
  {name:'Bathroom',fixtures:['Sink','Shower','Bathtub','Mirror'],daily:['Clean bath','Wipe sink'],weekly:['Mop floor'],frameIndex:null,seconds:null,confidence:'low'},
],unseenAreas:[],notes:'Confirm low-confidence areas.'};

test('AI overload becomes six conditional daily checks and concise Monday duties',()=>{
  const result=lightCleaningRoutine(plan),lists=planChecklists(result);
  assert.equal(lists.daily.length,6);
  assert.match(lists.daily.join('\n'),/over 80% full/);
  assert.match(lists.daily.join('\n'),/hygiene.*only as needed/);
  assert.ok(!lists.daily.some(task=>/scrub|vacuum|bathtub|mirror|dust/i.test(task)));
  assert.match(lists.weekly.join('\n'),/Scrub toilet bowl/);
  assert.match(lists.weekly.join('\n'),/sink, mirror, shower, bathtub/);
  assert.equal(lists.weekly.length,5);
  assert.ok(!lists.weekly.some(task=>/windows|blinds/i.test(task)));
  assert.match(result.notes,/occasional/);
  assert.deepEqual(result.areas.map(a=>[a.name,a.fixtures,a.seconds,a.confidence]),plan.areas.map(a=>[a.name,a.fixtures,a.seconds,a.confidence]));
  assert.deepEqual(lightCleaningRoutine(result),result);
  assert.equal(plan.areas[2].daily[0],'Clean toilet bowl');
});

test('Monday checklist still splits fairly and keeps every generated duty',()=>{
  const tasks=planChecklists(lightCleaningRoutine(plan)).weekly;
  const assignment={id:'weekly-2026-10-12',date:'2026-10-12',kind:'weekly' as const,member_ids:['one','two'],tasks};
  const split=weeklyTaskPlan(assignment,[assignment],[]);
  assert.ok(Math.abs(split.one.length-split.two.length)<=1);
  assert.deepEqual([...split.one,...split.two].sort(),[...tasks].sort());
});

test('area history survives replacement of old area-only tasks with grouped duties',()=>{
  const before={id:'weekly-2026-10-05',date:'2026-10-05',kind:'weekly' as const,member_ids:['one','other'],tasks:['Bathroom']};
  const next={id:'weekly-2026-10-12',date:'2026-10-12',kind:'weekly' as const,member_ids:['one','two'],tasks:['Bathroom: Clean sink and shower','Kitchen: Clean surfaces']};
  const submission={id:'proof',assignment_id:before.id,member_id:'one',tasks:['Bathroom'],notes:'',status:'approved' as const,submitted_at:'2026-10-05T10:00:00Z',review_note:''};
  const split=weeklyTaskPlan(next,[before,next],[submission]);
  assert.ok(split.two.includes('Bathroom: Clean sink and shower'));
});

test('no kitchen means a short visible-area reset, not invented rooms or appliances',()=>{
  const result=lightCleaningRoutine({...plan,areas:[plan.areas[3]]});
  assert.equal(planChecklists(result).daily.length,2);
  assert.ok(!result.areas.flatMap(a=>a.daily).some(t=>/kitchen|stove/i.test(t)));
  assert.deepEqual(result.areas.map(a=>a.name),['Bathroom']);
  assert.ok(result.unseenAreas.some(a=>/Kitchen.*not shown/.test(a)));
  const unknown=lightCleaningRoutine({...plan,areas:[{...plan.areas[0],name:'Study',fixtures:['Desk']}]});
  assert.deepEqual(lightCleaningRoutine(unknown),unknown);
});

test('both analysis routes enforce the light routine even when the model ignores its instructions',async()=>{
  const original=globalThis.fetch;
  const overloaded={...plan,areas:plan.areas.map(area=>({...area,daily:Array.from({length:5},(_,i)=>`Deep clean fixture ${i+1}`)}))};
  assert.equal(overloaded.areas.flatMap(a=>a.daily).length,20);
  try {
    globalThis.fetch=async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify(overloaded)}]}}]});
    const snapshot=await detectCleaningPlan([{seconds:0,data:'/9j/AAAA'}],'test-key');
    const video=await detectVideoCleaningPlan('https://generativelanguage.googleapis.com/v1beta/files/test','video/mp4','test-key');
    for(const generated of [snapshot,video])assert.equal(planChecklists(generated).daily.length,6);
  }finally{globalThis.fetch=original;}
});
