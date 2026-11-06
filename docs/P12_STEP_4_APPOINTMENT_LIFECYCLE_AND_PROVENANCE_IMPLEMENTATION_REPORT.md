# P12 — Counselor Interaction & Longitudinal Tracking
# Step 4: Appointment Lifecycle & Provenance Integration Implementation Report

**Project:** Emotify  
**Priority:** P12 — Counselor Interaction & Longitudinal Tracking  
**Phase:** Step 4 — Appointment Lifecycle & Provenance Integration  
**Execution Date:** October 3, 2026  
**Status:** **P12 STEP 4 — COMPLETE**

---

## 1. Objective

The objective of P12 Step 4 was to make the student → counselor request → appointment → appointment status lifecycle coherent, authorization-safe, auditable, and properly connected through provenance.

Key goals achieved:
1. Audited the existing appointment architecture and state machine.
2. Hardened server-side state transitions with terminal status enforcement (`completed`, `cancelled`, `rejected`).
3. Enforced receiver-only acceptance/rejection rules and student/staff ownership boundaries.
4. Integrated direct causal provenance (`counsellorRequestId`) between `counsellorRequests` and `appointments`.
5. Enforced server-side validation against forged or mismatched provenance.
6. Implemented bidirectional server-generated lifecycle notifications.
7. Updated student and counselor interfaces to surface provenance and state transitions without unnecessary redesigns.
8. Verified with 16 focused Step 4 tests, 42 combined P12 tests, 651/651 full suite tests, clean TypeScript compilation, and clean dashboard build.

---

## 2. Pre-Implementation Appointment Audit

Before making changes, an audit of the current appointment architecture was conducted across `convex/schema.ts`, `convex/appointments.ts`, `convex/counsellorRequests.ts`, `convex/timeline.ts`, and frontend components:

1. **Current Appointment Schema:**
   - Table `appointments` contained `userId`, `startTime`, `endTime`, `description`, `status` ("pending" | "waiting" | "accepted" | "rejected" | "completed" | "scheduled" | "cancelled"), `createdAt`, `sourceType`, `attemptId`, `triageId`, `title`, `createdBy`, `patientName`, `date`, `time`, `reason`, `rejectionReason`, `rescheduledBy`, `rescheduleDate`, `rescheduleTime`, `feedback`, `rating`, `attended`, `isFeedbackCompleted`.
   - Indexed by `by_userId` and `by_startTime`.
2. **Creation Paths:**
   - `createAppointment`: Admin-only mutation taking startTime/endTime, status set to `"scheduled"`.
   - `createAppointmentRequest`: Two-way system mutation, called by user (for self) or admin/staff (for student), status set to `"pending"`.
   - Prior to Step 4, there was no direct field linking an appointment to a `counsellorRequests` document.
3. **Status Values and Legal Transitions:**
   - Statuses in schema: `"pending"`, `"waiting"`, `"accepted"`, `"rejected"`, `"completed"`, `"scheduled"`, `"cancelled"`.
   - State machine lacked terminal state enforcement (terminal records could be re-mutated).
   - `completed` transition lacked explicit verification of student owner or staff.
4. **Authorization Model:**
   - `create`: User for self; staff for student.
   - `view`: User for self (`getTwoWayAppointmentsForPatient`); staff for institutional appointments.
   - `accept`/`reject`: Receiver rule (if user created, staff accepts; if staff created, student accepts).
   - `reschedule`: Same-day validation existed but lacked explicit ownership authorization.
   - `cancel`: Previously restricted to admin only, blocking counselors and students from cancelling their own appointments.
   - `complete`: Required verification that only student owner or authorized staff can mark completion.
5. **Student Access Isolation:**
   - Queries enforced `assertCanAccessStudent(ctx, args.userId)`.
   - Mutator functions now enforce that non-staff callers can only touch appointments belonging to them.
6. **Counselor/Admin Scope:**
   - Staff operations restricted to callers with role `"admin"` or `"counsellor"`.
7. **Appointment Notifications:**
   - Previously, appointment creations and status mutations did NOT generate notifications.
8. **Link to `counsellorRequests`:**
   - Previously absent in `appointments`.
9. **Clinical Provenance:**
   - Contained `attemptId` and `triageId`, but lacked counselor request provenance.
