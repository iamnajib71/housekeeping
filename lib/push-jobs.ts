import type { Assignment, Member, Settings, Submission } from './types';
import { memberReminderTypes } from './reminders';
export type PushDevice = { id: string; user_id: string; email: string };
export function buildPushJobs(assignments: Assignment[], members: Member[], submissions: Submission[], settings: Settings[], devices: PushDevice[], date: string, hour: number) {
  return assignments.flatMap(a => a.member_ids.flatMap(memberId => {
    const member = members.find(m => m.id === memberId && (m.household_id || 1) === (a.household_id || 1));
    const preferences = settings.find(s => s.id === (a.household_id || 1));
    if (!member?.email || !preferences || !memberReminderTypes(a, memberId, submissions, date, hour, preferences).includes('overdue')) return [];
    return devices.filter(d => d.email === member.email!.toLowerCase() && (!member.user_id || member.user_id === d.user_id)).map(d => ({ subscription_id: d.id, member_id: memberId, assignment_id: a.id, recipient_user_id: d.user_id }));
  }));
}
