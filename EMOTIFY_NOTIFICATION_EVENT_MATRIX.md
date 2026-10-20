# Emotify — Notification Event Matrix

Branch `claude/blissful-knuth-04nxs0`, 2026-10-20. Companion to
`EMOTIFY_COUNSELOR_APPOINTMENT_NOTIFICATION_IMPLEMENTATION_REPORT.md`.

## How every row below is delivered

1. A business mutation resolves the recipients (the rule is in the "Recipient-resolution rule" column) and calls
   `createNotification` / `notifyEach` in `convex/notify.ts`, inside its own transaction.
2. `createNotification` looks up `(recipientId, dedupeKey)` on the `by_recipient_and_dedupe` index. If a row exists,
   nothing is written or pushed.
3. Otherwise it inserts the in-app row (the record of truth). It then schedules
   `pushNotifications.deliverNotification` only when `PUSH_COPY[type]` is non-null. The row starts with
   `pushStatus: "queued"`.
4. `deliverNotification` sends the **fixed per-type copy** from `PUSH_COPY`, never the in-app title or message. The
   payload `data` is only `{ notificationId, destination, route }`, and the route comes from the mobile allowlist.
   The delivery outcome is recorded on the row (`pushStatus`, `pushTicketIds`, `pushError`), and receipts are checked
   15 minutes later.
5. Opening a notification, whether by tapping the OS notification or from the in-app centre, calls
   `notificationCenter.openNotification`. That re-checks the caller's access **at open time** and falls back to the
   notification centre if access has been lost.

**Lock-screen copy** is one of five fixed strings, all titled "Emotify":

- "Your appointment status has changed."
- "You have a new appointment request."
- "An appointment has been updated."
- "You have an update from Emotify."
- "You have a new support request." / "Please open Emotify to view an important update."

**Android channels** are `appointments`, `important` (MAX importance) and `default`. Every channel uses lock-screen
visibility PRIVATE.

"Push = No" means in-app only. The reason is given in the row.

**Test coverage key**

| Key | Test file |
|---|---|
| AW | `convex/appointment_workflow.test.ts` |
| NS | `convex/notification_system.test.ts` |
| CC | `convex/caseload_capacity.test.ts` |
| P12-3 | `convex/p12_step3_counsellor_request_flow.test.ts` |
| P12-4 | `convex/p12_step4_appointment_lifecycle.test.ts` |
| AS | `common/appointmentStatus.test.ts` |

In the dedup strategy column, `n` is the appointment's status-history length + 1.

## Appointments

All appointment events are raised in `convex/appointments.ts`, through `notifyAppointmentEvent` or
`moveOpenAppointmentsOnAssignmentChange`. Every row carries `relatedId` set to the appointment id.

**The appointment's staff** (used in several rows below) means the appointment's `counsellorId`, if that counsellor
is active. If there is none, it means the active admins (`staffRecipientsFor`).

