# Emotify — Counsellor Workflow, Appointment System & Notifications: Implementation Report

Date: 2026-10-20. Branch: `claude/blissful-knuth-04nxs0`.

Related documents:

- Baseline and findings: `EMOTIFY_COUNSELOR_APPOINTMENT_NOTIFICATION_AUDIT.md`.
- Every notification event: `EMOTIFY_NOTIFICATION_EVENT_MATRIX.md`.
- Requirement status: `EMOTIFY_REQUIREMENTS_TRACEABILITY.csv`, category 19 and the updated PUSH-INFRA rows.

**Verification boundary.** Everything below marked *verified* was verified locally with convex-test, type checks and
production builds. **Real push delivery to a device has not been verified.** No device, Firebase project, live Expo
push call or browser session was available. Passing unit tests do not show that a notification appears on a phone.
§11 is the manual checklist that does.

Nothing was deployed. No environment variables were changed. Phases 6–10 were not started.

---

## 1. Features delivered

### Admin (dashboard)

- **Organisation-wide caseloads.** `listCounsellorUsers` returns `caseloadSize`, `capacity` (20) and
  `capacityState` (`available`, `near` at 18 or more, `full` at 20). The Assignments page shows "n / 20" with
  *Near capacity* and *Full* badges. Full counsellors are disabled in the assignment select.
- **Capacity of 20 active students per counsellor, enforced on the server** in every assignment path: `assign`,
  `assignMany`, and reassignment. There is no override. The milestone allows an explicit, audited override that is
  disabled by default, but none was built, so the limit cannot be bypassed.
- **Exceptions panel** (`getAdminExceptions`, admin only), showing:
  - unassigned students;
  - students whose counsellor is inactive;
  - counsellors at or near capacity;
  - open appointments without a counsellor;
  - recent assignment failures (audit `caseload_assign_failed`);
  - safety alerts with no active recipient (audit `alert_delivery_failure`).
- **Appointments across the organisation** (`listAppointments`), filterable by counsellor, student, date, status,
  upcoming/past and "needs a counsellor". The table shows Student, Counsellor (with an inactive marker), Status label
  and Actions.

### Counsellor

- **Scope.** A counsellor sees only students currently assigned to them. A counsellor's appointment list is read
  from `by_counsellorId` and also filtered by the live caseload scope.
- **Actions** on appointment requests: Accept, Decline (reason required), Propose new time, Cancel and Mark
  completed. Buttons are driven by the server's `actions` array, and the server enforces the same rules.
- **Notifications** for new requests, student replies, transfers on reassignment, support requests and safety
  alerts. These appear in-app (dashboard bell and page) and as OS push when the counsellor uses the mobile app.
