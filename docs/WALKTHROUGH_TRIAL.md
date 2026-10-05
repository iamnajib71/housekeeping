# Admin walkthrough trial

Open `/app?view=setup` as the household admin. Members keep the normal task workflow.

1. Upload or record a video of common areas, up to 3 minutes / 250 MB.
2. Consent to send the complete video, including audio, to Google Gemini. Avoid people, private conversations and documents. Free-tier Google inputs may be used to improve its products: [terms](https://ai.google.dev/gemini-api/terms).
3. The browser sends 2 MB chunks through authenticated Vercel routes. Private Supabase temporary storage groups four chunks into the 8 MB upload required by Google's resumable Files API, then removes them after forwarding. Video decoding and analysis run in Google's cloud, so no local computer, video decoder or background server is needed. Keep the page open during upload. A failed chunk retries automatically; after upload, processing can continue through the saved trial selector.
4. Review suggested areas, fixture descriptions, evidence timestamps, and daily/weekly duties. Rename, remove or add areas and move duties by editing the two lists. One task per line.
5. Save the trial draft independently of the current cleaning setup. Reopen recent drafts from the selector. Housekeeping retains the editable plan and evidence timestamps. Google's temporary file is deleted after analysis. The existing maintenance worker retries failed deletion and removes leftover private upload chunks and abandoned processed uploads older than two hours; Google also expires Files API files after 48 hours. Incomplete resumable upload sessions expire at the provider. Normal uploads buffer at most 8 MB at a time; interrupted uploads consume temporary Supabase space until cleanup runs.
6. Preview replacement, then explicitly confirm. The confirmed area names become the active summary across the app. Area-prefixed tasks replace both checklists. Today's/future assignments without any submission are updated; started/drafted/submitted assignments and history retain their original task records. Reminder hours, memberships, dates, photos, feedback and rotation are preserved.

## AI configuration

Set `GEMINI_API_KEY` as a server-only production Vercel variable. Optional `GEMINI_MODEL` defaults to `gemini-2.5-flash`. For free use, create the key in a Google project without paid billing enabled. Gemini's free quota and regional eligibility are account-specific; see [pricing](https://ai.google.dev/gemini-api/docs/pricing). A key belonging to a billed project may incur charges even for the same model; Housekeeping cannot determine the billing tier from the key. The app does not enable billing or use an automatic paid-model fallback. Vercel Hobby and Supabase Free quotas also apply.

The server caps analysis at 20 attempts per admin per 24 hours and one attempt per minute, including failed attempts. A quota failure leaves the active setup unchanged. No key is sent to the browser or included in API errors.

## Trial boundaries

Google analyses the uploaded video and may use spoken room names. The admin must correct missed areas, duplicate rooms, wrong appliance guesses, and unsuitable frequencies. Suggestions are not verification of dirt, hygiene or completed cleaning. The app supports 12 areas and 30 duties per daily/weekly checklist.

Test different walkthrough speeds and lighting. Inspect evidence timestamps and check the resulting task lists before applying. The feature is a trial within this existing single-household app, not a multi-household signup flow.
