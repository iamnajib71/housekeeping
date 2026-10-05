# Household cleaning mobile app: build and store release plan

Prepared 5 October 2026. This is a proposed roadmap, not an implemented mobile app. Prices and store requirements below were checked against official documentation on this date; recheck them before release.

## 1. Product and release scope

Build an Android and iPhone companion to the existing web app. Keep the web app working throughout development. Members should use the same household, roster, duties, proof, feedback and history from either client.

The first mobile release should provide:

- Household creation and invitations, with admin and member roles.
- Personal dashboard, future roster and proposed Monday duty shares.
- Optional cleaning start, submission time, task checkboxes and multiple photos.
- Task-specific rejection reasons and focused resubmission that preserves accepted work.
- Household-visible proof and the existing 15-day photo retention policy.
- Native photo capture, uploads that can recover from interruption, and reminder notifications.
- An optional admin camera walkthrough that suggests areas and duties on the phone.
- Accessible manual setup when camera access or detection is unavailable.
- Account deletion, support, and clear privacy controls.

Position the vision feature as **assisted household setup**. It suggests fixtures, rooms and duties; it does not verify cleanliness or prove someone performed a task. Onboarding should never be required for everyday submission.

Keep billing, cleaning-quality scoring, automatic floor plans and property-manager reporting outside the first release. Confirm demand with a small pilot before expanding.

## 2. Recommended mobile technology

Use **React Native with Expo development builds**, plus a small native camera/vision module. This fits the existing React/TypeScript codebase and lets us share validated business logic. React Native screens still need to be built: existing DOM components and CSS cannot simply become native screens.