10. **Patient Detail / Clinical Timeline Linkage:**
    - Appointments were rendered in `timeline.ts` as Source 6, but without provenance linking back to the originating counselor request.

---

## 3. Existing State Machine & Hardened Transition Rules

The existing statuses were preserved and codified into a server-enforced state machine:

```
[Student / Staff creates appointment]
                 │
                 ▼
             pending ◄─────────┐
             │     │           │
     reject  │     │ accept    │
        ┌────┘     └─────┐     │
        ▼                ▼     │
    rejected          accepted │
    (terminal)           │     │
                   reschedule  │
                         ▼     │
                      waiting ─┘
                         │
                      complete / cancel
                         │
                         ▼
               completed / cancelled
                    (terminal)
```

### Transition Enforcement Rules:
1. **Terminal States:**
   - `"completed"`, `"cancelled"`, and `"rejected"` are immutable terminal states.
   - Any mutation targeting an appointment in a terminal state throws:
     `"Appointment is in a terminal state (<status>) and cannot be modified."`
2. **Receiver Inversion Rule:**
   - For `status: "pending"`:
     - If `createdBy === "user"`: Staff must accept/reject. Student cannot accept their own pending request.
     - If `createdBy === "admin"`: Student owner must accept/reject. Staff cannot accept on behalf of the student.
   - For `status: "waiting"`:
     - If `rescheduledBy === "user"`: Staff must accept/reject.
     - If `rescheduledBy === "admin"`: Student owner must accept/reject.
3. **Completion Rule:**
   - An appointment can only be completed if currently in `"accepted"`, `"scheduled"`, or `"waiting"`.
   - Cannot jump from `"pending"` directly to `"completed"`.
   - Can only be completed by the student owner or authorized staff.
4. **Cancellation Rule:**
   - Can be cancelled from any non-terminal state by either the student owner or authorized staff.
5. **Rejection Rule:**
   - Requires non-empty `rejectionReason`.

---

## 4. Lifecycle Changes

1. **`convex/appointments.ts`:**
   - Defined `TERMINAL_STATUSES = new Set(["completed", "cancelled", "rejected"])`.
   - Defined `ALLOWED_TARGET_STATUSES = new Set(["accepted", "rejected", "completed", "cancelled"])`.
   - Updated `updateAppointmentStatus`:
     - Blocks mutation of terminal appointments.
     - Enforces legal status transitions.
     - Enforces receiver checks for `accepted` and `rejected`.
     - Enforces student ownership / staff check for `completed` and `cancelled`.
     - Automatically updates linked `counsellorRequests` status to `"scheduled"` on accept, and `"completed"` on complete.
   - Updated `requestReschedule`:
     - Blocks mutation of terminal appointments.
     - Enforces valid source state (`pending`, `accepted`, `scheduled`, `waiting`).
     - Enforces that only student owner or staff can reschedule.
   - Updated `completeAppointment`:
     - Blocks mutation of terminal appointments.
     - Enforces valid source state (`accepted`, `scheduled`, `waiting`).
     - Enforces student owner or staff authorization.
     - Automatically updates linked `counsellorRequests` status to `"completed"`.
   - Updated `cancelAppointment`:
     - Extended authorization from admin-only to both staff (admin/counselor) and student owner.
     - Blocks cancellation of already terminal appointments.

---

## 5. Authorization Changes

1. **Canonical Identity Resolution:**
   - Standardized callers using `getAuthenticatedUser(ctx)` to safely resolve canonical database records across direct `_id` and Clerk subjects.
2. **Ownership Boundaries:**
   - Students cannot read, accept, reject, reschedule, complete, or cancel appointments belonging to other students.
3. **Staff Scope:**
   - Both counselors and admins can manage appointments, while respecting receiver rules.
4. **Forged Recipient Prevention:**
   - All notifications are generated server-side using canonical document IDs (`appt.userId` or staff user IDs), with 0 client parameterization.

---

## 6. CounselorRequest ↔ Appointment Provenance

1. **Schema Link:**
   - Added `counsellorRequestId: v.optional(v.id("counsellorRequests"))` to `appointments` in `convex/schema.ts`.
   - Added index `by_counsellorRequestId` (`["counsellorRequestId"]`) on `appointments`.
