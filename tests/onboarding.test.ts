import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotTimes, validatePlan, validateFrames, planChecklists, CleaningPlan } from '../lib/onboarding';
import { detectCleaningPlan } from '../lib/onboarding-ai';
const plan:CleaningPlan={areas:[{name:'Kitchen',fixtures:['Stove','Sink'],daily:['Wipe benches'],weekly:['Clean the oven'],frameIndex:0,confidence:'high'}],unseenAreas:['Laundry'],notes:'Confirm unseen areas.'};
const frames=[{seconds:1,data:'/9j/'+ 'A'.repeat(24)}];
test('video sampling stays inside duration and keeps short clips valid',()=>{
  assert.equal(snapshotTimes(180).length,12);
  assert.ok(snapshotTimes(2).every(t=>t>=0&&t<2));
  assert.ok(snapshotTimes(.001).every(t=>t>=0&&t<.001));
  assert.throws(()=>snapshotTimes(181));assert.throws(()=>snapshotTimes(Infinity));
});
test('untrusted plan is bounded and must use genuine submitted frame indices',()=>{
  assert.deepEqual(validatePlan(plan,1),plan);
  assert.throws(()=>validatePlan({...plan,areas:[{...plan.areas[0],frameIndex:1}]},1));
  assert.throws(()=>validatePlan({...plan,areas:[...plan.areas,{...plan.areas[0],name:'kitchen'}]}));
  assert.throws(()=>validatePlan({...plan,areas:[{...plan.areas[0],daily:Array(11).fill('x')}]}));
  assert.deepEqual(validatePlan({...plan,areas:[]}).areas,[]);
});
test('app checklists preserve area names and require useful daily and weekly duties',()=>{
  assert.deepEqual(planChecklists(plan),{daily:['Kitchen: Wipe benches'],weekly:['Kitchen: Clean the oven'],areas:['Kitchen']});
  assert.throws(()=>planChecklists({...plan,areas:[]}));
  assert.throws(()=>planChecklists({...plan,areas:[{...plan.areas[0],daily:['x'.repeat(150)]}]}));
});
test('snapshot validation rejects spoofed data, excessive size and out-of-range times',()=>{
  assert.deepEqual(validateFrames(frames),frames);
  for(const input of [[],[{seconds:1,data:'not-an-image'}],[{...frames[0],seconds:181}],[{...frames[0],data:'/9j/'+'A'.repeat(200000)}]])assert.throws(()=>validateFrames(input));
});
test('provider request uses images and schema, returns validated draft, and handles quota failures',async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async(url,init)=>{
      assert.ok(String(url).startsWith('https://generativelanguage.googleapis.com/'));
      const payload=JSON.parse(String(init?.body));
      assert.equal(payload.contents[0].parts[2].inlineData.mimeType,'image/jpeg');
      assert.equal(payload.generationConfig.responseMimeType,'application/json');
      return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(plan)}]}}]});
    };
    assert.deepEqual(await detectCleaningPlan(frames,'test-key'),plan);
    globalThis.fetch=async()=>new Response('{}',{status:429});
    await assert.rejects(detectCleaningPlan(frames,'test-key'),/quota/);
    globalThis.fetch=async()=>Response.json({candidates:[{content:{parts:[{text:'{"areas":[{"name":"invented"}]}'}]}}]});
    await assert.rejects(detectCleaningPlan(frames,'test-key'),/incomplete/);
  }finally {globalThis.fetch=original;}
});
