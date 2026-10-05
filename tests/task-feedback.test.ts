import test from 'node:test';
import assert from 'node:assert/strict';
import { taskReviewState, sessionSummary, feedbackEmailDetails } from '../lib/task-feedback';
import type { Submission } from '../lib/types';

const submission: Submission = {
  id:'test',assignment_id:'daily-test',member_id:'member',tasks:['Kitchen'],notes:'',
  status:'rework',submitted_at:'2026-10-04T23:30:00Z',finished_at:'2026-10-04T23:30:00Z',
  started_at:'2026-10-04T23:00:00Z',review_note:'Legacy reason',task_feedback:[
    {task:'Kitchen',status:'approved',note:''},
    {task:'Bathroom',status:'rework',note:'Clean the shower drain.'},
    {task:'Oven',status:'rework',note:'Wipe the inside.'},
  ]
};
test('missing tasks stay explicit and accepted work survives review',()=>{
  assert.deepEqual(taskReviewState(submission),{accepted:['Kitchen'],fixes:submission.task_feedback!.slice(1)});
  assert.deepEqual(taskReviewState({...submission,status:'submitted'}),{accepted:['Kitchen'],fixes:[]});
  assert.deepEqual(taskReviewState(),{accepted:[],fixes:[]});
});
test('email lists every flagged task and reason, and preserves legacy feedback',()=>{
  const message=feedbackEmailDetails(submission);
  assert.ok(message.includes('- Bathroom: Clean the shower drain.'));
  assert.ok(message.includes('- Oven: Wipe the inside.'));
  assert.ok(message.includes('Already accepted: Kitchen. These stay accepted.'));
  assert.equal(feedbackEmailDetails({...submission,task_feedback:[]}), 'Reason: Legacy reason');
});
test('timing is optional and calculated from timestamps across the Melbourne date boundary',()=>{
  assert.equal(sessionSummary(submission)?.minutes,30);
  assert.equal(sessionSummary(submission)?.end.getTime(),Date.parse(submission.finished_at!));
  assert.equal(sessionSummary({...submission,started_at:null})?.minutes,null);
  assert.equal(sessionSummary({...submission,finished_at:null}),null);
});
