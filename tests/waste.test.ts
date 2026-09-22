import test from 'node:test';
import assert from 'node:assert/strict';
import { nextWasteCollection, wasteCollectionsBetween } from '../lib/waste';

test('waste calendar matches the supplied September and October collections',()=>{
 const next=nextWasteCollection('2026-09-22');
 assert.equal(next?.date,'2026-09-23');
 assert.ok(next?.bins.includes('Mixed recycling'));
 assert.ok(!next?.bins.includes('Glass recycling'));
 const following=nextWasteCollection('2026-09-24');
 assert.equal(following?.date,'2026-09-30');
 assert.ok(following?.bins.includes('Glass recycling'));
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