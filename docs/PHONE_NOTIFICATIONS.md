# Phone reminders

## Working now: email

The original home's cleaning deadline is 22:00 in Australia/Melbourne. Its existing Gmail Apps Script checks every 15 minutes and sends overdue emails only to assigned members whose own part is still unsubmitted. Submitted and approved parts are excluded, including a Monday partner who has already submitted. Drafts and requested fixes still need submission. Each assignment/member/overdue combination has one delivery job, so polling does not repeatedly send it. A new submission is checked again before an email is handed to Gmail.

Tenants can turn on notifications for the Gmail account receiving reminders. No app store installation, phone number or paid email domain is needed. Delivery timing depends on the Apps Script trigger, Gmail quota and connectivity; 22:00 is the eligibility time, not a guaranteed exact arrival time. This home's deadline can be changed under Household settings. New properties retain their own reminder preferences.

## Optional actual SMS through an Android phone

This is a setup option, not an enabled app feature yet.

[TextBee](https://textbee.dev/docs/faq) turns an Android phone into an SMS gateway. Its free plan currently permits one device, 50 messages a day and 300 a month, counting sent and received messages. The SIM sends the SMS; it uses the existing mobile plan. It has no extra per-message gateway fee, but carrier SMS charges, automation restrictions and fair-use terms still apply. A phone with included SMS can make this inexpensive without a separate SMS provider subscription.

1. Create a TextBee account and install its Android app using the [official setup guide](https://textbee.dev/docs/getting-started).
2. Connect the Android phone, allow sending SMS, and keep it powered on with internet and mobile reception. Allow the app to run in the background. Receiving SMS is not needed for outbound reminders.
3. Create a private API key and obtain the device ID. Store these only in encrypted production environment variables, never in GitHub or chat.
4. Add tenant phone numbers, consent and an SMS preference to the app. Integrate a separate SMS delivery queue with per-recipient deduplication and delivery status. Keep Gmail as the fallback when the gateway is unavailable.

Only the sender needs the gateway app; recipients receive ordinary SMS. This is not enabled simply by owning an Android phone. No phone numbers or TextBee credentials have been collected by the current app.

## Web push and Home Screen setup

The app includes a compact **Phone setup** card with **Add app**, **Enable**, and **Later**. It appears on entry; choosing Later defers it for seven days. The small Phone setup button reopens it anytime. Browser installation and notification permissions are requested only after the person taps a button.

The tenant experience:

1. Open the live app and log in.
2. Tap **Add app** if wanted, then **Enable** and accept the browser permission.
3. At the deadline, receive an alert such as “Your cleaning proof is still missing”. Tap it to open the assigned task.

On Android, compatible browsers support web push. On iOS/iPadOS 16.4 or later, add the app to the Home Screen and grant permission from that installed web app; see [Apple's WebKit documentation](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/). [The Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) can deliver notifications when the app is not open. Internet connectivity, notification permission and device/browser policies affect delivery.

Use **Send test** after enabling to check actual delivery on your phone. **Turn off** removes this device's subscription. Signing out also disconnects the device, preventing reminders for the previous account on a shared phone. Blocked permissions must be changed in browser/phone settings; the app cannot override them.

Subscriptions are private, bound to the authenticated account, and accessible only through server routes. Standard Web Push uses server VAPID keys and a separate queue, polled by the existing Gmail Apps Script. No new Apps Script installation or Firebase account is needed. The original property's 22:00 Melbourne deadline controls eligibility; arrival depends on the 15-minute trigger, network and phone settings. Each missing assignment/member/device combination is queued once, checked again before sending, and retried up to three attempts. An expired device is removed. A provider acceptance is not proof that a person read the alert.

Clicking an alert still requires normal login and property membership. The service worker does not cache private dashboards, authentication, API data or proof photos. Gmail runs independently if push fails, is denied or is unavailable. Queue records are pruned after 30 days; submitted cleaning history is unaffected.

Standard Web Push avoids a paid SMS provider. Firebase Cloud Messaging is another no-cost messaging option according to [Firebase pricing](https://firebase.google.com/pricing), though other Firebase products have their own quotas and costs. A separate Firebase account is unnecessary if the app uses standard Web Push directly.

## Telegram and WhatsApp trials

A manual Telegram voice-message trial is available in `scripts/telegram-voice-trial.mts`; it is not enabled in the nightly scheduler. Create a bot through BotFather, store its token privately, and have the test recipient Start the bot. Discover private Start messages with `npx tsx scripts/telegram-voice-trial.mts --discover`; select the intended recipient's chat ID in `.env.local`, then run the script with an OGG/Opus, MP3 or M4A recording. The current script uploads an OGG/Opus recording. It sends once, keeps its receipt in ignored `.local`, and never writes tokens or contact IDs to GitHub. A static spoken reminder can be reused without paying for speech generation on every delivery. See [Telegram sendVoice](https://core.telegram.org/bots/api#sendvoice).

For a later cloud integration, upload the approved generic recording once, use Telegram's returned file ID, link each consenting recipient to their verified app account, and add a separate delivery queue. Bots cannot initiate a private voice call: [phone.requestCall](https://core.telegram.org/method/phone.requestCall) is available only to user accounts. [NTgCalls](https://github.com/pytgcalls/ntgcalls) supports private-call media, but a ringing-call trial needs a normal caller account, a different recipient account and a separate media worker. Suitable free cloud hosting has not been verified.

`scripts/telegram-call-trial.py` runs a manual private-call test with pinned dependencies in `scripts/telegram-call-requirements.txt`. Create an API application through [Telegram's guide](https://core.telegram.org/api/obtaining_api_id), save credentials privately, and run `--login` in a private terminal. Login does not place a call. Keep the selected recipient in ignored `.local/telegram-call-target.json` (`name`, `username` or `phone`), and a short mono 48kHz 16-bit PCM reminder at `.local/telegram-call-test.pcm`. A privately cached `userId` can be used after verifying an exact contact-number match. Number lookup falls back only to a unique exact match in the caller's saved contacts. `--resolve` checks the contact without calling; `--call` is only for an explicitly requested trial. The script accepts only a different normal user, limits ring time and playback, hangs up afterward, records a private receipt and prevents an accidental repeat. It neither captures the recipient's audio nor schedules automatic calls.

The recording now starts from its beginning after the media connection completes, with silence supplied during negotiation and the outgoing stream explicitly resumed and unmuted. The caller explicitly subscribes to Telegram updates and refreshes that registration during the trial. Receipts distinguish Telegram answer events, media connection and playback; a ring or timeout is not proof that audio was delivered. Connection and model-compatibility regression checks are in `tests/telegram_*_test.py`. On 11 October 2026, one answered handset test reached CONNECTED, played the recording, hung up with a 23-second service record, and was confirmed audible by the user. Subsequent trials on other contacts timed out before connection, including a reported silent ringing call. Private calling therefore remains experimental, with no automatic nightly calling enabled. If the native Windows worker lingers after hangup, stop the CLI only after its receipt has an `endedAt` value and the call has ended.

### Different reminder voices

`scripts/telegram-reminder-voice.py` generates a recording without calling anyone. It defaults to **local Kokoro**, using `scripts/telegram-kokoro-requirements.txt` plus the official [Kokoro ONNX model and voices](https://github.com/thewh1teagle/kokoro-onnx). Place `kokoro-v1.0.onnx` and `voices-v1.0.bin` from the `model-files-v1.1` release in ignored `.local/kokoro`. The tested model SHA256 is `beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a`; the voices SHA256 is `bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d`. Local CPU synthesis was tested with coach and gentle profiles. The script handles the export's float speed input without losing fractional speech rates.

Use `--name NAME --style auto --engine kokoro`. Local styles rotate between hero, comic, coach, gentle and announcer, changing the wording and voice. Microsoft rotation also includes Hindi comic. These are generic personas, not impersonations of real performers. `--engine microsoft` uses [edge-tts](https://github.com/rany2/edge-tts) and sends the recipient name and reminder text to Microsoft's online speech service, so obtain approval for that data transfer first. Microsoft English and Hindi recordings were generated successfully in the trial; local Hindi synthesis has not yet been verified and is excluded from automatic local rotation. This unofficial speech client is an experiment, not a guaranteed production service. A recording identifies itself as an automated test and does not claim the recipient has an overdue assignment. Production messages must first verify actual task status.

Generated samples, style history, model weights, contacts, account session, audio metadata and call receipts stay in ignored `.local`; none belong in GitHub. The generator refuses to replace a recording while a trial receipt indicates an active call. Install these speech dependencies only in the isolated trial environment, not in the Vercel web app. These scripts do not alter the live cleaning workflow.

WhatsApp's [Business Calling API](https://whatsappbusiness.com/blog/whatsapp-business-calling-api/) supports business-initiated calls after recipient permission. Its [Business Platform pricing](https://whatsappbusiness.com/products/platform-pricing/) has paid messaging categories and conditional free windows. Do not assume unattended nightly messages or outbound calls are free. No WhatsApp integration or calling service is enabled.