- **Reassignment removes access immediately.** Access is computed from the active assignment on every call, and
  appointments carry `counsellorId`, so the previous counsellor is refused ("This appointment is with another
  counsellor.").

### Student (mobile)

- **Who they are asking.** The Appointments screen says "Your request will go to {counsellor}". With no counsellor
  assigned, it shows supportive care-team text: the request goes to the care team, who will connect them with a
  counsellor.
- **Requests go only to the assigned counsellor.** The server derives `counsellorId`; the client cannot choose. With
  no assignment, the request goes to the admin queue and no counsellor is notified.
- **Appointment management.**
  - Students can view status in plain language: Requested, Your counsellor suggested a time, New time proposed,
    Confirmed, Declined, Cancelled, Completed.
  - They can withdraw a pending request, ask for a different time, and cancel a confirmed appointment.
  - Tabs: Upcoming, Requested, Confirmed, Past, Cancelled.
- **What students cannot do.** They cannot confirm their own request, complete an appointment, choose another
  counsellor, or read other students' data. Every one of these is enforced on the server and tested.
- **Notification centre** with an unread badge (bell in the Home header). Details are in §6.

---

## 2. Architecture and data flow

```
business mutation (appointments / counsellorAssignments / counsellorRequests / alerts)
  │  resolves recipients for the event (authorized by construction)
  ▼
notify.createNotification(ctx, {recipientId, type, title, message, destination, relatedId, dedupeKey})
  │  1. dedupe: (recipientId, dedupeKey) on by_recipient_and_dedupe → existing id, nothing else happens
  │  2. insert in-app row (record of truth), pushStatus "queued" if PUSH_COPY[type] != null
  │  3. ctx.scheduler.runAfter(0, internal.pushNotifications.deliverNotification, {notificationId})
  ▼   (same transaction as the business write: if it rolls back, no notification and no push)
pushNotifications.deliverNotification (internalAction, runs once: only while pushStatus == "queued")
  │  recipient active? tokens? → neutral PUSH_COPY[type] + data {notificationId, destination, route}
  │  sendToExpo (mock unless EXPO_PUSH_LIVE) → prune DeviceNotRegistered → recordDelivery
  │  + checkReceipts after 15 min (prunes DeviceNotRegistered from receipts)
  ▼
Device: tray / lock screen / heads-up via Android channel (appointments | important | default)
  │  tap (foreground, background or cold start) → hooks/usePushNotifications
  ▼
notificationCenter.openNotification(notificationId) → marks read, RE-AUTHORIZES the caller for the
destination and relatedId → {destination} → MOBILE_DESTINATION_ROUTES / DASHBOARD_DESTINATION_ROUTES
```

Key decisions:

- **One writer.** Every event in the milestone goes through `createNotification`. Deduplication, push scheduling and
  privacy-safe copy therefore cannot be skipped by an individual feature. The only exception is the existing
  follow-up writers in `followUps.ts`; see the matrix.
- **Push copy is separate from in-app text.** The lock screen shows one of a few fixed sentences chosen by type
  (`PUSH_COPY`). The in-app title and message, which may contain a date or a de-identified "Student 101", are never
  sent to Expo. `validatePrivacySafePushContent` runs again before sending, as defence in depth.
- **The payload carries no data.** It has only `notificationId`, a `destination` key, and a `route` taken from the
  mobile allowlist (kept for older app builds).
- **Authorization at open time.** A notification is a pointer, not a grant. Opening it re-checks access, so a
  counsellor who was reassigned away lands on the notification centre, not on the student's appointment.

---

## 3. Files

### New

| File | Purpose |
|---|---|
| `convex/notify.ts` | `createNotification`, `notifyEach`, `PUSH_COPY`, `activeAdminIds`, `studentLabelFor` |
| `convex/notificationCenter.ts` | `listMine`, `unreadCount`, `markRead`, `markAllRead`, `openNotification` |
| `common/appointmentStatus.ts` | Shared lifecycle rules: `allowedActions`, `awaitingResponseFrom`, labels, date and time validation, slot key |
| `common/notificationCentre.ts` | `relativeTime`, `notificationIcon`, `badgeLabel` |
| `common/legacyClientCompat.ts` | Earlier remediation (§10) |
| `hooks/usePushNotifications.ts` | Permission explanation, token registration, tap and cold-start handling |
| `app/(auth)/notifications.tsx` | Mobile notification centre |
| Tests | `convex/appointment_workflow.test.ts` (18), `convex/caseload_capacity.test.ts` (7), `convex/notification_system.test.ts` (17), `common/appointmentStatus.test.ts` (10), plus `convex/legacy_client_compat.test.ts` and `convex/p0_authorization.test.ts` from §10 |

### Changed (main ones)

| File | What changed |
|---|---|
| `convex/schema.ts` | §4 |
| `convex/appointments.ts` | Lifecycle, counsellor link, idempotency, conflicts, history, `listAppointments`, `listMyAppointments`, reassignment move, backfill |
| `convex/counsellorAssignments.ts` | Capacity, exceptions, student notifications, appointment move on (un)assign |
| `convex/pushNotifications.ts` | `deliverNotification`, `recordDelivery`, `checkReceipts`, live/mock switch |
| `convex/pushTokens.ts` | Token moves to the last account that signs in; own rate-limit bucket |
| `convex/users.ts` | `pushTokens` added to `USER_OWNED_TABLES` (account deletion) |
| `convex/alerts.ts` | Safety-alert staff notifications through `createNotification` (recipients unchanged) |
| `convex/counsellorRequests.ts` | De-identified staff copy, `notifyEach`, repeated urgent request re-alert (hourly) |
| `common/notificationRoutes.ts` | Destinations and the mobile and dashboard route maps |
| `utils/notifications.ts` | SDK 54 handler, four channels, permission helpers, removal of the broken device check |
| `utils/auth.tsx` | Logout removes the device token before the session is cleared |
| `app/_layout.tsx` | Uses `usePushNotifications()` |
| `app/(auth)/(tabs)/index.tsx` | Notification bell with unread badge |
| `app/(auth)/tools/appointments.tsx` | Student workflow and wording (§1) |
| `app/(auth)/(tabs)/_layout.tsx` | Emergency outcome copy for a repeated request ("Care Team Told Again") |
| `dashboard/src/pages/Sessions.tsx`, `Assignments.tsx`, `Notifications.tsx` | Admin and counsellor UI (§1) |
| `i18n/locales/en.json` | `notifications.permission.*`, `notifications.centre.*` |
| `convex/_generated/api.d.ts` | `notificationCenter` and `notify` registered (edited by hand; codegen needs a deployment) |

---

## 4. Schema changes

All changes are additive and optional. No table, field or data was removed.

| Table | Added fields | Added indexes |
|---|---|---|
| `appointments` | `counsellorId?`, `requestKey?`, `slotKey?`, `statusHistory?` (array of `{status, at, actorRole, event?}`, last 50 kept), `updatedAt?` | `by_counsellorId`, `by_counsellor_and_slot`, `by_userId_and_requestKey`, `by_status` |
| `notifications` | `readAt?`, `destination?`, `relatedId?`, `dedupeKey?`, `pushStatus?`, `pushTicketIds?`, `pushError?`, `pushUpdatedAt?` | `by_recipient_and_created`, `by_recipient_and_read`, `by_recipient_and_dedupe` |

**Backfill for existing appointments.** The repository owner runs this once after deploying:

```
npx convex run appointments:backfillCounsellorIds '{}'
```

It sets `counsellorId` from each student's current assignment, and is paginated and idempotent. Until it runs:

- older appointments have no `counsellorId`;
- they remain visible to admins;
- the counsellor list shows only appointments that carry `counsellorId`;
- `actorFor` still allows any counsellor with caseload access to act on a link-less appointment, which matches the
  old behaviour.

---

## 5. Appointment lifecycle

Stored status values are unchanged, so old records stay valid.

| Stored | Student label | Staff label |
|---|---|---|
| `pending` (`createdBy` user) | Requested | New request |
| `pending` (`createdBy` admin) | Your counsellor suggested a time | Awaiting student |
| `waiting` | New time proposed / Waiting for a reply | Same, from the other side |
| `accepted`, `scheduled` | Confirmed | Confirmed |
| `rejected` | Declined | Declined |
| `cancelled` | Cancelled | Cancelled |
| `completed` | Completed | Completed |

### Rules (`common/appointmentStatus.ts`, enforced on the server via `requireAction`)

- **The receiver answers.** The party who did not make the latest proposal accepts or declines. Nobody confirms
  their own proposal.
- **Either party may propose a new time** on an open appointment. The earlier behaviour that automatically rejected
  the appointment when a different day was proposed has been removed.
- **Accepting a proposed new time** applies it, after a conflict check.
- **Completion.** Only staff complete. A student's call to `completeAppointment` records attendance, rating and
  feedback only, without changing status, and notifies staff.
- **Terminal states** (`completed`, `cancelled`, `rejected`) cannot change. Re-sending the current status succeeds
  without effect, which makes it idempotent.
- **Withdraw and delete.** A student's withdraw or "delete" sets the appointment to `cancelled` and keeps the
  record. An admin's hard delete is audited (`appointment_deleted`).

### Request validation

- **Idempotency key.** `requestKey` matches `^[A-Za-z0-9_-]{8,128}$`. The app generates it with
  `Crypto.randomUUID()` for each submission. Replaying a key returns the original appointment.
- **Duplicates.** The same student, slot and an open request returns the existing appointment.
- **Open-request limit.** At most 3 open requests per student ("You already have 3 requests waiting for a reply…").
- **Conflict.** A slot already confirmed for the same counsellor is refused ("That time is not available. Please
  choose another time."). It is checked again when an appointment is accepted.
- **Date and time.** Must be a real calendar date and `hh:mm AM/PM`, no earlier than yesterday (UTC), and no more
  than 180 days ahead.

### Reassignment policy

- **When a student is reassigned**, every open appointment moves to the new counsellor and resets to Requested
  (`pending`, `createdBy` user). A time confirmed by the previous counsellor does not bind the new one.
  - The new counsellor is notified ("transferred to you").
  - The student is told: "needs to be reconfirmed" if it was confirmed, otherwise "passed to your new counsellor".
- **When a student is unassigned**, `counsellorId` is cleared on open appointments and every active admin is
  notified ("needs a counsellor"). The student receives a supportive in-app note.
- **History.** Closed appointments keep the counsellor who held them. A `statusHistory` entry
  (`actorRole: "system"`) records each move.

---

## 6. In-app notification centre

### Mobile (`app/(auth)/notifications.tsx`)

| Behaviour | How it works |
|---|---|
| Entry point | A bell in the Home header with an unread badge (`unreadCount`, shows "99+" above 99) |
| List | `listMine`: paginated, newest first, own notifications only (identity from the session). Each row shows an icon by type, title, message, relative time and an unread dot. "Load more" is used for pagination. |
| Mark read | Opening a row marks it read. "Mark all as read" calls `markAllRead`, which works in batches of 200 and repeats while `remaining` is true. |
| Open | `openNotification`, which re-authorises, then routes via `MOBILE_DESTINATION_ROUTES`. Staff-only destinations open the centre. |
| States | Loading spinner, empty state, and an error boundary with a retry button |
| OS dismissal | Swiping an OS notification away never removes the in-app row |

### Dashboard (`dashboard/src/pages/Notifications.tsx`)

The existing page gains an unread count, "Mark all as read", and "Open". Open goes through `openNotification` and
then `DASHBOARD_DESTINATION_ROUTES`.

### Isolation

Every function resolves the caller from the session. Another user's notification id returns "Notification not
found." for both read and open, the same error as a missing id, so it cannot be used to discover which ids exist.

---

## 7. OS push flow

### Mobile

**Permission.**

- After sign-in, if permission is undetermined, the app explains why it wants notifications. The explanation
  mentions that lock-screen text is neutral. Only then is the system prompt shown.
- It is asked once (SecureStore `push_permission_explained`) and never nags. Android 13+ uses
  `POST_NOTIFICATIONS`, which is already in `app.json`.

**Channels** (created before any token is requested):

| Channel | Importance |
|---|---|
| `default` | DEFAULT |
| `appointments` | HIGH |
| `important` | MAX |
| `reminders` | HIGH (existing) |

All channels use `lockscreenVisibility: PRIVATE`.

**Foreground.** The handler shows the banner and adds the notification to the list, with sound. The app-icon badge
is off; the in-app bell is the badge.

**Token.**

- `getExpoPushTokenAsync` with the EAS `projectId`, then `registerPushToken` once Convex auth is ready.
- It is re-sent on every launch, so refreshed tokens and account switches take effect.
- The token is remembered in SecureStore for logout.

**Logout.** `removePushToken` runs before the session is cleared, then the stored token is forgotten. If removal
fails, for example offline, the next sign-in on that device moves the token anyway (see Server below).

**Tap handling.**

- `addNotificationResponseReceivedListener` handles taps while the app is running (foreground or background).
- `getLastNotificationResponseAsync` handles cold start.
- Each response is handled once (an in-memory set plus SecureStore `push_last_handled_response`).
- The hook calls `openNotification`. On refusal, for example a notification for another account on a shared phone,
  it opens the centre.

### Server

**Token registration.** Registering a token removes it from any other account. The device belongs to the last
account that signed in, so a shared phone never receives the previous user's notifications. Registration has its own
rate-limit bucket. Tokens are deleted with the account.

**Dispatch.** `deliverNotification` runs at most once per notification. It does not send in these cases:

- the account is inactive (`skipped` / `recipient_inactive`);
- there are no tokens (`no_tokens`);
- the copy fails the privacy check (`skipped`).

**Channels and priority.** `channelId` comes from the type, as in the matrix. Priority is `high` for appointments
and important, and `default` otherwise.

**Invalid tokens.** `DeviceNotRegistered` tokens are removed, both from tickets immediately and from receipts after
15 minutes.

**Live sending is off by default:**

- `EXPO_PUSH_LIVE` unset → `mock` (the payload is built and validated, nothing is sent).
- `EXPO_PUSH_LIVE=true` or `1` → real Expo Push API calls.
- `EXPO_ACCESS_TOKEN` is optional; add it if Expo enhanced push security is enabled.
- Under `NODE_ENV=test` the action goes live only with the stub value `stubbed-fetch`, so tests can never call the
  real API.

Neither variable was set or changed on any deployment.

### Business-event triggers

Business-event triggers now exist for every event in the matrix. Safety alerts and support requests from unassigned
students go to every active counsellor and every active admin. Inactive accounts are excluded.

---

## 8. Security decisions

1. **Identity comes from the session, never from arguments.** This applies to the notification centre, appointment
   creation (role comes from the caller; `createdBy` is checked against the role), and token registration.
2. **The server derives the counsellor** for a request. `createAppointmentRequest` has no counsellor argument: it
   uses the caller if they are a counsellor, otherwise the student's active assignment.
3. **Appointment actor check** (`actorFor`):
   - staff need `assertCanAccessStudent`;
   - a counsellor must also match a set `counsellorId`;
   - students may act only on their own appointment;
   - every action is checked against `allowedActions` for that actor.
4. **Capacity is checked in the same transaction as the insert**, by reading the counsellor's active-assignment
   index range. Convex OCC aborts and retries the second of two concurrent assignments, so the count can never
   exceed 20. This is tested with two admins in parallel.
5. **De-identified staff copy** ("Student {patientId}") wherever a notification may reach a counsellor who is not
   the student's: safety alerts, support requests, and the admin queue.
6. **Lock-screen privacy.** Fixed neutral push copy, PRIVATE channel visibility, and a payload of ids and keys only.
7. **Re-authorisation when a notification is opened**, and an identical error for not-found and not-yours.
8. **No authorization was weakened to simplify the UI.** The dashboard and app show exactly the actions the server
   returns.

### 8.1 Deliberate behaviour changes

Each of these is covered by updated tests.

| Change | Previous test expectation | Why |
|---|---|---|
| Staff notification text for support requests is de-identified ("Student STU-P12-S3-A requested counselor support.") | Full name in the message (P12-3 REQUEST-FLOW-06) | Privacy (audit S3) |
| Student support-request updates use type `counsellor_request_update` | Type `counsellor_request` (REQUEST-FLOW-07) | Separate push copy and destination |
| Staff-created confirmed appointment notifies with type `appointment_confirmed`, title "Appointment confirmed" | Old type and title (P12-4 NOTIF-01) | Single event vocabulary |

### 8.2 Tests updated without changing their intent

- **Clock pinned.** Several suites (`p12_step2`, `p12_step4`, `p14_step4`) used fixed appointment dates in 2026 that
  are now in the past. They pin the clock with
  `vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime("2026-10-05T09:00:00Z")`.
- **Reassignment provenance test** (`counsellor_assignments.test.ts`) now asserts:
  - clinical tables are unchanged;
  - appointment provenance fields (`attemptId`, `triageId`, `counsellorRequestId`) are unchanged.

  Appointments are now intentionally moved to the new counsellor.
- **Renamed internal function.** `alerts.createAlert` became `createIndependentAlert` in three tests and the
  internal-functions list. The public `createAlert` is a no-op legacy shim (§10).

**No test was deleted, skipped or weakened.**

---

## 9. Test and build results (local, 2026-10-20)

| Check | Result |
|---|---|
| `npx vitest run` | **92 files, 1474 tests, all passing** (baseline 88 / 1422) |
| Convex `npx tsc -p convex` | 0 errors |
| App `npx tsc --noEmit` | 0 errors (was failing at baseline) |
| Dashboard `npx tsc --noEmit` | 0 errors |
| Dashboard `npx vite build` (with a placeholder `VITE_CONVEX_URL`) | Succeeds; the bundle contains the new pages and calls |
| `npx expo export --platform android` | Succeeds (5.82 MB Hermes bundle); the bundle contains `usePushNotifications`, the notification centre and the channel ids |

### Mutation checks

Each check introduced a defect by hand and confirmed that a test failed. All 13 were killed (caught):

| # | Defect introduced |
|---|---|
| M1 | Capacity off by one |
| M2 | Dedupe disabled |
| M3 | Push copy taken from the in-app message |
| M4 | Extra payload data |
| M5 | Open without re-authorisation |
| M6 | Token not moved between accounts |
| M7 | Student allowed to complete |
| M8 | Counsellor taken from client arguments |
| M9 | Appointments not moved on reassignment |
| M10 | `listMine` without a recipient filter |
| M11 | Push sent to inactive accounts |
| M12 | Duplicate-slot check removed |
| M13 | Slot conflict check removed |

Every mutant was reverted; the tree matches the tested code.

### Not verified (requires §11)

- Delivery to a real device.
- The live Expo Push API and receipts.
- FCM.
- iOS.
- Dashboard UI in a browser.
- Any deployed environment.

---

## 10. Earlier remediation included in this change set

The previous request ("Critical Security and Compatibility Remediation") was interrupted before its work was
committed. Phases A and B1 were completed then and are committed together with this milestone, because they share
files.

**Phase A — compatibility and security**

- **A1. Legacy-client compatibility.** `legacySelfStudent` and `common/legacyClientCompat.ts`. Older app builds
  reading `triage.getLatest` and follow-up lists receive reduced, non-clinical values instead of errors.
- **A2. Appointment authorization** for legacy endpoints. Student rows are projected without internal links.
- **A3. Role-less users.** A missing or empty role is treated as a student (`isStudentRole`), so these users are no
  longer locked out or misclassified.
- **A4. Signing-key guard.** The JWT signing key committed to git history (`kid static-key-1`, identified by kid and
  public-modulus prefix) is refused at load time.
- **Alert shim.** The public `alerts.createAlert` is a no-op legacy shim. The internal alert creator is
  `createIndependentAlert`.

**Phase B1 — staff-only clinical reads**

`dashboard.getPatientCbtAnalytics` and `followUps.getPending` require counsellor or admin.

Tests: `convex/legacy_client_compat.test.ts`, `convex/p0_authorization.test.ts`, and the revoked-key cases in
`convex/deployment_verification.test.ts`.

Phases B2–B9 of that request were superseded by this milestone and were not carried out here, except where this
milestone covers the same ground: zero-recipient alerts are visible in the Exceptions panel, and repeated emergency
requests re-alert staff.

---

## 11. Limitations and blockers

1. **FCM is not configured (external blocker for Android standalone builds).** The repository has no
   `google-services.json` and no `android.googleServicesFile`, and the EAS project has no FCM v1 service-account key.
   `getExpoPushTokenAsync` fails on an Android release or development build until the owner:
   - creates a Firebase project;
   - adds `google-services.json` and points `app.json` `android.googleServicesFile` at it;
   - uploads the FCM v1 key with `eas credentials`.

   Expo Go on Android (SDK 53+) does not support remote push. A development build is required.
2. **Live sending is off.** Production stays in mock mode until the owner sets `EXPO_PUSH_LIVE=true` (and
   `EXPO_ACCESS_TOKEN` if enhanced security is enabled) on the deployment.
3. **Backfill.** Existing appointments need `appointments:backfillCounsellorIds` (§4).
4. **Timezone.** The server does not know the student's timezone, so "in the past" allows one day of slack.
5. **Admin list pages.** Secondary filters (date, upcoming/past, needs-counsellor) apply after the page is read, so
   a page can be shorter than requested; "Load more" continues.
6. **Notifications stored under a legacy key.** Rows stored under a legacy `clerkId` are counted and marked by
   `unreadCount` and `markAllRead`, but `listMine` lists only canonical-id rows. All new rows use the canonical id.
7. **Older installed app builds** have the broken `Constants.isDevice` gate and will not register tokens until
   updated.
8. **Follow-up notifications** (`followUps.ts`) still insert directly. They are in-app only, have no destination and
   no dedupe, and are out of scope. They are listed in the matrix.
9. **iOS** push requires an APNs key in EAS credentials; this was not checked.
10. **Capacity override.** There is none. The limit can only be relieved by reassigning or unassigning.

---

## 12. Manual Android verification checklist

**Prerequisites.**

- Complete limitation 1 (Firebase and FCM v1).
- Build a development build: `eas build --profile development --platform android`.
- Use a **test** Convex deployment with `EXPO_PUSH_LIVE=true`.
- Use test accounts only: one admin, two counsellors and two students. No real student data and no real emergency
  contacts.

**Steps.**

1. **Permission.** Sign in as Student 1. The explanation dialog appears before the system prompt. Choose "Not now",
   relaunch: no prompt again. Clear app data, sign in, choose "Allow": the system prompt appears and is granted.
2. **Token.** In the Convex dashboard, `pushTokens` has one row for Student 1.
3. **Foreground.** Assign Student 1 to Counsellor A (admin dashboard). With the app open, a heads-up banner says
   "You have an update from Emotify." The bell badge increments.
4. **Background.** Press Home. Counsellor A proposes a time. A tray notification appears with "You have a new
   appointment request." Tapping it opens Appointments, and the notification is read in the centre.
5. **Locked.** Lock the phone. Counsellor A confirms. The lock screen shows only "Emotify — Your appointment status
   has changed." There is no name, date or clinical word.
6. **Cold start.** Force-stop the app and trigger another event. Tapping the notification launches the app straight
   to the destination, once. Relaunching does not navigate again.
7. **Channels.** In Android Settings → Apps → Emotify → Notifications, the channels General updates, Appointments,
   Important updates and Daily check-ins exist. "Important updates" pops up and makes sound.
8. **Safety path (test data only).** Unassign Student 2. As Student 2, trigger a test support request. Every active
   counsellor and admin device receives "You have a new support request." Repeat within the hour: no second push.
9. **Reassignment.** Move Student 1 to Counsellor B. On Counsellor A's account, tap the older appointment
   notification: it opens the notification centre, not the appointment. Counsellor B receives "transferred to you".
10. **Logout and switch.** Log out Student 1. The `pushTokens` row is gone. Sign in as Student 2 on the same phone
    and trigger a Student 1 event: nothing arrives on this phone.
11. **Invalid token.** Uninstall the app, trigger an event, and wait 15 minutes or more. The token is removed. The
    `notifications` row shows `pushStatus`, and `pushError` holds `DeviceNotRegistered` or a receipt error.
12. **Centre.** The list paginates past 20 items. "Mark all as read" clears the badge. Offline, the error state
    shows a retry button.
13. **Dashboard.** As admin, the Assignments page shows "n / 20", Near capacity at 18 and Full at 20. A full
    counsellor cannot be selected. The Exceptions panel lists unassigned students and open appointments without a
    counsellor. Sessions filters by counsellor, date and status.

Record the device model, Android version and build id with the results.
