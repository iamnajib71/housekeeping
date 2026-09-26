# Housekeeping

A private, mobile-friendly cleaning app for six housemates. Next.js runs on Vercel Hobby; Supabase Free stores the roster, submissions, and private proof images. Google Apps Script delivers Gmail reminders without a domain.

## Household rules

- Kickoff clean: Najib on Sunday, 27 September 2026. The fair Tuesday–Sunday rotation follows, with every person receiving one turn per full week and rotating weekdays over six weeks.
- Weekly deep clean: Mondays from 5 October 2026. All 15 pairs appear in a 15-week cycle.
- Timezone: `Australia/Melbourne`, including daylight saving.
- Deep-clean areas: Kitchen, Oven, Stove, Toilet, Bathroom, Common Space, Lounge room, and Laundry.
- Both Monday participants submit their own task list and photos.
- Each person may upload up to 10 compressed photos per assignment.
- Photos expire after seven days. Task history remains.

## Local development

Use Node 22. Copy `.env.example` to `.env.local` and fill the values. Never commit that file.

```sh
npm ci
npm run dev -- --port 3007
npm test
npm run typecheck
npm run build
node scripts/browser-check.mjs
```

The `/app` route requires an approved household Google account and returns a dashboard customized to that roster member. `/setup` explains the free reminder connection.

## Security

The browser uses Supabase directly only for login. Each data route verifies the current Google session and roster entry before the server accesses household tables. Browser database roles have no household-table privileges. Storage is private and proof-image links expire after a few minutes.

Member emails are visible only to the admin. Mutating requests require the app's own origin. Database functions lock submissions during photo, review, and reassignment changes.

Do not add browser table grants without matching, tested row-level security policies.

## Deployment and upgrades

Read [Deployment](docs/DEPLOYMENT.md) and [Safe upgrades](docs/UPGRADES.md). Builds never reset or seed the live database. Do not edit a migration after it has been applied.

## Tests

Unit tests cover start dates, daily fairness, all Monday pairings, history-based 4-4 task allocation, Melbourne daylight saving, reminders, paired completion, and the supplied bin calendar. Browser checks cover the authenticated-only login, mobile overflow, removed demo route, and unauthenticated API access.
