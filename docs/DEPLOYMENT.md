# Deploy on Vercel Free

## Current services

- Supabase: `housekeeping`, Sydney region, project `nttvdvsmsxwhjzfjveja`
- Vercel: `housekeeping-najib` in `iamnajib71s-projects` (Hobby)
- GitHub: `iamnajib71/housekeeping`

## Production environment variables

Configure these for Production only:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` as a Vercel Secret
- `WORKER_SECRET` as a Vercel Secret, using the same random value as Google Apps Script
- `APP_URL`, the stable production HTTPS address without a trailing slash

Do not connect preview deployments to the household database. Use `/demo`, a separate test Supabase project, or local Supabase for preview work. Worker endpoints refuse non-production Vercel environments.

## Google sign-in: one-time setup

No paid domain is required.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project named **Housekeeping**.
2. Open **Google Auth Platform → Branding**. Set the app name to **Housekeeping**, choose your support email, and save.
3. Under **Audience**, choose **External**. While the app is in Testing, add all six household Gmail addresses as test users.
4. Under **Clients**, create an **OAuth client ID** with application type **Web application**.
5. Add the permanent Vercel URL under **Authorized JavaScript origins**.
6. Add this exact **Authorized redirect URI**:

   ```text
   https://nttvdvsmsxwhjzfjveja.supabase.co/auth/v1/callback
   ```

7. Copy the client ID and client secret into the Google provider at [Supabase Auth providers](https://supabase.com/dashboard/project/nttvdvsmsxwhjzfjveja/auth/providers). Enable Google and save. Never add the client secret to this repository.
8. In **Supabase Authentication → URL Configuration**, set Site URL to the production Vercel URL and add `https://YOUR-APP.vercel.app/auth/callback` as a redirect URL.
9. Sign in as Najib. Then verify that a Google account outside the roster is denied.

Google login and Gmail reminders are separate. Login identifies each housemate; Apps Script sends reminders.

## Free Gmail reminders and cleanup

Open `/setup` on the live app. Download the script, copy it to a private [Google Apps Script](https://script.google.com/home/start) project, and add `APP_URL` and `WORKER_SECRET` under Script properties.

Run `install()` once and approve Google's send-only permission. Then run `tick()` once and check the execution log. The script does not read the Gmail inbox. No public Apps Script deployment is needed.

## QR code

After the permanent production URL is active, open **Household QR code** in the app and download or print it. The QR opens the stable login page and contains no password or access token.

## Free-tier notes

Vercel Hobby is intended for non-commercial personal use. Supabase Free currently includes limited database and file storage and may pause inactive projects. Google Apps Script personal accounts currently allow 100 email recipients per day. Check provider dashboards because quotas can change.
