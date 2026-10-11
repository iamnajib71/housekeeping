import { reminderTypes } from './schedule';
import type { Assignment, Settings, Submission } from './types';

export function memberReminderTypes(a: Assignment, memberId: string, submissions: Submission[], today: string, hour: number, settings: Settings) {
  if (!a.member_ids.includes(memberId)) return [];
  const sub = submissions.find(s => s.assignment_id === a.id && s.member_id === memberId);
  const complete = sub?.status === 'submitted' || sub?.status === 'approved';
  return reminderTypes(a.date, today, hour, settings, complete);
}

// Recheck leased jobs against current submissions and time before handing them
// to Gmail. Pending daytime messages are dropped once the overdue window starts.
export function reminderIsCurrent(kind: string, a: Assignment, memberId: string, submissions: Submission[], today: string, hour: number, settings: Settings) {
  if (!settings.reminders_enabled || !a.member_ids.includes(memberId)) return false;
  const sub = submissions.find(s => s.assignment_id === a.id && s.member_id === memberId);
  if (sub?.status === 'submitted' || sub?.status === 'approved') return false;
  if (kind === 'rework') return sub?.status === 'rework';
  return memberReminderTypes(a, memberId, submissions, today, hour, settings).includes(kind);
}
