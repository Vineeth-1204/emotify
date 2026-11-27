# Emotify – Push Notifications, Device Tokens and Avatar: Audit and Fix

Date: 2026-11-27. Base: `main` at `d7e0bb3` (includes your token-logging commit), fixes on
`claude/blissful-knuth-04nxs0`.

**Verification boundary.** Everything marked *code-verified* passed automated tests with the
Expo service stubbed. Nothing here was observed on a phone or in the production database; those
checks are in section F.

## Key fact from the audit

The notification you received ("Notice small good moments from today before winding down") is
the **server push copy** for `routine_evening` (`convex/notify.ts`). The app schedules no local
notifications at all: there is no `scheduleNotificationAsync` anywhere. **Every Emotify phone
notification is a server push and needs a row in `pushTokens`.** With `pushTokens` empty, every
notification is recorded `no_tokens` and only appears in the in-app centre.

That one notification therefore reached the phone through a token that existed when it was
sent. Either it arrived before the reinstall and the old token was later deleted when Expo
reported it unregistered, or the `pushTokens` table being checked belongs to a different Convex
deployment than the app uses. Section C shows how to tell which.

---

## A. Root causes

### Issue 1 – `pushTokens` stays empty

| # | Root cause | Where | Why it failed | Fix |
|---|---|---|---|---|
| 1a | **Asked once per install, never again.** If the explanation dialog was declined ("Not now"), the app never asked again and never registered. | `hooks/usePushNotifications.ts` (`push_permission_explained` flag) | Decline once → no permission → no token, permanently. | The explanation is re-offered after 3 days, and immediately from Profile → Phone notifications → **Turn on**. A permanently blocked permission is not re-prompted; Profile opens phone settings instead. The old flag counts as "offered long ago". |
| 1b | **Dismissing the dialog hung setup.** Android's Back button or a tap outside dismissed the alert without calling either button. | same, `askWithExplanation` | The promise never resolved, so registration stopped for that session. | The alert is `cancelable` with `onDismiss` → treated as "Not now". |
| 1c | **Registration ran only when sign-in state changed.** | same | Enabling notifications in phone settings, or recovering from a network failure, did nothing until the app was restarted. | Setup also runs when the app returns to the foreground (at most once a minute), when the push token refreshes (`addPushTokenListener`), and from Profile. |
| 1d | **Failures were invisible.** Token or registration errors were only `console.warn`ed on the device. | `utils/notifications.ts`, hook | Without device logs nobody could see why a phone wasn't registered. | `acquireExpoPushToken()` returns the reason. Each failed step (permission, token, backend) is reported to `pushTokens.reportRegistration` and stored in `pushRegistrationEvents`, with tokens redacted. This is visible in Profile, the Beta report and `diagnosePush`. |
| 1e | **Tokens deleted silently.** When Expo reports `DeviceNotRegistered` (app uninstalled or data cleared), the token was deleted with no trace. | `convex/pushTokens.ts` `deleteToken` | An empty table looked identical to "never registered". | Deletion now records an `invalidated` event for that user. |
| 1f | **The preview build didn't select an EAS environment.** | `eas.json` | EAS variables (Convex URL, Firebase file) were not applied to preview builds. | Added `"environment": "preview"`. |

