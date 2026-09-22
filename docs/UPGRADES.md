# Safe upgrades

The live household database is separate from deployments. Publishing a UI update does not recreate accounts, reset the roster, restart the rotation, or clear submissions.

## Release workflow

1. Work on a feature branch and run `npm ci`, `npm test`, `npm run typecheck`, and `npm run build`.
2. Deploy a Vercel Preview with a separate test database for authenticated interface and storage checks. Keep production credentials out of ordinary previews.
3. Before a live database migration, export the affected tables. Supabase Free does not include automatic backups.
4. Apply additive, backward-compatible migrations first. Add new columns, tables, or functions while keeping fields and APIs used by the live version.
5. Deploy a production candidate without moving the live domain:

   ```sh
   vercel deploy --prod --skip-domain
   ```

6. Smoke-test the candidate with an approved account. Do not send test reminders or submit fictional work to production.
7. Promote the verified deployment. The stable production domain remains unchanged, so existing QR codes and reminder links continue to work.
8. Check the next reminder/cleanup run. Use Vercel rollback if needed; additive migrations remain compatible with the previous deployment.

## Compatibility rules

- Use expand → migrate → verify → switch clients → remove later for schema replacements.
- Never run database reset, destructive seeds, or old bootstrap inserts during a build or deployment.
- Do not delete storage paths during app upgrades. Only retention cleanup removes expired proof.
- Keep `WORKER_SECRET` unchanged during normal releases. Rotate it in Vercel and Apps Script together.
- Keep one Apps Script trigger. `install()` removes its previous trigger before creating a replacement.
- Saved drafts and uploaded photos are server-side. Users should press **Save draft** before leaving a task.
- CI verifies changes but does not automatically publish production.
