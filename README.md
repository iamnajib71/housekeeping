# Housekeeping

A private, mobile-friendly cleaning app for six housemates. Next.js runs on Vercel Hobby; Supabase Free stores the roster, submissions, and private proof images. Google Apps Script delivers Gmail reminders without a domain.

## Household rules

- Kickoff clean: Najib on Sunday, 27 September 2026. The fair Tuesday–Sunday rotation follows, with every person receiving one turn per full week and rotating weekdays over six weeks.
- Weekly deep clean: Mondays from 5 October 2026. All 15 pairs appear in a 15-week cycle.
- Timezone: `Australia/Melbourne`, including daylight saving.
- Deep-clean areas: Kitchen, Oven, Stove, Toilet, Bathroom, Common Space, Lounge room, and Laundry.
- Both Monday participants submit their own task list and photos.
- The overview shows each member's submitted tasks as checked and links to their saved submission, with their Monday partner's status shown separately. The next-turn date skips that member's already submitted work.
- Each person may upload up to 10 compressed photos per assignment.
- Submitted proof is visible to every signed-in household member. Photos expire after 15 days; task history remains.
- Admin reviews accept individual tasks and flag incomplete or missing tasks with reasons. Accepted tasks stay accepted; the member sees exactly what to fix and resubmit. Gmail includes the task-specific reasons.
- Start cleaning is optional. Every submission records its end time; using Start also records an approximate duration including proof preparation. Resubmitting without a new Start records only an end time.
- Admin walkthrough trial: upload or record a common-area video, review AI suggestions, and explicitly replace the active areas and duties. Started work and submitted history are preserved. See [Walkthrough trial](docs/WALKTHROUGH_TRIAL.md) for cloud setup, free-tier limits and privacy details.

## Local development

Use Node 22. Copy `.env.example` to `.env.local` and fill the values. Never commit that file.

```sh
npm ci
npm run dev -- --port 3007
npm test
npm run typecheck
npm run build
node scripts/browser-check.mjs
node scripts/task-feedback-check.mjs
npx tsx scripts/onboarding-check.mts
npx tsx scripts/submission-card-check.mts
```

The `/app` route requires an approved household Google account and returns a dashboard customized to that roster member. `/setup` explains the free reminder connection.

## Security

The browser uses Supabase directly only for login. Each data route verifies the current Google session and roster entry before the server accesses household tables. Browser database roles have no household-table privileges. Storage is private and proof-image links expire after a few minutes.

Member emails are visible only to the admin. Mutating requests require the app's own origin. Database functions lock submissions during photo, review, and reassignment changes.

Do not add browser table grants without matching, tested row-level security policies.

## Deployment and upgrades

Read [Deployment](docs/DEPLOYMENT.md) and [Safe upgrades](docs/UPGRADES.md). Builds never reset or seed the live database. Do not edit a migration after it has been applied.

Commercial product and future session-timing ideas are saved in [Product ideas](docs/PRODUCT_IDEAS.md).

## Tests

Unit tests cover start dates, daily fairness, Monday pairing and task allocation, Melbourne daylight saving, reminders, bin collections, task feedback, and optional session timing. Browser checks cover login/auth gates plus admin task review, member resubmission, Start persistence, and mobile layout. `tests/task-feedback.integration.sql` verifies database guards and email queuing in a transaction that rolls back all fixtures.

Walkthrough unit tests cover plan validation and the resumable Google upload protocol. `tests/onboarding.integration.sql` and `tests/cloud-upload.integration.sql` verify replacement protections, rate limits, upload leases and private permissions inside rolled-back transactions. `scripts/onboarding-check.mts` mocks household APIs to exercise upload, consent, draft recovery, replacement and mobile layout; set `CHECK_BASE_URL` to the running app. Its optional real-video mode requires explicit transfer approval and never applies the draft to production.
