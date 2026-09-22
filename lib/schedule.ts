import type { Assignment, Kind, Member, Settings, Submission } from './types';
export const TIMEZONE = 'Australia/Melbourne';
export const DAILY_START = '2026-09-29';
export const WEEKLY_START = '2026-10-05';
const DAY = 86_400_000;
export function addDays(date: string, days: number): string { return new Date(Date.parse(date + 'T12:00:00Z') + days * DAY).toISOString().slice(0, 10); }
export function dayDifference(a: string, b: string): number { return Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / DAY); }
export function localClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}
export function formatDate(date: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  return new Intl.DateTimeFormat('en-AU', { ...options, timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
}
export function mondayOf(date: string): string { const day = new Date(date + 'T12:00:00Z').getUTCDay(); return addDays(date, -(day === 0 ? 6 : day - 1)); }
// A round-robin matching occupies three Mondays. Every member works once per
// three-week block, with every other member exactly once over the 15-week cycle.
export function pairCycle(ids: string[]): string[][] {
  if (ids.length !== 6) throw new Error('The household rotation requires exactly six members.');
  const ring = [...ids], pairs: string[][] = [];
  for (let round = 0; round < 5; round++) {
    const next = [0, 1, 2].map(i => [ring[i], ring[5 - i]]);
    // Avoid consecutive Mondays for either member across round boundaries.
    const previous = pairs.at(-1);
    if (previous) { const first = next.findIndex(p => p.every(id => !previous.includes(id))); if (first > 0) [next[0], next[first]] = [next[first], next[0]]; }
    pairs.push(...next);
    ring.splice(1, 0, ring.pop()!);
  }
  return pairs;
}
export function generateSchedule(members: Member[], settings: Settings, from: string, to: string): Assignment[] {
  const ids = [...members].sort((a, b) => a.position - b.position).map(m => m.id);
  const pairs = pairCycle(ids);
  const result: Assignment[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const day = new Date(date + 'T12:00:00Z').getUTCDay();
    let kind: Kind, assigned: string[];
    if (day === 1 && date >= settings.weekly_start) {
      kind = 'weekly'; assigned = pairs[Math.floor(dayDifference(date, settings.weekly_start) / 7) % 15];
    } else if (day !== 1 && date >= settings.daily_start) {
      kind = 'daily';
      const week = Math.floor(dayDifference(mondayOf(date), mondayOf(settings.daily_start)) / 7);
      const slot = day === 0 ? 5 : day - 2;
      assigned = [ids[((slot - week) % 6 + 6) % 6]];
    } else continue;
    result.push({ id: `${kind}-${date}`, date, kind, member_ids: assigned, tasks: kind === 'daily' ? settings.daily_tasks : settings.weekly_tasks });
  }
  return result;
}
export function assignmentStatus(a: Assignment, submissions: Submission[], today: string): string {
  const subs = a.member_ids.map(id => submissions.find(s => s.assignment_id === a.id && s.member_id === id));
  if (subs.every(s => s?.status === 'approved')) return 'Approved';
  if (subs.some(s => s?.status === 'rework')) return 'Needs rework';
  if (subs.every(s => s && ['submitted', 'approved'].includes(s.status))) return 'In review';
  if (a.date < today) return 'Overdue';
  if (subs.some(s => s && ['submitted', 'approved'].includes(s.status))) return 'Part submitted';
  return a.date === today ? 'Due today' : 'Upcoming';
}
export function reminderTypes(date: string, today: string, hour: number, settings: Settings, complete: boolean): string[] {
  if (!settings.reminders_enabled || complete) return [];
  if (date === addDays(today, 1) && hour >= settings.evening_hour) return ['tomorrow'];
  if (date === today && hour >= settings.deadline_hour) return ['overdue'];
  if (date === today && hour >= settings.morning_hour) return ['today'];
  if (date === addDays(today, -1)) return ['overdue'];
  return [];
}