| Event | Trigger location | Recipient role | Recipient-resolution rule | In-app? | Push? | Lock-screen-safe content | Destination | Dedup strategy | Authorization rule | Test coverage |
|---|---|---|---|---|---|---|---|---|---|---|
| Student requests an appointment (`appointment_requested`) | `createAppointmentRequest` → `notifyAppointmentEvent("requested")` | Student | The requesting student only | Yes | No (the student just did this in the app) | n/a | appointments | `appt:{id}:requested:{n}:student` | Caller must be the student; `counsellorId` is derived on the server from the active assignment | AW "the server derives the counsellor" |
| Request received (`appointment_request_received`) | Same | Counsellor | The student's **currently assigned** active counsellor (derived on the server, never chosen by the client) | Yes | Yes | "You have a new appointment request." (appointments) | appointments | `appt:{id}:requested:{n}:staff` | Recipient is the assigned counsellor; opening re-checks `assertCanAccessStudent` and `counsellorId` | AW, NS "in-app record is written first" |
| Request with no assigned counsellor (`appointment_needs_counsellor`) | Same (when the student has no active assignment) | Admin | All active admins (`activeAdminIds`); **no counsellor is notified** | Yes | Yes | "An appointment request needs a counsellor." (appointments) | appointments | `appt:{id}:requested:{n}:admin` | Admins have organisation-wide access | AW "unassigned student: the request goes to the admin queue" |
| Counsellor or admin proposes an appointment (`appointment_proposed`) | `createAppointmentRequest` by staff → `"proposed"` | Student | The appointment's student | Yes | Yes | "You have a new appointment request." (appointments) | appointments | `appt:{id}:proposed:{n}:student` | Staff caller must pass `assertCanAccessStudent` | AW |
| Confirmed by staff (`appointment_confirmed`) | `updateAppointmentStatus` accept / legacy `createAppointment` | Student | The appointment's student | Yes | Yes | "Your appointment status has changed." (appointments) | appointments | `appt:{id}:confirmed:{n}:student` (legacy create: `appt:{id}:created`) | Only the receiving party may accept (`allowedActions`); counsellor must own `counsellorId` | AW "counsellor confirms; the student is notified", P12-4 NOTIF-01, NS live path |
| Confirmed by student (`appointment_updated`) | `updateAppointmentStatus` accept (staff proposal) | Counsellor / Admin | The appointment's staff | Yes | Yes | "An appointment has been updated." (appointments) | appointments | `appt:{id}:confirmed:{n}:staff` | Student may accept only a staff proposal addressed to them | AW "new time proposed by the counsellor is accepted" |
| Declined by staff (`appointment_declined`) | `updateAppointmentStatus` reject (reason required) | Student | The appointment's student | Yes | Yes | "Your appointment status has changed." | appointments | `appt:{id}:declined:{n}:student` | Receiver only; reason required | AW "declining needs a reason" |
| Declined by student (`appointment_updated`) | Same | Counsellor / Admin | The appointment's staff | Yes | Yes | "An appointment has been updated." | appointments | `appt:{id}:declined:{n}:staff` | Receiver only | AW |
| New time proposed by staff (`appointment_reschedule_proposed`) | `requestReschedule` (`propose_time`) | Student | The appointment's student | Yes | Yes | "Your appointment status has changed." | appointments | `appt:{id}:reschedule_proposed:{n}:student` | Either party on an open appointment; date validated | AW "new time proposed…", "different-day reschedule" |
| New time proposed by student (`appointment_updated`) | Same | Counsellor / Admin | The appointment's staff | Yes | Yes | "An appointment has been updated." | appointments | `appt:{id}:reschedule_proposed:{n}:staff` | Student: own appointment only | AW |
| Cancelled / withdrawn by staff (`appointment_cancelled`) | `cancelAppointment` / `updateAppointmentStatus` cancel | Student | The appointment's student | Yes | Yes | "Your appointment status has changed." | appointments | `appt:{id}:cancelled:{n}:student` | Staff with access; counsellor must own `counsellorId` | AW |
| Cancelled / withdrawn by student (`appointment_updated`) | `cancelAppointment` / `deleteAppointment` (the student path withdraws, never deletes) | Counsellor / Admin | The appointment's staff | Yes | Yes | "An appointment has been updated." | appointments | `appt:{id}:cancelled:{n}:staff` | Own appointment only; the record is kept | AW "withdraw keeps the record" |
| Completed (`appointment_completed`) | `completeAppointment` / `updateAppointmentStatus` complete (staff only) | Student | The appointment's student | Yes | No (low urgency; avoids extra lock-screen traffic) | n/a | appointments | `appt:{id}:completed:{n}:student` | Only counsellor or admin; a student is refused ("Only your counsellor can mark…") | AW "students cannot … complete" |
| Student feedback (`appointment_feedback`) | `completeAppointment` called by the student (feedback only, no status change) | Counsellor / Admin | The appointment's staff | Yes | No (informational) | n/a | appointments | `appt:{id}:feedback:{n}:staff` | Own appointment; once (`isFeedbackCompleted`) | AS "only staff complete; students give feedback once" |
| Reassignment: open appointment transferred (`appointment_request_received`) | `moveOpenAppointmentsOnAssignmentChange` (from `assign` / `assignMany`) | Counsellor (new) | The **new** counsellor only; the previous counsellor gets nothing and loses access | Yes | Yes | "You have a new appointment request." | appointments | `appt:{id}:reassigned:{newCounsellorId}` | Admin-only assignment mutation | AW "previous counsellor loses access immediately" |
| Reassignment: confirmed appointment must be reconfirmed (`appointment_reconfirm_needed`) | Same | Student | The appointment's student | Yes | Yes | "Your appointment status has changed." | appointments | `appt:{id}:reassigned_student:{newCounsellorId}` | As above | AW |
| Reassignment: pending request transferred (`appointment_transferred`) | Same | Student | The appointment's student | Yes | No (informational; nothing for the student to do) | n/a | appointments | `appt:{id}:reassigned_student:{newCounsellorId}` | As above | AW |
| Unassignment: open appointment has no counsellor (`appointment_needs_counsellor`) | Same, called with `newCounsellorId = null` (from `unassign` / `unassignMany`) | Admin | All active admins | Yes | Yes | "An appointment request needs a counsellor." | appointments | `appt:{id}:unassigned:{historyLength}` | Admin-only mutation | AW "unassigning sends open appointments to the admin queue" |

