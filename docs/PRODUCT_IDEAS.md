# Product roadmap and ideas

Saved 5 October 2026. These are ideas for later, not implementation commitments.

## Positioning and validation

Fair cleaning schedules and clear accountability for shared homes. Pilot with 5–10 households for four weeks; measure invitations accepted, recurring task completion, organizer time saved, and willingness to pay. Shared-house and small co-living managers are a promising customer hypothesis.

## Household product

- Self-service household creation; invite links and QR codes.
- Any household size, rooms, schedules, start dates, and timezones.
- Swap turns, holidays, availability, illness, and rescheduling.
- Fairness based on task effort; visible distribution over time.
- Automatic email and push notifications without customer Apps Script setup.
- Task instructions, expected results, reference photos, estimated duration.
- Configurable photo requirements and approval roles; before-and-after proof.
- Weekly summaries of completed work, missed tasks, issues, and upcoming duties.
- Installable phone app, offline drafts, and upload recovery.
- Optional streaks and rewards.
- Cannot-finish reasons: missing supplies, broken equipment, unavailable access; request help.
- Shared cleaning supplies list and low-stock reporting.
- Photo-based reporting of leaks, damage, mould, and other household issues.
- Task-specific feedback: accept completed areas and request fixes only for flagged tasks.
- Member move-in/move-out flow, admin transfer, automatic future roster balancing.
- Multiple-property dashboard and exports for managers.

## Commercial foundations

- Secure household isolation, subscription billing, storage limits, configurable retention.
- Audit history for assignment, submission, approval, and rejection.
- Notification and upload monitoring, retries, backups, data export/deletion, support contact.
- Pricing experiments, not validated prices: Free basic tier; Household Plus A$5–8 per household/month; Property Manager A$10–20 per property/month.
- Prioritize self-service setup, swaps/holidays, instructions, automatic notifications before broader modules.

## Smart cleaning session timing

- Start / Pause / Resume / Finish; finish cleaning before attaching/uploading proof.
- Calculate elapsed time from saved timestamps, subtract explicit pauses. Do not count browser timer ticks.
- Continue while phone is locked or app is hidden; recover ongoing sessions on reopening.
- Detect unusually long sessions and ask whether the person finished earlier; record corrections.
- Allow approximate manual duration when start was forgotten; label self-reported entries.
- Keep paired Monday participants' sessions separate.
- Learn typical durations using medians of confirmed comparable sessions, starting with household estimates.
- Never equate screen interaction, photos, or elapsed session time with verified physical cleaning.
- Balance chores by effort; use duration as supporting information, not rewards for longer timers.

## Admin onboarding from a video walkthrough

Added 5 October 2026. An admin cloud-video trial is implemented; broader onboarding features below remain ideas.

- During initial onboarding, the admin records or uploads one guided walkthrough of the shared areas. Members do not need to record walkthroughs for normal tasks.
- Suggest room names, relevant fixtures/appliances, and recurring cleaning duties using the walkthrough and standard cleaning templates. Do not infer that an already clean area has no recurring duties.
- Show each proposed area beside its supporting video timestamp or frame; allow the admin to rename, merge, delete, and add areas and tasks before saving.
- Admin confirms daily/weekly frequencies, expectations, and approximate effort; the app uses those confirmed duties with its fair rotation and task-specific feedback flow.
- Mark unseen or unclear areas as needing confirmation; offer a short extra clip or manual entry. Hidden oven interiors, hygiene, and cleaning completion cannot reliably be verified from an ordinary walkthrough.
- Explore optional spoken room names to help identify similar spaces.
- Avoid recording people/private spaces; minimize video retention, preferably deleting originals after processing and retaining selected evidence only under the configured policy.
- Evaluate recognition accuracy and API cost/quota using real household videos before promising automated detection or a free production tier.
- Future live-view mode (idea only): run a small object detector in the phone browser, overlay fixture labels, and infer suggested rooms from combinations such as sink/stove or sofa/table. Accumulate areas during the walkthrough, keep ambiguous or similar rooms separate until confirmed, and use cleaning templates to propose duties. Confirm area names at the end. On-device inference avoids recurring vision API costs; camera performance and supported fixture classes need device testing. [Google's browser object-detection example](https://codelabs.developers.google.com/mp-object-detection-web).

## Current work

The current app adds task-specific feedback, an optional Start cleaning button, and submission time as the session end. Duration is approximate and includes proof preparation. Admins can also trial cloud video analysis, edit suggested areas/duties, save drafts and explicitly replace the active setup without changing started work. See [Walkthrough trial](WALKTHROUGH_TRIAL.md). Pause/resume, duration correction, separate finish controls, and broader commercial features remain future ideas.
