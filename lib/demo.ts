import { generateSchedule } from './schedule';
import type { DashboardData, Member, Settings } from './types';
// The public demo uses fictional people and never contains the household's emails.
export const demoMembers: Member[] = ['Alex', 'Jamie', 'Sam', 'Taylor', 'Morgan', 'Casey'].map((name, position) => ({ id: `demo-${position}`, name, position, role: position === 0 ? 'admin' : 'member', color: ['#dce9ff', '#f9e2c7', '#e6defa', '#d8eee6', '#f8dfe4', '#e4e9ef'][position] }));
export const defaultSettings: Settings = { id: 1, timezone: 'Australia/Melbourne', daily_start: '2026-09-29', weekly_start: '2026-10-05', daily_tasks: ['Wipe kitchen benches and stovetop', 'Wash up and clear the sink', 'Sweep shared areas', 'Take out rubbish and recycling'], weekly_tasks: ['Kitchen', 'Oven', 'Stove', 'Toilet', 'Bathroom', 'Common Space', 'Lounge room', 'Laundry'], morning_hour: 8, evening_hour: 19, deadline_hour: 21, reminders_enabled: true };
export function demoData(): DashboardData {
  return { me: demoMembers[0], members: demoMembers, settings: defaultSettings, today: '2026-09-29', demo: true, assignments: generateSchedule(demoMembers, defaultSettings, '2026-09-29', '2027-01-18'), submissions: [] };
}
