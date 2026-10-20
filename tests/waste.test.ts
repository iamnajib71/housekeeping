import test from 'node:test';
import assert from 'node:assert/strict';
import { isTuesdayBinDuty, binOutTask, nextWasteCollection, wasteCollectionsBetween } from '../lib/waste';

test('waste calendar matches the supplied September and October collections',()=>{
 const next=nextWasteCollection('2026-09-22');
 assert.equal(next?.date,'2026-09-23');
 assert.ok(next?.bins.includes('Mixed recycling'));
 assert.ok(!next?.bins.includes('Glass recycling'));
 const following=nextWasteCollection('2026-09-24');
 assert.equal(following?.date,'2026-09-30');
 assert.ok(following?.bins.includes('Glass recycling'));
});

test('collection highlighting is specific to Tuesday duties, including old checklist wording',()=>{
 const task=binOutTask('2026-10-20')!;
 assert.equal(isTuesdayBinDuty(task,'2026-10-20'),true);
 assert.equal(isTuesdayBinDuty('Check for Bin Collection (Tuesday)','2026-10-20'),true);
 for(const date of ['2026-10-19','2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25'])assert.equal(isTuesdayBinDuty(task,date),false);
 assert.equal(isTuesdayBinDuty('Check bins; empty only when over 80% full','2026-10-20'),false);
 assert.equal(isTuesdayBinDuty('Bins: Empty household bins and replace liners','2026-10-19'),false);
});

test('every remaining 2026 collection includes rubbish and food organics',()=>{
 const collections=wasteCollectionsBetween('2026-09-23','2026-12-30');
 assert.equal(collections.length,15);
 for(const item of collections){
  assert.ok(item.bins.includes('General rubbish'));
  assert.ok(item.bins.includes('Food & garden organics'));
 }
 assert.deepEqual(collections.at(-1),{date:'2026-12-30',bins:['General rubbish','Food & garden organics','Mixed recycling']});
});
