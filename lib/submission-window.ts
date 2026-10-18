import { addDays, localClock } from './schedule';
import type { Status, Submission } from './types';

export type CleaningClock = { date: string; hour: number };
export type SubmissionWindow = 'open' | 'late' | 'future' | 'closed' | 'rework' | 'submitted';

// Compare Melbourne calendar dates, so daylight-saving days still close at noon.
export function submissionWindow(date: string, status?: Status, clock: CleaningClock = localClock()): SubmissionWindow {
  if (status === 'submitted' || status === 'approved') return 'submitted';
  if (date > clock.date) return 'future';
  // An admin's request for corrections must remain actionable after the initial window.
  if (status === 'rework') return 'rework';
  if (date === clock.date) return 'open';
  return addDays(date, 1) === clock.date && clock.hour < 12 ? 'late' : 'closed';
}

export function canSubmitInWindow(window: SubmissionWindow) {
  return window === 'open' || window === 'late' || window === 'rework';
}

export function isLateSubmission(date: string, submission?: Pick<Submission, 'submitted_at'>) {
  const stamp = submission?.submitted_at;
  return Boolean(stamp && Number.isFinite(Date.parse(stamp)) && localClock(new Date(stamp)).date > date);
}
