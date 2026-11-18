# Date-based member absence

User request: Zarif leaves 20 November 2026, remaining excluded until the admin
manually marks him back. Keep login and proof/history; redistribute future work
among five people. No catch-up penalty upon return.

Use nullable member `away_from` and `away_until` date fields. Date-aware roster
generation filters the eligible pool for each date, keeping the existing daily
and partner cycles. Existing unstarted turns from the effective date are
rebalanced atomically; any assignment with a submission remains untouched.
Admin-only controls in Our household schedule absence or mark the member back.
Manual reassignment must reject unavailable tenants. The worker must suppress
reminders to someone away on the assignment date.

Alternatives: a permanent participation flag would exclude him before departure
and cannot resume cleanly; one-off swaps would leave newly generated assignments
wrong. Date-aware eligibility is the chosen implementation for the stated need.

- [x] Test departure boundary, indefinite exclusion, return, five-person fairness,
  unchanged historical schedule, and protected existing work.
- [x] Back up affected private rows; apply additive fields and a service-only
  atomic roster update function. Keep client database access denied.
- [x] Implement availability, admin API, compact household controls, reminder
  filtering, and date-aware manual assignees.
- [ ] Build and test mobile/desktop plus authorization/database guards without
  sending notifications. Commit and deploy.
- [ ] Record Zarif away from 20 November on live and verify no unstarted future
  duties assign him; verify preserved submissions and a fair five-person rota.
