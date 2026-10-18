# Shared meals

Open **Shared meals** in the navigation. Any household member can create a named
group of 2–12 people from their current property, including themselves. Selected
members see that group automatically; other housemates and properties cannot
read or change it. Create additional groups with **New group**. New people first
join the property through its existing tenant invitation flow.

## Simple routine

1. **Rice is daily.** The server creates one rice duty per Melbourne date. The
   owner rotates using completed rice history, avoiding consecutive days when
   someone else is available. Mark rice done, request help, or mark yourself as
   not joining today. An absence moves pending rice; it never rewrites completed
   credit. Another group member can explicitly record completion on the owner's
   behalf.
2. **Plan the next cook.** Choose one or two dishes, participants, a time and
   approximately two or three days of food. Main cooking, prep/cleanup and
   shopping are suggested from completed contributions. Adjust after agreeing
   swaps. With two members, shopping can overlap a cooking role.
3. **Use one shopping list.** Add quantities as part of the item text. Mark items
   Bought or Already have. Neither action invents a grocery trip. Log the trip
   separately and select everyone who actually went; each gets credit.
4. **Batch ready.** Once cooking and washing up are finished, this records the
   named cook and preparer and proposes the next batch for one day before the
   estimate runs out. A proposal needs dishes and a confirmed time; it is not
   proof that anyone has agreed to cook.
5. **Enough / Running low / Finished.** Anyone can update the current batch.
   Running low or Finished brings an unconfirmed proposal forward; it does not
   silently change an agreed session. These estimates support planning and are
   not food-safety expiry dates.

The initial daily rice deadline is **6:30 PM**, and the suggested cooking time is
**7 PM Melbourne time**. Change either under **Group times & reminders**.

## Fairness and accountability

The backend evaluates candidate teams using completed main-cook, prep and
grocery counts, estimated workload and deterministic rotation. This prevents
selecting a shopper first from trapping the same two people in cooking whenever
no shopping happens. Rice has its own daily rotation. Grocery trips with multiple
contributors credit everyone selected. Suggested, cancelled and unconfirmed
duties do not earn completed contribution credit.

Totals and recent history show the people credited, the date and who recorded an
entry. Batch readiness credits both named cooking participants; it is a group
confirmation, not an automatic claim based on the clock. No timers or photos are
required. Request help on a duty, then agree changes in the cooking plan; an
additional available group member can take over a requested duty directly.

## Free reminders

Meal reminders reuse the existing Google Apps Script connection and opted-in
Web Push devices. No new paid service, domain or script installation is needed.
The existing trigger normally polls every 15 minutes. Meal quiet hours are
10 PM–8 AM Melbourne time; cleaning reminder hours are unchanged.

- Rice: within 30 minutes of its deadline, then one overdue reminder.
- Cooking: one hour before a confirmed session, then an unconfirmed reminder.
- Support: a group check-in when a confirmed batch is still not marked ready
  30 minutes after its scheduled cooking time.
- Groceries: missing non-optional ingredients within two hours of cooking.
- Planning: an unconfirmed suggestion due within a day, and a daily food check
  when a batch is approaching its estimated run-low date.
- Help requests: notify other group members.

Queued notices are checked again before delivery, so completion, a swap, changed
time or disabling reminders cancels stale notices. Email and push have separate
deduplicated delivery leases. Apps Script's existing receipt ledger accepts the
new `meal:` job IDs without changing its code. Push failure does not block email.

## Storage and upgrades

`meal_groups` contains a bounded JSON state and an integer version. Every
mutation validates the authenticated member and current property, and writes
with a version compare-and-swap. Concurrent independent updates retry against
the latest state rather than overwriting each other. Request receipts prevent
double-crediting network retries. Browser database roles have no direct table
or queue access; RLS is enabled as an additional boundary.

Meal tables and queues are separate from cleaning assignments, proof, email
jobs and settings. The migration is additive. GET responses use private,
no-store caching; the board refreshes on tab focus and every minute while
visible. Daily rice is maintained both during worker polls and board loading,
so it does not require somebody's computer to remain on.

There is no silent history pruning. Very large group histories need archival
before reaching the state-size limit. Future normalized storage can retain the
same API and user workflow.

## Verification

```sh
npm test
npm run typecheck
npm run build
npx tsx scripts/meals-check.mts
npx tsx scripts/meals-api-check.mts
```

Browser checks exercise cooking, food status, rice, shopping, joint trips,
another member, separate groups and mobile layout. API checks create and remove
temporary accounts and a property; they verify authenticated access, group/home
isolation, denied anonymous access, concurrent changes, retry idempotency,
automatic assignments, queue leasing and the email acknowledgement protocol.
They do not poll the live worker or send notifications.