Expo development builds support native code beyond the fixed Expo Go environment. Use the Expo Modules API to expose our Kotlin and Swift scanner. Pin tested package and native dependency versions. [Development builds](https://docs.expo.dev/develop/development-builds/introduction/), [Expo Modules](https://docs.expo.dev/modules/overview/).

Proposed components:

| Component | Choice | Purpose |
| --- | --- | --- |
| Mobile interface | React Native / Expo development build | Dashboard, schedule, proof and onboarding |
| Android scanner | Kotlin, CameraX, MediaPipe Tasks Vision | Camera frames and on-device detection |
| iOS scanner | Swift, AVFoundation, MediaPipe Tasks Vision | Equivalent camera and detector pipeline |
| Shared TypeScript | Schedule, task-feedback rules, types, plan validation | Consistent rules across clients |
| Cloud data | Existing Supabase, after household isolation work | Auth, roster, proof metadata and private storage |
| Server operations | Versioned API alongside existing Next.js endpoints | Reminders, reviews, secure plan application |
| Push reminders | FCM, with APNs configured for iOS | Mobile reminder delivery |

Keep the current Next.js app at its existing repository root initially. Add `mobile/` and, when useful, `packages/shared/`; do not move the deployed web application as the first step. Add independent mobile build scripts and avoid changing the Vercel build command until tested in preview.

A web wrapper could provide an earlier experiment, but it would still need native scanner integration, reliable auth and native interactions. For the public release, prioritize the companion above. Apple expects useful app functionality beyond a repackaged website. [Apple review guideline 4.2](https://developer.apple.com/app-store/review/guidelines/).

## 3. Proper vision model for the first trial

Start with **EfficientDet-Lite0, int8, 320 × 320**, through MediaPipe Object Detector on both platforms. Google recommends this lightweight COCO-trained model; its vocabulary contains 80 object classes. It detects objects, not room names. Validate the downloaded model's actual label metadata before using any label in the interface. [Model details](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector).

Useful supported labels can include sink, toilet, oven, refrigerator, couch, dining table and chair. A visible oven can support a kitchen suggestion; a toilet supports a toilet/bathroom suggestion; couch and table support a lounge suggestion. A sink alone is ambiguous. Standard models may not recognize a washing machine, stovetop or laundry reliably, so provide manual choices and avoid pretending those classes are supported.

Use native MediaPipe live-stream mode, asynchronous results and an inference worker. Android and iOS have official camera examples to adapt; these are native APIs, so our React Native bridge must be implemented and tested. [Android guide](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector/android), [iOS guide](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector/ios).

Choose int8 CPU inference as the baseline. Benchmark float16/GPU as an alternative if it improves real devices; acceleration is not guaranteed to be faster or supported uniformly. Keep inference completely on-device for this mode, with no Gemini key in the app and no per-scan cloud inference charge. The current optional cloud-video trial remains a separate, consented feature.

Do not introduce a large generative vision model for every camera frame in version one. A compact object detector, conservative room rules and editable cleaning templates provide a more practical first experiment on varied phones.

Before redistribution, review the exact model asset's license and provenance, the runtime license and required notices. Keep a model manifest with asset checksum, labels, version and license references. Do not assume a project's source-code license covers every pretrained weight or training image.

## 4. Live-view detection workflow

Proposed user flow:

1. Admin chooses **Scan shared areas** and sees a short explanation that this mode processes camera frames on the phone.
2. Request camera permission at that moment. Microphone permission is unnecessary for visual-only scanning.
3. Show a smooth camera preview. Analyze selected frames at an initial target of 3–5 frames per second, reducing the rate on slow or warm devices.
4. Display unobtrusive fixture boxes and suggested labels. Use **Possible kitchen**, rather than a certain claim based on one frame.
5. Combine repeated observations over roughly 1–2 seconds. Start with a configurable detector-score threshold around 0.6 and tune it on pilot data. These are engineering starting points, not calibrated accuracy claims.
6. Admin taps **Add this area** or **Next area**. Keep fixtures grouped within that segment and deduplicate repeated observations.
7. Suggest daily and weekly duties from fixture/room templates.
8. Show an editable summary: rename areas, merge duplicates, remove incorrect fixtures, add missed areas and revise tasks.
9. Preview the effect on the current setup. Apply only after an explicit admin confirmation.

Example rules to evaluate:

| Observations | Proposed area | Reason to request confirmation |
| --- | --- | --- |
| Oven + refrigerator, possibly sink | Kitchen | Some fixtures may be obscured |
| Toilet | Toilet / bathroom | Two separate toilets must stay separate |
| Couch + table / chairs | Lounge / common space | An open-plan room may include dining and kitchen |
| Sink only | Unknown wet area | Could be kitchen, bathroom or laundry |
| No supported distinguishing fixtures | Admin-selected area | Hallways and laundry can be missed |

Use native camera orientation and crop transforms when positioning boxes. Keep raw frame buffers in the native module; return only small detection records to JavaScript. Drop frames when inference is busy rather than building a queue. Release camera resources and stop inference when the app is backgrounded.

Object detection cannot reliably tell whether two visually similar rooms are the same physical room. Explicit area boundaries and admin names solve this in the first release. AR-based mapping is a later research option and should not block onboarding.

Store the confirmed setup and optional selected evidence only. Do not upload or retain the live camera stream by default. If we later collect clips for model training, request separate opt-in consent; accepting setup must not imply training consent.

## 5. Model evaluation and improvement

Before selecting the shipping configuration, run a repeatable benchmark on actual Android and iPhone devices, including lower-cost Android hardware and an older supported iPhone.

Measure fixture precision/recall, incorrect room suggestions, missed areas, duplicate areas, time to obtain a stable suggestion, battery/thermal behavior and the number of admin corrections. Test low light, reflections, clutter, rapid movement, portrait/landscape, permission denial and camera interruptions.

Suggested release gates, to be validated rather than advertised as achieved:

- At least 90% precision for room suggestions we choose to display on held-out households; allow unknowns instead of forcing a label.
- Smooth camera preview with inference off the interface thread.
- A stable suggestion within about two seconds on the declared baseline devices.
- A three-minute walkthrough without crashes or severe thermal slowdown.
- A complete manual onboarding path on every supported device.

Use household-separated evaluation sets so adjacent frames from the same home do not leak into both training and testing. Check thresholds per fixture and room rather than publishing one misleading aggregate score.

If the initial detector misses important fixtures, collect a consented, commercially usable dataset and train a custom compact detector. If room classification remains weak, evaluate a **MobileNetV3-Small-based classifier trained for our room taxonomy**, export a compatible quantized model and benchmark it alongside fixture detection. This would be a newly trained model, not an off-the-shelf room classifier we already have. A dedicated model should ship only if it reduces admin corrections on unseen homes.

## 6. Backend changes needed before public delivery

The current system serves one six-person household. A public product needs household isolation and self-service access before it can safely serve other homes.

Add households, household memberships, invitations, areas, versioned duty templates, assignments, proof, feedback and device registrations. Every household-owned row and storage object needs an enforceable household boundary. Bind memberships to verified auth user IDs; use email to deliver invitations, not as the sole permanent identity. Test cross-household access with separate real accounts.

The current rotation is specifically designed for six members and uses fixed Melbourne scheduling helpers. Generalize household size, timezone and roster configuration behind a compatibility layer. Preserve the current household's exact six-person rotation and historical assignments. Bin collection calendars should become household settings with verified locality-specific dates.

The existing API relies on browser session cookies and browser-origin checks. A native app cannot simply reuse that authentication path unchanged. Add `/api/v1/` mobile endpoints that validate Supabase access tokens, household membership and role on the server. Keep cookie/origin protection on existing browser endpoints. Never accept a user or household ID as authorization by itself, and never ship Supabase server keys, worker secrets or Gemini keys in a mobile binary.

Use stable API response shapes, idempotency keys for submissions and upload requests, conflict handling for changed assignments, and short-lived authorized storage access. A server-side apply operation should atomically create a new setup version and update only unstarted work; started/submitted records keep their original checklist and evidence.

Add invitation expiry, device-token cleanup, audit events, monitoring, restore-tested backups and per-household limits before onboarding paying customers. Proof deletion should remove storage objects and revoke future access, while handling device caches. Define deletion/anonymization of personal history explicitly rather than assuming retained history is exempt from account deletion.

## 7. Login, reminders and offline behavior

Keep login simple: Google on Android, Google plus Sign in with Apple on iOS, and invitations tied to verified membership. Plan an equivalent privacy-preserving login option for the public iOS app in line with guideline 4.8. Apple private relay emails mean account linking must use verified provider identities and explicit linking, not assume the Apple email matches a Gmail invitation. [Apple login requirements](https://developer.apple.com/app-store/review/guidelines/).

Store refresh credentials through secure OS storage. Optional biometric unlock protects an existing session; it does not replace server authentication. Avoid a universal household PIN or an insecure PIN-only cloud login. Refresh sessions silently and provide account switching and logout for shared devices.

FCM provides cross-platform messaging, with APNs integration for Apple devices. Queue reminders server-side, deduplicate delivery, use each household's timezone and let members choose push/email preferences. Push notifications are best-effort delivery; include the schedule in the app and retain email as an optional fallback. Do not put private proof URLs or rejection details on lock screens by default. [FCM overview](https://firebase.google.com/docs/cloud-messaging).

Offline mode should cache the roster and save local draft checkmarks/notes. Label unsent work clearly. Queue proof uploads and submit only after the server confirms the uploaded evidence. When duties have changed, ask the member to review the updated checklist instead of silently submitting obsolete tasks. Persist session timestamps so optional start timing survives app restarts.

## 8. Google Play publishing procedure

1. Choose the publishing identity, app name and permanent Android package ID. Register a Play Console account and finish identity/device verification. Registration currently costs **US$25 once**. [Google registration](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en).
2. Configure a release signing setup and back up the upload key outside the repository. Enable Play App Signing. Build a signed **Android App Bundle (.aab)**. Register Google OAuth using the production signing certificate as well as the debug configuration. [Android signing](https://developer.android.com/studio/publish/app-signing).
3. Target the current required SDK. As checked today, new phone apps and updates need **Android 16 / API 36 or higher** from 31 August 2026. Choose the minimum supported Android version independently after camera/runtime testing. [Target API policy](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-EN).
4. Create the app listing: description, actual product screenshots, icon, feature graphic, support contact, category, countries and pricing. Avoid accuracy claims the pilot has not established.
5. Complete App content declarations, app access instructions, age rating, ads declaration, privacy policy and Data safety. Include data collected by all SDKs, cloud video processing when enabled, proof retention and deletion. [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).
6. Provide both in-app account deletion and a functioning public deletion-request web page when account creation is supported. [Google account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).
7. Publish an internal test, then the required closed test. New personal accounts created after 13 November 2023 currently need **at least 12 testers continuously opted in for 14 days** before applying for production access. Our six housemates alone would not meet that requirement; recruit additional genuine testers. Approval is not automatic after the period. [Testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB).
8. Fix test/pre-launch findings, submit production access information and the release for review, and monitor stability after approval. Use testing tracks before later updates and gradual rollout where available.

Request camera access only for scanning or proof capture. Use the system media picker for occasional uploads; avoid broad gallery permissions. No background camera or location permission is needed for this product.

## 9. Apple App Store publishing procedure

1. Enroll the publishing owner in the Apple Developer Program. It currently costs **US$99 per membership year**, with regional pricing. Organization enrollment requires a legal entity, D-U-N-S number and additional business verification, including a matching domain/site; individual enrollment has different requirements. [Apple enrollment](https://developer.apple.com/programs/enroll/).
2. Arrange a Mac with a supported Xcode version or a macOS build service. A Windows-only local setup cannot compile/sign the native iOS release. Since 28 April 2026, uploads require **Xcode 26 or later and the iOS 26 SDK or later**. This is a build SDK requirement, not a requirement that every user's phone run iOS 26. [Apple SDK requirements](https://developer.apple.com/news/upcoming-requirements/?id=04282026a).
3. Register the permanent bundle ID, signing capabilities, Apple login and push notifications. Configure OAuth return links and entitlements for the release identity.
4. Create the App Store Connect record. Supply screenshots, description, age rating, support URL, privacy policy and accurate App Privacy answers, including third-party SDK behavior. Add clear camera usage text; request microphone access only if an optional spoken-input feature is actually offered.
5. Include an easy in-app account deletion flow and token revocation for Apple login. Deactivation alone is insufficient. [Apple account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app).
6. Archive/sign and upload a release build. Test through TestFlight; external beta testing may require beta review. Validate camera performance on real phones. [TestFlight](https://developer.apple.com/testflight/).
7. Provide reviewers a working account in an **isolated review household**, sample tasks and a walkthrough example. Do not grant access to our real household's photos. Include instructions for admin/member flows, local vision, permissions and setup confirmation. The production members' dashboard stays free of demo content. Apple requires review access and useful app functionality; acceptance cannot be guaranteed. [Review guidelines](https://developer.apple.com/app-store/review/guidelines/).
8. Submit the selected build, answer review questions, resolve issues and release after approval. Keep API compatibility for older installed app versions while preparing subsequent store updates. [App Store Connect](https://developer.apple.com/app-store-connect/).

Because members share photos and notes, include content reporting, removal and abuse controls appropriate to a public household product. Add a support response process. Do not market the release as a hidden monitoring tool.

## 10. Costs and the limits of “free”

| Item | Household trial | Public commercial release |
| --- | --- | --- |
| On-device model inference | No per-inference provider fee | Same; engineering/testing costs remain |
| Web/database hosting | Existing free tiers within limits | Budget for permitted usage, capacity and reliability |
| Android store account | US$25 one-time fee | Same, subject to current policy |
| Apple store account | US$99/year | Same, subject to region/enrollment type |
| iOS build hardware/service | Existing Mac or available build allowance | Mac/build-service costs depend on access and volume |
| Optional cloud video analysis | Available free quota, not guaranteed | Separate quota, consent and cost controls |
| Support/domain/email/backup | Small pilot can start cheaply | Budget operational costs before paid customers |

**Vercel Hobby currently permits non-commercial personal use only.** Keep the current private household experiment within that scope. Before commercial delivery, choose a suitable paid Vercel plan or migrate to hosting whose terms permit the intended commercial use. On-phone vision does not remove hosting, storage or store-account costs. [Vercel Hobby terms](https://vercel.com/docs/plans/hobby).

Paid cloud builds are optional: Android can build locally with the native toolchain, and iOS can build locally on a Mac. EAS cloud builds can simplify signing and distribution, but quotas/pricing must be checked at the time. EAS local build has platform limitations; do not promise Windows EAS-local support. [Local build documentation](https://docs.expo.dev/build-reference/local-builds/).

Start without subscriptions. If later selling digital features in the app, plan compliant store billing, purchase restoration, server entitlement checks and cancellation handling; payment rules vary by storefront and change. Recheck the current rules before designing checkout.

## 11. Migration without disrupting the household

Use an additive rollout:

1. Back up the current database and verify a restore before structural work.
2. Add household/version columns and tables without deleting old columns or changing current IDs.
3. Backfill the existing household, then test constraints and cross-household access in staging.
4. Add authenticated mobile API v1 while keeping the current web endpoints functional.
5. Run compatibility tests against saved roster, submission, feedback and retention examples.
6. Pilot the mobile client against an isolated test household first, then optionally invite current members.
7. Enable native scanning behind an admin feature flag. Applying a setup still requires explicit confirmation and preserves started/submitted work.
8. Roll out public signup only after household isolation and support readiness pass.
9. Remove obsolete fields only after all supported clients have migrated; do not require everyone to install an update on the same day.

Keep feature flags and a server-side scanner disable switch. Maintain web access as a fallback. Store releases can take time; deploy backend changes with backward compatibility rather than expecting an immediate mobile rollout. Version model assets and retain a tested fallback model.

## 12. Milestones, acceptance and next decisions

These are planning estimates for focused development, not promised delivery dates:

| Milestone | Indicative effort | Exit condition |
| --- | --- | --- |
| A. Product scope and backend foundations | 1–2 weeks | Household isolation, mobile auth design and migration tests |
| B. Native member workflow | 2–3 weeks | Login, roster, camera proof, feedback and offline drafts on both platforms |
| C. On-device scanner prototype | 1–2 weeks, partly alongside B | Live boxes, suggested areas and manual confirmation on real devices |
| D. Evaluation and release hardening | 1–2 weeks | Device matrix, privacy/deletion, permissions, restore and failure recovery pass |
| E. Store testing and review | At least 2 weeks for applicable Play closed test; review duration varies | Required testing completed, listings submitted and stores approve |

Allow roughly **8–12 weeks for an initial public-quality release**, potentially longer for a solo developer, new native integrations, enrollment delays or a custom trained model. Start account enrollment and recruiting testers early. Android can lead the pilot, while iOS support and Apple login are built in parallel.

Release checklist:

- No cross-household access; no secrets in binaries or logs.
- Existing household web workflow and historical evidence preserved.
- Google/Apple login, returning sessions, logout and account deletion tested.
- Camera/media/notification permissions can be denied without blocking normal use.
- Future duties, Monday shares and task-specific fixes render correctly.
- Photo upload survives retry; unsent work is never shown as submitted.
- Retention and account deletion remove cloud objects and handle local caches.
- Scanner evaluated on real low/mid/high-tier devices; manual setup always works.
- Store review household, screenshots, privacy answers and support links prepared.
- Production alerts, rollback, quota limits and tested backup recovery ready.

Decisions to make before implementation: publishing name and owner; personal or organization accounts; access to a Mac/iPhone; baseline supported devices; pilot households/testers; and whether the first release is free-only. This plan does not create accounts, purchase memberships, implement a mobile app or publish a store listing.
