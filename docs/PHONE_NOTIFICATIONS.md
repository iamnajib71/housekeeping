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

## Recommended next step: web push

This is a proposed feature, not an existing Enable notifications button.

The tenant experience after implementation:

1. Open the live app and log in.
2. Tap **Enable notifications** and accept the browser permission.
3. At the deadline, receive an alert such as “Your cleaning proof is still missing”. Tap it to open the assigned task.

On Android, compatible browsers support web push. On iOS/iPadOS 16.4 or later, add the app to the Home Screen and grant permission from that installed web app; see [Apple's WebKit documentation](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/). [The Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) can deliver notifications when the app is not open. Internet connectivity, notification permission and device/browser policies affect delivery.

Implementation would add a service worker, an explicit opt-in button, and private browser subscriptions bound to the authenticated user. Use standard Web Push with VAPID keys on the server, a separate idempotent push queue triggered by the existing cloud scheduler, permission/revocation controls and cleanup of expired subscriptions. Clicking an alert must still require normal login and property membership. Avoid storing private dashboard responses in the service-worker cache. Keep email working independently when push is denied or unavailable.

Standard Web Push avoids a paid SMS provider. Firebase Cloud Messaging is another no-cost messaging option according to [Firebase pricing](https://firebase.google.com/pricing), though other Firebase products have their own quotas and costs. A separate Firebase account is unnecessary if the app uses standard Web Push directly.
