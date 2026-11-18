import test from 'node:test';
import assert from 'node:assert/strict';
import {generateSchedule} from '../lib/schedule';
import {defaultSettings,testMembers} from './fixtures';

const from='2026-11-20',until='2027-01-20';
const absent=testMembers[5].id;
const members=testMembers.map(m=>m.id===absent?{...m,away_from:from,away_until:null}:m);

test('departure date excludes the member indefinitely without changing earlier turns',()=>{
 const before=generateSchedule(testMembers,defaultSettings,'2026-11-16','2026-11-19');
 assert.deepEqual(generateSchedule(members,defaultSettings,'2026-11-16','2026-11-19'),before);
 const after=generateSchedule(members,defaultSettings,from,'2027-03-31');
 assert.ok(after.length>120);
 assert.ok(after.every(a=>!a.member_ids.includes(absent)));
 assert.ok(after.every(a=>a.member_ids.length===(a.kind==='weekly'?2:1)));
});

test('five available housemates share daily work and every weekly partnership',()=>{
 const rows=generateSchedule(members,defaultSettings,'2026-11-23','2027-02-28');
 const daily=rows.filter(a=>a.kind==='daily').slice(0,60);
 const counts=members.slice(0,5).map(m=>daily.filter(a=>a.member_ids.includes(m.id)).length);
 assert.ok(Math.max(...counts)-Math.min(...counts)<=1,JSON.stringify(counts));
 const weekly=rows.filter(a=>a.kind==='weekly').slice(0,10);
 assert.equal(new Set(weekly.map(a=>[...a.member_ids].sort().join(':'))).size,10);
 for(const m of members.slice(0,5))assert.equal(weekly.filter(a=>a.member_ids.includes(m.id)).length,4);
});

test('a manually recorded return includes the member without generating catch-up duties',()=>{
 const back=members.map(m=>m.id===absent?{...m,away_until:until}:m);
 const rows=generateSchedule(back,defaultSettings,'2027-01-01','2027-02-28');
 assert.ok(rows.filter(a=>a.date<until).every(a=>!a.member_ids.includes(absent)));
 const after=rows.filter(a=>a.date>=until);
 assert.deepEqual(after,generateSchedule(testMembers,defaultSettings,until,'2027-02-28'));
 assert.ok(after.some(a=>a.member_ids.includes(absent)));
});
