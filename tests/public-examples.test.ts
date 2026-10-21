import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { testMembers } from './fixtures';

test('public bootstrap examples use fictional fixtures and cannot authorise an email account', () => {
  const source = readFileSync('supabase/migrations/20260922045103_household.sql', 'utf8');
  const values = source.match(/insert into public\.members\(name,email,role,position,color\) values([\s\S]*?);/);
  assert.ok(values, 'Expected the original bootstrap values');
  const rows = [...values[1].matchAll(/\('([^']+)',null,'(admin|member)',([0-5]),'#[0-9a-f]+'/g)];
  assert.equal(rows.length, testMembers.length);
  assert.deepEqual(rows.map(row => row[1]), testMembers.map(member => member.name));
  assert.equal(rows.filter(row => row[2] === 'admin').length, 1);
});
