# Accounts and properties

Visit `/signup` to create an account with Google. Choose **Manage properties** (admin only) or **Manage my shared home** (admin and participating tenant). Login remains `/`; devices retain their Supabase session and the server refreshes it through Next.js Proxy.

After verified login, the admin supplies their name, property name and full address. Each property starts with empty areas, checklists and history. Reminders and the original household's council bin calendar are disabled for new properties. No existing six-person roster is copied.

The admin guide explains walkthrough/manual setup, tenant invitations and checking the roster before enabling reminders. In **Household settings**, record/upload the common-area walkthrough, review its suggested duties and confirm uncertain detections before applying. Manual daily and weekly checklists are also available. An agent can add more properties and switch between their homes in the header. Addresses are visible only within the authenticated household.

In **Our household**, create a private tenant invitation using their Google email and name, then copy and share the link. This release uses shareable invitation links, not automatic invitation email. Tokens are random, hashed in the database, bound to the invited email, expire after seven days, and can be revoked. Accepting creates a participating tenant membership only. The tenant guide covers schedules, optional start time, proof, submission and requested fixes; completion is stored per membership.

## Fairness and analysis

Only participating tenants receive chores. Daily turns balance complete roster cycles and rotate the starting member; the original six-person household retains its agreed daily rotation. Monday partners cover all possible pairs before the cycle repeats. At least two tenants are needed for a Monday team clean. Weekly duties balance task counts and estimated relative workload while prioritizing rotation away from recently cleaned areas. These estimates are not measured time. Already-started weekly cleans keep the previous task splitter during rollout.

Gemini walkthrough analysis samples video at two frames per second, uses a bounded reasoning budget and asks for evidence-backed room grouping, visible fixtures, timestamps and confidence. Missing supporting timestamps become low confidence. Suggested duties still pass the light-daily/grouped-weekly normalizer and an admin review. AI precision is not guaranteed; no new measured accuracy benchmark is claimed.

## Access and operational limits

Browser roles have no direct table or function grants. RLS remains deny by default; the server validates the Google identity and checks property membership before all reads and writes. Admin-only operations validate their target assignment/submission/member belongs to the selected home. The property cookie selects a home but grants no permissions. Session and API responses are private with `no-store`; Next.js caches static pages and versioned assets. Callback URLs stay unchanged; signup intent travels in a short-lived HttpOnly cookie.

The existing Apps Script sender polls all enabled households. New properties have reminders disabled until the admin enables them. This free prototype shares one Gmail sender and its quota across properties; it is not yet a commercial email service or separate sender per agent. No new council schedule is inferred from a property address.

Google OAuth must allow the intended users. If the Google Cloud OAuth audience is still **Testing**, add testers or publish the basic-profile application before opening signup broadly. No password/email verification delivery dependency was added.

## Validation

`npm test`, `npm run typecheck`, and `npm run build` verify the application. `tests/accounts.integration.sql` runs in a rolled-back transaction to check empty setup, role separation, invitation binding and expiry, cross-home assignments, scoped settings/walkthrough replacement, original data preservation and revoked browser privileges. It also checks the real `service_role` can create a property.

`scripts/accounts-check.mts` uses temporary, confirmed synthetic accounts without sending email. It exercises actual Supabase sessions and browser/API signup, empty property setup, address display, tenant guide persistence, invitations, one-tenant scheduling, role checks and cross-property access denial. It cleans up its own test accounts/properties afterward. Set `CHECK_BASE_URL` to the local test server (default `http://localhost:3007`) or deployment URL; the server's `APP_URL` must match that origin. Screenshots stay in ignored `.local` storage.