## Assignment and capacity

All rows are raised in `convex/counsellorAssignments.ts`.

| Event | Trigger location | Recipient role | Recipient-resolution rule | In-app? | Push? | Lock-screen-safe content | Destination | Dedup strategy | Authorization rule | Test coverage |
|---|---|---|---|---|---|---|---|---|---|---|
| Student assigned or reassigned (`counsellor_assigned`) | `assignOne` (used by `assign` and `assignMany`) | Student | The student being assigned | Yes (no counsellor name in the text) | Yes | "You have an update from Emotify." (default) | my_counsellor | `assignment:{assignmentId}` | Admin only (`requireAdmin`); capacity enforced first | CC "assignment notifies the student and counsellor" |
| Student(s) added to caseload (`caseload_assignment`) | `notifyCaseloadChanges` | Counsellor | The receiving counsellor; one notification per bulk operation, with a hand-over line if there are open alerts | Yes | Yes | "You have an update from Emotify." | home | `caseload:added:{timestamp}` | Admin only | CC, `counsellor_assignments.test.ts` |
| Student(s) moved away (`caseload_removed`) | Same | Counsellor | Each previous counsellor (count only, no names) | Yes | No | n/a | home | `caseload:removed:{timestamp}` | Admin only | `counsellor_assignments.test.ts` |
| Student unassigned (`counsellor_unassigned`) | `afterUnassign` | Student | The student | Yes (supportive; points to the care team) | No (avoids an alarming lock-screen event) | n/a | my_counsellor | `unassigned:{assignmentId}` | Admin only | AW "unassigning…" |
| Caseload reached 20 (`caseload_capacity`) | `notifyIfAtCapacity` | Admin | All active admins | Yes | No (operational) | n/a | assignments | `capacity_full:{counsellorId}:{UTC day}` | Admin only (`openNotification` refuses `assignments` for non-admins) | CC (asserts `pushStatus` is undefined) |
| Capacity refusal | `assignOne` throws; `assignMany` records an audit entry | Admin (the caller) | The calling admin sees the error or bulk result; no notification row is written | No (audit log `caseload_assign_failed`, shown in the Exceptions panel) | No | n/a | Dashboard Assignments → Exceptions | One audit row per failed student per attempt | Admin only | CC "bulk assignment stops at the limit and … records each refusal" |

