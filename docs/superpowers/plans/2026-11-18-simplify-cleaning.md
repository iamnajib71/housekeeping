# Cleaning-only app and quieter reminders

User selected: remove Shared meals; keep the morning assignment email and the
10pm overdue email. Times use Australia/Melbourne. Retain rejection feedback.

Remove rather than hide meal navigation and disable its API. Preserve meal
history in storage. Stop meal and automatic push delivery, cancelling unsent
jobs so old queues cannot deliver after the change. Existing sent receipts stay.
The alternative of keeping push alongside email was rejected in favour of the
user's email-only reminder schedule. Keep install-to-home-screen available on
demand, without repeatedly prompting for notifications.

Implementation plan (inline):
- [x] Add failing tests for no day-before/next-day automatic reminders, and 10pm
  overdue timing independent of old household deadline settings.
- [x] Remove meals from desktop/mobile navigation; legacy meal links open Today.
  Return 410 from retired meal API without reading or changing historical data.
- [x] Restrict reminder generation, cancel retired jobs, remove meal/push worker
  delivery and simplify settings and phone setup copy.
- [x] Run unit tests, production build and browser checks across mobile/desktop,
  both themes, legacy meal URLs, navigation and retired API. No test messages.
- [ ] Commit, push, deploy and verify the live UI and queue state without sending.

Checks: completed submissions suppress reminders; only an unsubmitted Monday
partner is reminded; queued day-before reminders are rejected; dedupe keys retain
one email per assignment/member/type; late uploads and photo cleanup remain.
