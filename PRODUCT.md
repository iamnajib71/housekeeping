# Housekeeping

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Housemates completing shared cleaning and meal duties, and property agents,
managers and resident admins managing one or more private households.

## Product Purpose

Make responsibility visible and fairly shared without making busy people do
extra administration. A person should quickly find their duty, finish it,
submit proof and understand any requested fixes.

## Operating Context

Phone-first use at home, including the kitchen. Melbourne dates and daylight
saving apply. Daily cleaning runs Tuesday–Sunday; Monday deep cleans share
work between two rotating partners. Meals are separate private groups with
daily rice and cooking batches lasting approximately two or three days.

## Capabilities and Constraints

- Preserve Google sign-in, remembered sessions, invitation-only tenant access,
  property switching and household permissions.
- Preserve assignment fairness, Monday bin ownership, future plans, personal
  submission states and task-specific feedback.
- Keep photo proof visible only to signed-in housemates, with 15-day retention.
- Keep meal groups visible only to their participants. Preserve optional
  groceries, completed contribution credits, role swaps and reminders.
- Remain compatible with the existing Next.js, Supabase and Vercel deployment.
  The redesign must not add a paid runtime service.

## Brand Commitments

Keep the Housekeeping name and house symbol. Use plain, friendly language;
compact actions and low effort are explicit user priorities.

## Evidence on Hand

The existing application and workflow checks in scripts/ are the functional
reference. Tests use fictional households; production member details and
credentials do not belong in public design examples.

## Product Principles

1. Show the next useful action before background information.
2. Make ownership and completion unambiguous.
3. Keep routine updates short, with details available when needed.
4. Preserve privacy boundaries and completed work across upgrades.

## Submission timing

Initial proof and submission remain open through the cleaning date and until
12 PM the following day in Melbourne time. After-midnight submissions show a
Late label based on the real submission timestamp. Yesterday's pending clean
stays on the dashboard during that window. Admin-requested fixes remain
actionable afterward; admins can record an exceptional late entry.

## Meals: low-effort daily use

Keep rice, current food and the next cooking pair visible. Collapse secondary
shopping records, fair-share history and group settings. Ingredients use one
availability check; a grocery trip is recorded separately and can credit more
than one person. Preserve a no-trip choice and keep all records private to the
meal group. Display clock times as 10pm or 12:30pm, using Melbourne time.

Meal email and enabled push reminders use the existing cloud worker: rice
30 minutes before, cooking and prep one hour before, and missing groceries two
hours before a confirmed cook. Unfinished duties receive follow-ups. Recheck
ownership/completion before delivery, deduplicate deliveries and observe
10pm–8am quiet hours. Suggested cooking sessions need a confirmation reminder.

If someone covers rice, “I put rice in the cooker” records the signed-in person
as the contributor and preserves the original assignee. This counts once in
rice fairness, stops the outstanding reminder and needs no prior help request.
Confirming that an assigned person did it remains compatible with older clients.