## Support requests and safety

| Event | Trigger location | Recipient role | Recipient-resolution rule | In-app? | Push? | Lock-screen-safe content | Destination | Dedup strategy | Authorization rule | Test coverage |
|---|---|---|---|---|---|---|---|---|---|---|
| Safety alert, critical (`critical_risk`) | `convex/alerts.ts` `insertSafetyAlert` (called from screening, companion and CBT pipelines; clinical thresholds unchanged) | Counsellor + Admin | `getStaffRecipientsForStudent`: the **assigned active counsellor + all active admins**; if the student is unassigned or the counsellor is inactive, **every active counsellor + all active admins**. Inactive accounts are excluded | Yes (de-identified label, e.g. "Student 101") | Yes | "Please open Emotify to view an important update." (important, MAX) | alerts | `alert:{alertId}` | Recipients are staff by construction; `openNotification` refuses `alerts` for non-staff; zero recipients → audit `alert_delivery_failure` + Exceptions panel | NS "unassigned student: every active counsellor and admin…", "assigned student: the assigned counsellor and admins only" |
| Safety alert, non-critical (`safety_alert`) | Same | Counsellor + Admin | Same | Yes | Yes | Same | alerts | `alert:{alertId}` | Same | NS |
| Student support request (`counsellor_request`) | `convex/counsellorRequests.ts` `createCounsellorRequest` | Counsellor + Admin | Same rule as safety alerts | Yes (de-identified) | Yes | "You have a new support request." (important) | requests | `counsellor_request:{requestId}` | Students only for themselves; staff for accessible students | P12-3 REQUEST-FLOW-06 |
| Repeated urgent request from the crisis screen (`counsellor_request`, critical) | Same, when an active request already exists and `sourceType = emergency_modal` | Counsellor + Admin | Same rule | Yes | Yes | "You have a new support request." | requests | `counsellor_request:{requestId}:repeat:{UTC hour}` (at most once an hour) | Student caller only | NS "a repeated urgent request … at most once an hour" |
| Support request status changed (`counsellor_request_update`) | `updateCounsellorRequestStatus` | Student | The requesting student | Yes | Yes | "You have an update from Emotify." | appointments | `counsellor_request:{id}:status:{status}` | Staff with access to the student | P12-3 REQUEST-FLOW-07 |

## Pre-existing writers not routed through `createNotification` (unchanged, out of scope)

| Event | Trigger location | Recipient | In-app? | Push? | Note |
|---|---|---|---|---|---|
| `follow_up_created` / `follow_up_completed` | `convex/followUps.ts` (direct `ctx.db.insert`) | Student, or the student's staff | Yes (shown in the centre without a destination → it stays on the centre) | No | Follow-ups are not part of this milestone. The staff copy still uses the student's full name inside the authenticated dashboard. Recorded as a follow-up item in the audit. |

## Delivery records and failure handling (all pushed rows)

| `pushStatus` | Meaning |
|---|---|
| `queued` | Row written; delivery scheduled. |
| `sent` | Expo accepted the request (live mode). Per-ticket errors are counted. `DeviceNotRegistered` tokens are deleted from both the ticket and the receipt responses. If the receipts show errors, the row is updated with `pushError: receipt_errors:N`, and `failed` if every ticket errored. |
| `mock` | Mock mode (`EXPO_PUSH_LIVE` unset): payload built and validated, nothing sent. |
| `no_tokens` | The recipient has no registered device. The in-app row is still there. |
| `skipped` | Nothing sent. `pushError` gives the reason: `recipient_inactive`, `no_push_copy` or `copy_failed_privacy_check`. |
| `failed` | Provider or network error (`pushError` holds a short reason). The in-app row is never removed. |

`deliverNotification` runs only while `pushStatus === "queued"`, so a re-invoked scheduled job cannot send twice
(NS "a scheduled delivery runs once even if invoked again").
