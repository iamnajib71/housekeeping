import test from 'node:test';
import assert from 'node:assert/strict';
import { HouseMap, mapAreasToPlan, validateHouseMap } from '../lib/mapping';
import { planChecklists } from '../lib/onboarding';
const map:HouseMap={format:'housekeeping-map-v1',model:'lingbot-map',revision:'a'.repeat(40),duration:20,points:[[0,0,0,255,120,0]],cameras:[{seconds:0,position:[0,0,0]},{seconds:10,position:[1,0,0]}],metrics:{inferenceSeconds:3,peakGpuMb:6000,frames:2}};
test('map imports bound geometry, timestamps and metrics without trusting extra content',()=>{
  assert.deepEqual(validateHouseMap({...map,html:'<script>bad()</script>'}),map);
  for(const bad of [{...map,points:[[NaN,0,0,0,0,0]]},{...map,duration:180},{...map,cameras:[map.cameras[1],map.cameras[0]]},{...map,points:Array(30001).fill(map.points[0])},{...map,metrics:{...map.metrics,frames:3}},{...map,points:[[0,0,0,256,0,0]]}])assert.throws(()=>validateHouseMap(bad));
});
test('confirmed map labels generate a small editable cleaning draft, without claiming room recognition',()=>{
  const plan=mapAreasToPlan([{name:'Kitchen',start:0,end:10,fixtures:['Sink','Stove','Oven']},{name:'Toilet 1',start:10,end:20,fixtures:['Toilet']}],20);
  const lists=planChecklists(plan);assert.equal(lists.daily.length,6);assert.equal(lists.weekly.length,3);
  assert.match(plan.notes,/labelled by the admin/);assert.ok(plan.areas.every(a=>a.confidence==='low'&&a.frameIndex===null));
  assert.equal(plan.areas[1].seconds,10);
  for(const areas of [[{name:'Kitchen',start:0,end:21,fixtures:[]}],[{name:'Kitchen',start:10,end:0,fixtures:[]}],[{name:'Kitchen',start:0,end:10,fixtures:[]},{name:'kitchen',start:10,end:20,fixtures:[]}],[]])assert.throws(()=>mapAreasToPlan(areas,20));
});