2. **Provenance Validation (`validateCounsellorRequestProvenance`):**
   - When `counsellorRequestId` is provided during appointment creation:
     1. Verifies that the counselor request exists in the database.
     2. Verifies that the counselor request's `user_id` matches the appointment's student (`args.userId` or student `clerkId`).
     3. Rejects nonexistent requests with `"Invalid provenance: Counselor request not found."`
     4. Rejects mismatched requests with `"Invalid provenance: Counselor request does not belong to this student."`
3. **Reciprocal Access Query:**
   - Implemented `getAppointmentByCounsellorRequestId` query in `convex/appointments.ts`, allowing authorized retrieval of an appointment directly from its originating counselor request.
4. **Clinical Timeline Integration:**
   - Updated `convex/timeline.ts` Source 6 (`appointments`) to include:
     ```ts
     provenance: {
       attemptId: appt.attemptId ? String(appt.attemptId) : undefined,
       triageId: appt.triageId ? String(appt.triageId) : undefined,
       counsellorRequestId: appt.counsellorRequestId ? String(appt.counsellorRequestId) : undefined,
     }
     ```
   - Extended `CanonicalTimelineEvent.provenance` interface with optional `counsellorRequestId?: string`.

---

## 7. Notification Behavior

Server-side notifications are dispatched across all key lifecycle milestones:

| Lifecycle Event | Initiator | Recipient | Notification Type | Notification Title |
| :--- | :--- | :--- | :--- | :--- |
| Appointment Created | Student | Staff (Counselors & Admins) | `appointment_request` | New Appointment Request |
| Appointment Proposed | Staff | Student | `appointment_scheduled` | Appointment Proposed |
| Appointment Accepted | Staff | Student | `appointment_accepted` | Appointment Accepted |
| Appointment Accepted | Student | Staff | `appointment_accepted` | Appointment Confirmed by Student |
| Appointment Rejected | Staff | Student | `appointment_rejected` | Appointment Declined |
| Appointment Rejected | Student | Staff | `appointment_rejected` | Appointment Declined by Student |
| Reschedule Proposed | Staff | Student | `appointment_rescheduled` | Appointment Reschedule Proposed |
| Reschedule Requested | Student | Staff | `appointment_rescheduled` | Reschedule Requested by Student |
| Appointment Completed | Any Authorized | Student | `appointment_completed` | Appointment Completed |
| Appointment Cancelled | Staff | Student | `appointment_cancelled` | Appointment Cancelled |
| Appointment Cancelled | Student | Staff | `appointment_cancelled` | Appointment Cancelled by Student |

Privacy & Scope:
- Free of raw clinical assessment scores or AI companion transcripts.
- Bounded recipient routing to affected parties only.

---

## 8. Student UI Changes

File: `app/(auth)/tools/appointments.tsx`
- Preserved existing layout and tabs.
- Added visual indicator `Linked to Counselor Request` in `AppointmentCard` when `appt.counsellorRequestId` is present.
- Students can distinguish between counselor support requests and active scheduled appointments.

---

## 9. Counselor Dashboard Changes

1. **`dashboard/src/pages/CounsellorRequests.tsx`:**
   - Updated "Schedule Call" button action:
     - Sets request status to `"scheduled"`.
     - Navigates to `/sessions?studentId=${req.patientId}&counsellorRequestId=${req._id}` for seamless provenance passing.
2. **`dashboard/src/pages/Sessions.tsx`:**
   - Wired `useSearchParams` to detect `studentId` and `counsellorRequestId`.
   - Automatically pre-selects the patient and passes `counsellorRequestId` into `createAppointmentRequest`.
   - Table rows display a provenance tag: `Linked to Counselor Request` when `counsellorRequestId` is present.

---

## 10. Schema & Index Changes

### Table: `appointments`
- Added field: `counsellorRequestId: v.optional(v.id("counsellorRequests"))`
- Added index: `.index("by_counsellorRequestId", ["counsellorRequestId"])`

Backward Compatibility:
- Field is optional (`v.optional`).
- Historical appointments remain completely valid without backfill or data migration.
- 0 breaking schema modifications.

---

## 11. Focused Tests

New Test Suite: `convex/p12_step4_appointment_lifecycle.test.ts` (16 tests, 100% passing)

