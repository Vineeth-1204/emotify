# Emotify — Counsellor Workflow, Appointments & Notifications: Baseline Audit

Date: 2026-10-20. Branch: `claude/blissful-knuth-04nxs0`.

This audit records the state of the code **before** the milestone changes. The baseline is the integrated tree:
remote commit `e072c85` ("Implement Phases 1-5…") plus the uncommitted Phase-A remediation from the previous
session. The remediation was preserved by a backup patch and `git stash`, fast-forwarded and re-applied. There was
one import-line conflict in `convex/alerts.ts`, resolved by keeping both imports.

What changed afterwards is in `EMOTIFY_COUNSELOR_APPOINTMENT_NOTIFICATION_IMPLEMENTATION_REPORT.md`.

## 1. Baseline verification

| Check | Result at baseline |
|---|---|
| `npx vitest run` | 88 files / 1422 tests pass |
| Convex `tsc` | 0 errors |
| Dashboard `tsc` | 0 errors |
| App `tsc` after `npm ci` | **Fails.** Pre-existing in `e072c85`; see §1.1. |

### 1.1 App type-check errors

These errors appear once `npm ci` actually installs the dependency that `e072c85` added
(`expo-notifications ^0.32.17`):

- `utils/notifications.ts:12` — the `NotificationBehavior` object is missing `shouldShowList`. This is the
  SDK 54 / expo-notifications 0.32 API.
- `app/_layout.tsx:65,75` — `notification.request.content.data.route` is `unknown` and was passed as a `string`.

`EMOTIFY_PHASE_1_TO_5_IMPLEMENTATION_REPORT.md` states "App TypeScript 0 errors". That is not reproducible once the
package is installed.

### 1.2 Report-versus-code discrepancies found in the `e072c85` reports

| Claim in the report | Actual state |
|---|---|
| expo-notifications "~0.30.7" | `package.json` and the lockfile pin `^0.32.17`. That version matches SDK 54's bundled version, so it is compatible. |
| An `AndroidManifest.xml` was modified | No `android/` directory is committed. The permission comes from the `app.json` plugin and `android.permissions` (`POST_NOTIFICATIONS`). |
| Traceability rows PUSH-INFRA-001…004 "Fully implemented" | Registration could never run on a device, and dispatch had **no callers** (§3.3). |

## 2. Specification scope

The product specification (converted to text for this audit; not committed) has **no** requirements for:

- appointment capacity;
- a counsellor caseload limit;
- an in-app notification centre.

The "20" that appears in the specification is social-proof copy, not a caseload limit. The milestone request itself
is therefore the source of these requirements.

The specification's Phases 6–8 are the CBT overhaul, the MicroGoal engine and affirmation/gratitude pushes.
Phases 9–10 are not defined. None of them were started.

## 3. Findings by area

### 3.1 Assignment and caseload (`convex/counsellorAssignments.ts`, `convex/authz.ts`)

| Requirement | Baseline evidence | Gap |
|---|---|---|
| Admin organisation-wide view of students, counsellors and caseloads | `listCounsellorUsers`, the assignment roster, and the dashboard Assignments and Counsellors pages exist | Present |
| Assign / reassign | `assign`, `assignMany`, `unassign`, `unassignMany` exist. There is a single active row per student, audited, and counsellors are notified | Present |
| Default capacity 20, server-side and concurrency-safe | **No capacity limit anywhere.** `counsellors.maxWorkload` (directory field, UI default 15) is never enforced | **Missing** |
| Exceptions (unassigned students, unassigned appointments, failed assignments) | None | **Missing** |
| A counsellor sees only assigned students | `assertCanAccessStudent` checks the active caseload; `e072c85` added refusals for inactive counsellors | Present |
| Reassignment changes access immediately | Access is derived from the active assignment row on every call | Present for clinical data. **Appointments did not follow** (§3.2) |
| Student is told about assignment | No | **Missing** |

### 3.2 Appointments (`convex/appointments.ts`)

| Requirement | Baseline evidence | Gap |
|---|---|---|
| Appointment linked to its counsellor | The `appointments` table had `userId` only. There was no `counsellorId` | **Missing.** Any counsellor with access to the student could act; after reassignment the old counsellor's history was indistinguishable |
| Student requests go to the assigned counsellor only | Staff recipients came from `getStaffRecipientsForStudent`: admins plus the assigned counsellor, or **all counsellors** when unassigned | **Wrong** for unassigned students. Every counsellor received the request, and the full student name, instead of the admin queue |
| Lifecycle Requested → Confirmed / Rejected / Reschedule → Completed, plus Cancel | The statuses `pending`, `waiting`, `accepted`, `rejected`, `completed`, `scheduled`, `cancelled` existed. The receiver-accepts rule existed (`"Unauthorized: Receiver must accept/reject."`) | Partially present |
| Students cannot complete their own appointment | `updateAppointmentStatus("completed")` and `completeAppointment` **allowed students** to complete | **Defect** |
| Students cannot delete appointments | `deleteAppointment` **allowed a student to hard-delete** their own appointment, losing the record | **Defect** |
| Reschedule | `requestReschedule` **automatically rejected** the whole appointment when the new date was a different day. This is not in the specification | **Defect** |
| Duplicate and idempotency prevention | No request key. A retry created a second appointment | **Missing** |
| Conflict prevention | No check that a counsellor's slot was already confirmed | **Missing** |
| Date validation | Only a "same-day" check, used by the auto-reject. Impossible dates and past dates were accepted | **Missing** |
| Status history | None | **Missing** |
| Admin filters by student, counsellor, date and status | `listAllTwoWayAppointmentsPaginated` filtered scope **after** `paginate` (pages could come back short or empty) and had no counsellor or date filters | **Missing / defective** |
| Student view: assigned counsellor, status, upcoming and past | The appointments screen existed with tabs. It used "admin" wording and did not say who the request went to | Partial |
| Privacy of notification text | Staff notifications contained the student's **full name** | Weak; it could reach counsellors not assigned to the student |