Things that were already correct (code-verified):
- the `POST_NOTIFICATIONS` declaration;
- Android channels with DEFAULT/HIGH/MAX importance;
- the foreground handler (banner + list);
- the Expo token format (`ExponentPushToken[…]`, sent through Expo to FCM);
- the EAS project ID (`4f9d28f2…`);
- the user association (token stored under the signed-in user's ID);
- the idempotent upsert and logout removal.

### Issue 2 – most notifications never arrive

| # | Root cause | Where | Fix |
|---|---|---|---|
| 2a | Empty `pushTokens` (Issue 1) | – | See above. Without a token no server notification can reach the phone. |
| 2b | **The afternoon MicroGoal notification was never pushed.** The engine creates type `engagement_afternoon`, but the push text table only had `engagement_microgoal`, so it was saved in-app only. | `convex/engagementEngine.ts` → `convex/notify.ts` | Added `engagement_afternoon` to `PUSH_COPY` with the existing text. |
| 2c | **The engagement scheduler read only the first 100 accounts** (`users.take(limit*2)`), always the same 100 by creation time. Students created later were never evaluated. | `convex/engagementScheduler.ts` | Evaluates every active student, bounded at 1,000 students per run with a warning before that limit. |
| 2d | The MicroGoal reminder scan loaded every goal ever created (`collect()`). This is a scaling risk, not a cause today. | `convex/routines.ts` | Reads only goals from the last 25 hours. |
| 2e | **By design, a day has at most 4 engagement-type notifications, at least 2.5 hours apart.** Routine and MicroGoal reminders are saved as category `engagement`, so they count toward that cap and spacing. Up to 4 per day can arrive, not 12. | `engagementEngine.ts` | **Not changed** (product decision, see H). |

### Issue 3 – generic icon instead of the avatar

| Root cause | Where | Fix |
|---|---|---|
| Commit `854ac71` removed the avatar from the push payload (`richContent.image`) when switching the status-bar icon to the monochrome logo. Since then, notifications have had no large icon. | `convex/pushNotifications.ts` (`deliverNotification`, `sendPushNotification`) | Restored the avatar: students get their chosen companion, or the app's default companion (girl) if none is chosen; staff get no image. The status-bar small icon is unchanged. |

Also fixed: `convex/screening.ts` sorted a student's screening history by completion time only,
so two screenings in the same millisecond could return the older one as "latest". This caused an
intermittent test failure; ties are now broken by creation order.

## B. Modified files

| File | Change |
|---|---|
| `hooks/usePushNotifications.ts` | New registration lifecycle (1a–1d): re-offer rule, cancelable dialog, foreground/token-refresh/Profile triggers, failure reporting, `requestPushSetup()` for Profile. Tap handling unchanged. |
| `utils/notifications.ts` | `acquireExpoPushToken()` returns the token or a reason; `getPushPermissionDetails()` (status + can-ask-again). `getExpoPushToken()` kept. |
| `common/pushRegistration.ts` (new) | Pure rules: when to ask, registration throttle, Profile states, test-result labels, token-free error text. |
| `components/PushStatusRow.tsx` (new), `app/(auth)/(tabs)/profile.tsx` | Profile → **Phone notifications**: On / Off / Blocked / Not set up, the last problem, Turn on / Open settings / Try again, **Send a test notification** and its delivery result. |
| `convex/pushTokens.ts` | `appVersion` stored on registration; `registered` and `invalidated` events; new `reportRegistration` mutation and `getMyPushStatus` query (no tokens returned). |
| `convex/pushNotifications.ts` | Avatar restored in both send paths (`notificationAvatarUrl`); `sendMyTestNotification` (own devices only, 5/hour); `diagnosePush` shows registration events; `getUserRole` helper. |
| `convex/notify.ts` | `engagement_afternoon` push text. |
| `convex/engagementScheduler.ts`, `convex/routines.ts` | Scheduler reaches all students; bounded reminder scan. |
| `convex/schema.ts` | `pushTokens.appVersion` (optional); new `pushRegistrationEvents` table. Both additive. |
| `convex/users.ts` | `pushRegistrationEvents` deleted with the account. |
| `convex/betaReport.ts`, `dashboard/src/pages/BetaReport.tsx` | "Phones registered for push" section: students with/without a phone, registrations, problems by reason. |
| `convex/screening.ts` | Tie-break in history sorting. |
| `eas.json` | `preview.environment = "preview"`. |
| `i18n/locales/en.json` | Profile phone-notification text. |
| Tests | New `convex/push_registration_lifecycle.test.ts` (11) and `common/pushRegistration.test.ts` (9). `convex/avatarNotification.test.ts` (3 tests updated: they asserted *no* image, which this task reverses). |

## C. Database verification

`pushTokens` (one row per user per device token; upserted by `pushTokens.registerPushToken`):
```
{ userId: "<users._id>", token: "ExponentPushToken[…]", platform: "android",
  deviceId?: string, appVersion?: "1.0.0", updatedAt: <ms of last registration> }
indexes: by_userId, by_token, by_userId_and_token
```

`pushRegistrationEvents`:
```
{ userId, stage: "permission"|"token"|"backend"|"registered"|"invalidated",
  status: "ok"|"denied"|"blocked"|"deferred"|"error", errorCode?, permission?, platform?, appVersion?, createdAt }
```

**Checking one student:**
1. **Which deployment?** The APK uses the `EXPO_PUBLIC_CONVEX_URL` it was built with. A local build reads `.env.local`, which may point to your **dev** deployment; an EAS preview build uses the EAS `preview` environment. Open that same deployment in the Convex dashboard.
2. **The student's row:** Data → `pushTokens`, filtered by `userId` = the student's `_id`. There should be one row with `platform: "android"`.
3. **If there's no row:** Data → `pushRegistrationEvents` for that `userId` says why. Typical values:
   - `token: error (Default FirebaseApp is not initialized)`: the APK lacks `google-services.json`;
   - `permission: denied`;
   - `backend: error (...)`.
4. **From the command line:** `npx convex run [--prod] pushNotifications:diagnosePush '{"userId":"<id>"}'`.

## D. Notification audit

The code defines no fixed list of 12. These are all the notifications a **student** can receive
by push. All are **server pushes** (none are local), and all need a `pushTokens` row.

**Scheduled (cron, Asia/Kolkata unless the student's preference says otherwise; quiet hours 22:00–07:00):**

| # | Type | Trigger and eligibility | Mechanism | Expected delivery | Skipped when |
|---|---|---|---|---|---|
| 1 | `engagement_morning` | Check-in invite; or an affirmation if already checked in | `engagementScheduler`, every 30 min | Once, 07:00–11:59 | Daily cap or 2.5 h spacing; opted out |
| 2 | `engagement_afternoon` | An incomplete MicroGoal exists | same | Once, 12:00–16:59 | No incomplete goal; cap/spacing. **Was never pushed (fixed)** |
| 3 | `engagement_evening` | Reflection prompt | same | Once, 17:00–20:59 | Emotion logged after 17:00; cap/spacing |
| 4 | `engagement_night` | Wind-down prompt | same | Once, 21:00–21:59 | Breathing/grounding in last 2 h; cap/spacing |
| 5 | `routine_morning` | Morning affirmation reminder | `routines.evaluateDailyRoutineReminders`, every 30 min | First run in the reminder hour (default 07:00) | Affirmation done; reminder off. Not gated by quiet hours |
| 6 | `routine_evening` | Evening gratitude reminder (**the one you received**) | same | First run in the hour of the evening time (default 20:30 → from 20:00) | Gratitude done; reminder off |
| 7 | `microgoal_reminder` | A MicroGoal still incomplete 60 min after creation | `routines.evaluateMicroGoalReminders`, every 15 min | Once per goal, 60–75 min after creation | Done/skipped; quiet hours; reminders off |

Rules shared by 1–7:
- **Duplicates:** prevented per window, per day or per goal (`dedupeKey`).
- **Cap and spacing:** at most 4 engagement-category notifications per local day, at least 2.5 h apart, and 5–7 count toward this. So a typical day delivers 2–4, not 7.

**Event-driven** (immediate, deduplicated per event):
- `appointment_proposed`, `appointment_confirmed`, `appointment_declined`, `appointment_reschedule_proposed`, `appointment_cancelled`, `appointment_reconfirm_needed`;
- `counsellor_assigned`, `counsellor_request_update`, `follow_up_created`, `follow_up_completed`.

In-app only by design: `appointment_requested`, `appointment_completed`, `appointment_transferred`, `counsellor_unassigned`.

**Why 11 didn't arrive after reinstall:** with no token, every push was recorded `no_tokens`. On top of that, 2b (afternoon never pushed), 2e (4 per day, 2.5 h apart) and each type's own conditions apply. Please confirm which 12 you expected so they can be mapped to this list.

## E. Avatar

| Element | Source | Status |
|---|---|---|
| Launcher icon | `assets/icon.png` / `adaptive-icon.png` | Unchanged |
| Status-bar small icon | `assets/notification-icon.png` (white heart silhouette on transparency, via the `expo-notifications` plugin → `@drawable/notification_icon`, set for both FCM and Expo) | Valid monochrome; unchanged |
| Expanded/large icon | Push `richContent.image`. Expo passes it to FCM, and `expo-notifications` 0.32 calls `setLargeIcon` | **Restored:** `<CONVEX_SITE_URL>/api/avatar/boy.jpg` or `girl.jpg` (384×384 JPEG served by `convex/http.ts`). `AVATAR_NOTIFICATION_BASE_URL` can override the host. |
| Local notification image | Not applicable: no local notifications | – |

Collapsed: the avatar appears as the round large icon on the right. Expanded: same. Xiaomi
HyperOS/MIUI may still show the app's launcher icon in the header; that is controlled by the
system, not the app.

## F. Testing results

| Test | Result |
|---|---|
| Full suite (`npx vitest run`) | **Passed** – 1,645/1,645 (105 files) |
| New lifecycle tests (registration upsert, account switch, logout, failure reports, invalidation, own status, self-test push, rate limits, afternoon push, scheduler reach, avatar rules, Beta report, diagnosePush) | **Passed** (code-verified, Expo stubbed) |
| Mutation checks: afternoon copy removed, scheduler back to 100, avatar removed, event not recorded, dialog hang restored, token redaction removed | **All 6 caught** |
| Type checks: app, Convex, dashboard | **Passed** (0 errors) |
| `expo export --platform android`, dashboard `vite build` | **Passed** |
| `expo prebuild --clean` | **Passed** – manifest has `POST_NOTIFICATIONS`; `notification_icon` drawables and meta-data present; `google-services.json` copied from root |
| A Fresh install, B Backend registration, C Push delivery, D Local notifications, E All notifications on a schedule, F Avatar appearance, G Reinstall and account switch | **Requires physical-device verification** (D: not applicable, no local notifications) |

## G. Deployment

1. **Backend** (additive schema): `npx convex deploy`.
2. **Production variables:** `npx convex env set --prod EXPO_PUSH_LIVE true`. Add `EXPO_ACCESS_TOKEN` only if Expo enhanced push security is on.
3. **Firebase:**
   - `google-services.json` for package `com.emotify_dev.emotify` goes in the **project root**;
   - the FCM V1 service-account key must be on EAS project `4f9d28f2…` (`eas credentials` → Android → FCM V1).
4. **EAS preview environment:** `EXPO_PUBLIC_CONVEX_URL` = the production deployment URL (`eas env:create --environment preview …`).
5. **APK (required; these are app code changes):** `eas build --profile preview --platform android`. Uninstall the old app, then install the new APK.
6. **On the phone:**
   - sign in as a student and allow notifications;
   - Profile → Phone notifications should show **On**;
   - tap **Send a test notification**. Within a minute, check the tray, the avatar, and that tapping opens the notification centre;
   - the row should then show "delivered to Google's push service".
7. **Backend checks:**
   - Data → `pushTokens` shows the row;
   - `npx convex run --prod pushNotifications:diagnosePush '{}'`;
   - dashboard → Beta report → "Phones registered for push".
8. **Lifecycle (Test G):**
   - log out: the row is removed;
   - log in as another student: the row moves to them;
   - reinstall: a new token is registered, and the old one is removed when Expo reports it, recorded as `invalidated`.

## H. Remaining issues (manual)

- **Device verification** of tests A–G above.
- **Which deployment the app uses** (C.1). This is the most likely reason the table looked empty while a push still arrived.
- **Daily limit (product decision).** Should routine and MicroGoal reminders count toward the 4-per-day cap and 2.5 h spacing? If they shouldn't, they could use their own category. This was left unchanged on purpose.
- **"12 notifications":** please name them, so each can be traced against section D.
- **Translations:** Hindi, Tamil and Telugu text for the new Profile row (falls back to English).
- **Status scope:** Profile counts devices for the whole account, not only this phone.
