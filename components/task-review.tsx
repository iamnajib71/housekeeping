'use client';
import { useState } from 'react';
import type { Submission, TaskFeedback } from '@/lib/types';

export function TaskReview({ submission, expectedTasks, busy, onReview }: {
  submission: Submission; expectedTasks: string[]; busy: boolean;
  onReview: (feedback: TaskFeedback[]) => Promise<void>;
}) {
  const choices = [...new Set([...submission.tasks, ...expectedTasks])];
  const accepted = new Set((submission.task_feedback || []).filter(f => f.status === 'approved').map(f => f.task));
  const [results, setResults] = useState<Record<string, 'approved' | 'rework' | 'skip'>>(
    Object.fromEntries(choices.map(task => [task, submission.tasks.includes(task) ? 'approved' : 'skip']))
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const fixes = choices.filter(task => results[task] === 'rework');
  async function save() {
    setError('');
    if (fixes.some(task => !notes[task]?.trim())) { setError('Add a reason beside each task needing fixes.'); return; }
    await onReview(choices.filter(task => results[task] !== 'skip').map(task => ({task, status: results[task] as 'approved' | 'rework', note: notes[task]?.trim() || ''})));
  }
  return <div className="review-controls"><h3>Review individual tasks</h3><p className="muted">Accept completed work. Flag incomplete or missing tasks with a reason.</p>
    {choices.map(task => <div className="task-review-row" key={task}>
      <label>{task}{!submission.tasks.includes(task) && <small>Not included in this submission</small>}
        <select aria-label={`Review ${task}`} value={accepted.has(task) ? 'approved' : results[task]} disabled={busy || accepted.has(task)} onChange={e => setResults(old => ({...old, [task]: e.target.value as 'approved' | 'rework' | 'skip'}))}>
          {submission.tasks.includes(task) ? <option value="approved">{accepted.has(task) ? 'Already accepted' : 'Accept'}</option> : <option value="skip">Leave unreviewed</option>}
          <option value="rework">Needs fixing / missing</option>
        </select>
      </label>
      {results[task] === 'rework' && <label>Reason for {task}<textarea rows={2} maxLength={500} disabled={busy} value={notes[task] || ''} onChange={e => setNotes(old => ({...old, [task]: e.target.value}))} placeholder="Explain what needs to be completed or corrected" /></label>}
    </div>)}
    {error && <p className="error" role="alert">{error}</p>}
    <button className={`button ${fixes.length ? 'danger' : 'primary'}`} disabled={busy} onClick={save}>{fixes.length ? `Request fixes & email (${fixes.length})` : 'Approve submitted tasks'}</button>
  </div>;
}