| Test ID | Description | Result |
| :--- | :--- | :--- |
| `APPT-LIFE-01` | Student can create/view their own appointment through valid existing flow | **PASS** |
| `APPT-LIFE-02` | Unauthenticated appointment mutation is rejected | **PASS** |
| `APPT-LIFE-03` | Student cannot mutate another student's appointment | **PASS** |
| `APPT-LIFE-04` | Student cannot arbitrarily complete another student's appointment | **PASS** |
| `APPT-LIFE-05` | Invalid appointment status transition is rejected | **PASS** |
| `APPT-LIFE-06` | Authorized counselor can perform intended existing appointment action | **PASS** |
| `APPT-LIFE-07` | Unauthorized counselor/staff mutation is rejected according to receiver rules | **PASS** |
| `APPT-LIFE-08` | Admin retains intended appointment privileges | **PASS** |
| `PROV-01` | Valid counselorRequest → appointment provenance is stored | **PASS** |
| `PROV-02` | Appointment cannot reference another student's counselor request | **PASS** |
| `PROV-03` | Appointment cannot reference nonexistent counselor request | **PASS** |
| `PROV-04` | Provenance remains retrievable from both sides where schema supports reciprocal access | **PASS** |
| `NOTIF-01` | Valid appointment status change generates intended student notification | **PASS** |
| `NOTIF-02` | Notification recipient cannot be forged by client input | **PASS** |
| `REG-01` | Existing P12 Step 2 appointment authorization still passes | **PASS** |
| `REG-02` | Existing P12 Step 3 counselor request flow still functions alongside appointments | **PASS** |

---

## 12. P12 Step 2 Regression Testing

File: `convex/p12_step2_security_authorization.test.ts`
- Tests: **14/14 passed** (100%)
- 0 regressions in counselor appointment accept/reject, follow-up completions, or authorization checks.

---

## 13. P12 Step 3 Regression Testing

File: `convex/p12_step3_counsellor_request_flow.test.ts`
- Tests: **12/12 passed** (100%)
- 0 regressions in counselor request creation, duplicate prevention, status updates, or safety alert preservation.

---

## 14. Full Test Suite Verification

- **Total Test Files:** 39 passed (39 total)
- **Total Tests:** 651 passed (651 total)
- **Delta:** +16 tests (635 baseline → 651 total)
- **Duration:** ~14.4s

---

## 15. TypeScript Verification

- Command: `npx tsc --noEmit`
- Exit Code: `0`
- Errors: `0`

---

## 16. Dashboard Production Build Verification

- Command: `npm run build` in `dashboard/`
- Exit Code: `0`
- Bundle Output: `dist/assets/index-DQMwkOM2.js (901.25 kB)`
- Errors: `0`

---

## 17. Manual Verification Flows

1. **Flow A — Ordinary Request to Appointment:**
   - Student submits counselor request.
   - Counselor views request in Intervention Queue, clicks "Schedule Call".
   - Navigation carries `studentId` and `counsellorRequestId` into Sessions page.
   - Appointment is created with linked provenance; request automatically transitions to `"scheduled"`.
   - Student receives notification and sees appointment with provenance badge.
2. **Flow B — Emergency Request Coexistence:**
   - Urgent crisis alert path creates emergency safety alert.
   - Counselor request and appointment lifecycle proceed independently without mutating or dropping safety alerts.
3. **Flow C — Identity & Provenance Security:**
   - Student B cannot view or mutate Student A's appointment.
   - Student B cannot link Student A's counselor request to an appointment (rejected with `"Invalid provenance"`).
4. **Flow D — Terminal & Transition Protection:**
   - Attempting to accept/reschedule a rejected or completed appointment throws terminal state error.
   - Jumping from pending to completed throws invalid transition error.

---

## 18. Remaining Risks

- **Low Risk:** Mobile calendar third-party library in React Native handles date pickers locally; server validates ISO date string format.
- **Low Risk:** Notification volume remains manageable under typical campus caseloads, bounded by pagination.

---

## 19. Remaining P12 Roadmap

- **Step 1:** Read-Only Audit *(Complete)*
- **Step 2:** Security & Authorization Remediation *(Complete)*
- **Step 3:** Counselor Request Flow Alignment *(Complete)*
- **Step 4:** Appointment Lifecycle & Provenance Integration *(Complete — CURRENT)*
- **Step 5:** Follow-Up Management System *(Upcoming)*
- **Step 6:** Longitudinal Review Unification
- **Step 7:** E2E Verification & Closure

---

## Final Status

**P12 STEP 4 — COMPLETE**
