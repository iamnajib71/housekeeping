import type { Submission } from './types';

export function taskReviewState(submission?: Submission) {
  const feedback = submission?.task_feedback || [];
  return {
    accepted: feedback.filter(f => f.status === 'approved').map(f => f.task),
    fixes: submission?.status === 'rework' ? feedback.filter(f => f.status === 'rework') : [],
  };
}

export function sessionSummary(submission: Submission) {
  if (!submission.finished_at) return null;
  const end = new Date(submission.finished_at);
  const minutes = submission.started_at ? Math.max(0, Math.round((end.getTime() - Date.parse(submission.started_at)) / 60000)) : null;
  return { end, minutes };
}

export function feedbackEmailDetails(submission: Submission) {
  const { accepted, fixes } = taskReviewState(submission);
  if (!fixes.length) return 'Reason: ' + submission.review_note;
  return 'Tasks to fix:\n' + fixes.map(f => '- ' + f.task + ': ' + f.note).join('\n')
    + (accepted.length ? '\n\nAlready accepted: ' + accepted.join(', ') + '. These stay accepted.' : '');
}
