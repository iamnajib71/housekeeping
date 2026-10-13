import type { Assignment, Kind, Member, Settings, Submission } from './types';
import { dailyTasksForDate } from './waste';
import { isWeeklyBinTask, weeklyTasksWithBins } from './weekly-bins';
export const TIMEZONE = 'Australia/Melbourne';
export const DAILY_START = '2026-09-27';
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
  if(ids.length<2)return [];
  if(ids.length!==6){
    const ring:(string|null)[]=[...ids];if(ring.length%2)ring.push(null);
    const pairs:string[][]=[];
    for(let round=0;round<ring.length-1;round++){
      for(let i=0;i<ring.length/2;i++){const a=ring[i],b=ring[ring.length-1-i];if(a&&b)pairs.push([a,b]);}
      ring.splice(1,0,ring.pop()!);
    }
    return pairs;
  }
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
  const ids = [...members].filter(m=>m.participates!==false).sort((a, b) => a.position - b.position).map(m => m.id);
  if(!ids.length||!settings.daily_tasks.length||!settings.weekly_tasks.length)return [];
  const pairs = pairCycle(ids);
  const result: Assignment[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const day = new Date(date + 'T12:00:00Z').getUTCDay();
    let kind: Kind, assigned: string[];
    if (day === 1 && date >= settings.weekly_start) {
      if(!pairs.length)continue;
      kind = 'weekly'; assigned = pairs[Math.floor(dayDifference(date, settings.weekly_start) / 7) % pairs.length];
    } else if (day !== 1 && date >= settings.daily_start) {
      kind = 'daily';
      if (date === settings.daily_start) assigned = [ids[0]];
      else {
        const week = Math.floor(dayDifference(mondayOf(date), mondayOf(settings.daily_start)) / 7);
        const slot = day === 0 ? 5 : day - 2;
        const startDay=new Date(settings.daily_start+'T12:00:00Z').getUTCDay(),startSlot=startDay===0?5:Math.max(0,startDay-2);
        const turn=week*6+slot-startSlot;
        const index=settings.id===1&&ids.length===6?((slot-week)%6+6)%6:(turn%ids.length+Math.floor(turn/ids.length));
        assigned = [ids[((index%ids.length)+ids.length)%ids.length]];
      }
    } else continue;
    result.push({ id: `${settings.id===1?'':settings.id+'-'}${kind}-${date}`, ...(settings.id!==1?{household_id:settings.id}:{}), date, kind, member_ids: assigned, tasks: kind === 'daily' ? (settings.council_bins_enabled===false?[...settings.daily_tasks]:dailyTasksForDate(settings.daily_tasks, date)) : weeklyTasksWithBins(settings.weekly_tasks) });
  }
  return result;
}
export function assignmentStatus(a: Assignment, submissions: Submission[], today: string): string {
  const subs = a.member_ids.map(id => submissions.find(s => s.assignment_id === a.id && s.member_id === id));
  if (subs.every(s => s?.status === 'approved')) return 'Approved';
  if (subs.some(s => s?.status === 'rework')) return 'Rejected';
  if (subs.every(s => s && ['submitted', 'approved'].includes(s.status))) return 'In review';
  if (a.date < today) return 'Overdue';
  if (subs.some(s => s && ['submitted', 'approved'].includes(s.status))) return 'Part submitted';
  return a.date === today ? 'Due today' : 'Upcoming';
}
// Split a Monday checklist evenly between its two housemates. The member who
// has gone longest without cleaning an area gets priority, so the same person
// does not keep inheriting jobs such as the toilet. The fallback alternates
// areas and is deterministic before the household has any weekly history.
export function weeklyTaskPlan(a: Assignment, assignments: Assignment[], submissions: Submission[]): Record<string, string[]> {
  if (a.kind !== 'weekly' || a.member_ids.length !== 2) return Object.fromEntries(a.member_ids.map(id => [id, [...a.tasks]]));
  const history = assignments
    .filter(item => item.kind === 'weekly' && item.date < a.date)
    .sort((left, right) => left.date.localeCompare(right.date));
  const stats = new Map<string, { count: number; last: string }>();
  // A revised description is still the same area. Carry old area-only history
  // into the new grouped checklist so setup replacements do not reset fairness.
  const areaKey = (task: string) => task.split(': ')[0].trim().toLowerCase();
  for (const item of history) {
    for (const submission of submissions.filter(s => s.assignment_id === item.id && s.status !== 'draft')) {
      for (const task of submission.tasks) {
        const key = `${submission.member_id}\u0000${areaKey(task)}`;
        stats.set(key, { count: (stats.get(key)?.count || 0) + 1, last: item.date });
      }
    }
  }
  const [first, second] = a.member_ids;
  const limits: Record<string, number> = { [first]: Math.ceil(a.tasks.length / 2), [second]: Math.floor(a.tasks.length / 2) };
  const plan: Record<string, string[]> = { [first]: [], [second]: [] };
  const effort:Record<string,number>={[first]:0,[second]:0};
  // Reserve the bin owner's place before filling either share, so a full share
  // cannot override rotation away from the person who last changed the bins.
  (a.legacy_task_split?[...a.tasks]:[...a.tasks].sort((left,right)=>Number(isWeeklyBinTask(right))-Number(isWeeklyBinTask(left))||taskEffort(right)-taskEffort(left))).forEach((task, taskIndex) => {
    const candidates = [first, second].filter(id => plan[id].length < limits[id]);
    const chosen = candidates.sort((left, right) => {
      const l = stats.get(`${left}\u0000${areaKey(task)}`), r = stats.get(`${right}\u0000${areaKey(task)}`);
      if ((l?.last || '') !== (r?.last || '')) return (l?.last || '').localeCompare(r?.last || '');
      if(!a.legacy_task_split&&Math.abs(effort[left]-effort[right])>=taskEffort(task))return effort[left]-effort[right];
      if ((l?.count || 0) !== (r?.count || 0)) return (l?.count || 0) - (r?.count || 0);
      if (plan[left].length !== plan[right].length) return plan[left].length - plan[right].length;
      return taskIndex % 2 === 0 ? (left === first ? -1 : 1) : (left === second ? -1 : 1);
    })[0];
    plan[chosen].push(task);
    effort[chosen]+=taskEffort(task);
  });
  for(const id of [first,second])plan[id]=a.tasks.filter(task=>plan[id].includes(task));
  return plan;
}
// Relative workload estimates, not measurements of actual cleaning time.
export function taskEffort(task:string):number{
 const text=task.toLowerCase();
 if(/oven|shower|bathtub|bathroom/.test(text))return 4;
 if(/toilet|kitchen|mop|windows|laundry/.test(text))return 3;
 if(/vacuum|stove|floor/.test(text))return 2;
 return 1;
}
export function reminderTypes(date: string, today: string, hour: number, settings: Settings, complete: boolean): string[] {
  if (!settings.reminders_enabled || complete) return [];
  if (date === addDays(today, 1) && hour >= settings.evening_hour) return ['tomorrow'];
  if (date === today && hour >= settings.deadline_hour) return ['overdue'];
  if (date === today && hour >= settings.morning_hour) return ['today'];
  if (date === addDays(today, -1)) return ['overdue'];
  return [];
}
