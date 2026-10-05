import { formatDate, weeklyTaskPlan } from './schedule';
import { feedbackEmailDetails } from './task-feedback';
import type { Assignment, Member, Submission } from './types';

export function reminderEmail(a: Assignment, member: Member, members: Member[], kind: string, sub: Submission | undefined, assignments: Assignment[], submissions: Submission[], appUrl: string) {
  const label = a.kind === 'daily' ? 'daily reset' : 'Monday deep clean';
  const when = kind === 'tomorrow' ? 'tomorrow' : kind === 'today' ? 'today' : 'is overdue';
  const partner = a.member_ids.filter(id => id !== member.id).map(id => members.find(m => m.id === id)?.name).join(' & ');
  const link = appUrl.replace(/\/$/, '') + '/app?assignment=' + encodeURIComponent(a.id);
  const rejected = kind === 'rework';
  const tasks = a.kind === 'weekly' ? weeklyTaskPlan(a, assignments, submissions)[member.id] || [] : a.tasks;
  const body = rejected
    ? 'Hi ' + member.name + ',\n\nYour ' + label + ' submission for ' + formatDate(a.date) + ' needs fixes.\n\n' + (sub ? feedbackEmailDetails(sub) : 'Open your submission for the requested fixes.') + '\n\nOpen your task to see the specific fixes, complete and tick those tasks, then resubmit your proof:\n' + link + '\n\nPhotos are removed after 15 days.\nHousekeeping'
    : 'Hi ' + member.name + ',\n\nYour ' + label + ' ' + when + '.\nDate: ' + formatDate(a.date) + ' (Melbourne time)\n' + (partner ? 'Your partner: ' + partner + '\n' : '') + '\nYour tasks:\n' + tasks.map(t => '• ' + t).join('\n') + '\n\nOpen your task, tick what you cleaned, and add photo proof:\n' + link + '\n\nPhotos are removed after 15 days. Thanks for doing your part!\nHousekeeping';
  return { to: member.email!, subject: rejected ? 'Housekeeping: ' + label + ' needs fixes' : 'Housekeeping: your ' + label + ' ' + when, body };
}