### 3.3 OS push notifications

| Requirement | Baseline evidence | Gap |
|---|---|---|
| Package compatible with SDK 54 | `expo-notifications ^0.32.17`; the app.json plugin; `POST_NOTIFICATIONS`; EAS `projectId` present | Present |
| Foreground display | Handler used the pre-SDK-54 `shouldShowAlert` shape (type error, §1.1) | **Defect** |
| Token registration on device | `utils/notifications.ts` gated registration on **`Constants.isDevice`, which does not exist in expo-constants 18**. It is always `undefined`, so **no device ever registered** | **Defect (blocking)** |
| Permission explained before asking | The system prompt fired immediately at login with no explanation | **Missing** |
| Channels | `default` and `reminders` only | Partial |
| Server dispatch | `pushNotifications.sendPushNotification` existed (privacy regex, Expo API, mock unless `EXPO_PUSH_LIVE`) but had **no callers** | **Missing (no business-event triggers)** |
| Delivery records | None | **Missing** |
| Invalid-token handling | `DeviceNotRegistered` was pruned from tickets only; receipts were never checked | Partial |
| Logout and account switching | Logout did not remove the token. The same token for two users was not handled, so a shared device received pushes for the previous account | **Defect (privacy)** |
| Account deletion | `pushTokens` was not in `USER_OWNED_TABLES` | **Defect** |
| Tap, background and cold-start routing | `app/_layout.tsx` routed taps through the allowlist in `common/notificationRoutes.ts`, but without server re-authorisation | Partial |
| FCM / Firebase for Android standalone builds | No `google-services.json` and no `android.googleServicesFile` | **External blocker**, outside the code |

### 3.4 In-app notifications

| Requirement | Baseline evidence | Gap |
|---|---|---|
| Persistent records | `notifications {recipientId, type, title, message, priority, read, archived, createdAt}` with indexes `by_recipientId` and `by_read`. No `readAt`, destination or dedupe key | Partial |
| Mobile notification centre with badge, list, mark read and open | **None.** Student appointment notifications were written but never shown anywhere | **Missing** |
| Dashboard | `dashboard.getNotifications`, `markNotificationRead` and the Notifications page exist | Present (no unread count, no mark-all, no open action) |
| Deduplication | None. Writers inserted directly in six places | **Missing** |

## 4. Security risks found at baseline

| # | Risk | Severity | Status after milestone |
|---|---|---|---|
| S1 | Students could mark their own appointments completed (falsifying the session record) | High | Fixed (staff only; students record feedback) |
| S2 | Students could hard-delete appointments (loss of record) | Medium | Fixed (withdraw → `cancelled`; admin delete is audited) |
| S3 | Appointment requests from unassigned students went to **every** counsellor with the student's full name | Medium (privacy) | Fixed (admin queue; de-identified "Student {patientId}") |
| S4 | A previous counsellor kept the student's open appointment requests after reassignment | Medium | Fixed (appointments move; the old counsellor is refused on `counsellorId`) |
| S5 | Shared device: the push token stayed bound to the previous account, so the new user would see another person's notifications | Medium (privacy) | Fixed (re-registration moves the token; logout removes it) |
| S6 | Push tokens survived account deletion | Low | Fixed (`USER_OWNED_TABLES`) |
| S7 | Notification tap routed without re-checking access | Low | Fixed (`openNotification` re-authorises) |
| S8 | No caseload limit, so overload went unnoticed | Operational | Fixed (capacity 20, enforced and audited) |
| S9 | Paginate-then-filter in the admin appointment list | Low (correctness) | Improved. The primary filter (student, counsellor or status) now selects the index, and a counsellor's list is read from `by_counsellorId`. Secondary filters (date, upcoming/past, needs-counsellor) still apply after the page is read, so a page can be shorter than requested; "Load more" continues. This is documented as a limitation. |

The earlier remediation (Phase A and B1, in the same uncommitted work) is documented in the implementation report,
§10.

## 5. Pre-existing failures and their disposition

| Item | Disposition |
|---|---|
| App `tsc` errors (§1.1) | Fixed by the SDK 54 handler and route typing |
| `Constants.isDevice` registration gate | Removed. Registration now relies on the permission and token APIs |
| No push callers | Fixed: single writer `createNotification` → `deliverNotification` |
| 22 existing tests failed after the lifecycle change | Mostly fixtures with past appointment dates, now with pinned clocks. Three deliberate behaviour changes have their tests updated and documented (implementation report, §8.3). **No test was deleted or weakened.** |
| A duplicate `createAlert` symbol (internal and public legacy shim) | The internal function was renamed `createIndependentAlert` |
| Emergency-contact dispatch (`convex/emergencyDispatch.ts`, Twilio, from `e072c85`) | Not touched. Outside this milestone. No real contact details are used in any fixture |
