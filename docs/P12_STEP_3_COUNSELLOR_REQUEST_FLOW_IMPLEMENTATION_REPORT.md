# P12 — Counselor Interaction & Longitudinal Tracking
## Step 3: Counselor Request Flow Alignment Implementation Report

**Project:** Emotify  
**Priority:** P12 — Counselor Interaction & Longitudinal Tracking  
**Phase:** Step 3 — Counselor Request Flow Alignment  
**Date:** October 3, 2026  
**Status:** Complete  

---

## 1. Objective

The objective of P12 Step 3 is to repair the disconnected student $\rightarrow$ counselor request pipeline:
- In Step 1, we identified that the student "Talk to Counsellor" modal in `app/(auth)/(tabs)/_layout.tsx` was dispatching an emergency crisis alert (`alerts.createAlert`) while the counselor dashboard request queue (`dashboard/src/pages/CounsellorRequests.tsx`) queries the `counsellorRequests` table.
- In this phase, we connect the canonical `counsellorRequests` creation pipeline, preserve crisis safety alerts for emergency scenarios, implement server-authoritative identity and duplicate active request prevention, add counselor notifications on request arrival and student notifications on status updates, and provide a clean student-facing request status UI with full authorization.

---

## 2. Existing Flow

Prior to Step 3:
1. **Student Help Action**: Student tapped "Talk to Counsellor" inside the emergency modal in `app/(auth)/(tabs)/_layout.tsx`.
2. **Alert Triggered**: The mobile client executed `api.alerts.createAlert({ userId: user.id, type: "counselor_request" })`.
3. **Queue Disconnect**: The record was written to the `alerts` table. The counselor intake queue (`counsellorRequests` table) remained completely empty.
4. **No Student Status Tracking**: The student had no interface to see whether their counselor request was received, scheduled, or reviewed.
5. **No Duplicate Request Guard**: `counsellorRequests.create` accepted repeated clicks without debouncing or active request verification.

---

## 3. New Flow

After Step 3:
$$\text{Student Action} \longrightarrow \text{Server-Authoritative Identity Validation} \longrightarrow \text{Active Duplicate Check} \longrightarrow \text{Insert } \texttt{counsellorRequests} \longrightarrow \text{Staff Notification Dispatch} \longrightarrow \text{Student Status Card}$$

1. **Ordinary Counselor Request**:
   - Initiated via the Student Appointments / Support interface (`app/(auth)/tools/appointments.tsx`).
   - Invokes `api.counsellorRequests.create`.
   - Derives student identity server-side from `ctx.auth.getUserIdentity()`.
   - Checks for existing active requests (`pending`, `assigned`, `scheduled`).
   - Inserts record into `counsellorRequests`.
   - Generates notifications for institutional counselors and admins.
   - **Does NOT create an unnecessary crisis alert.**
2. **Crisis / Emergency Modal Request**:
   - Initiated when a student taps "Talk to Counsellor Now" in the suicide/crisis emergency overlay (`app/(auth)/(tabs)/_layout.tsx`).
   - Invokes `api.counsellorRequests.create({ sourceType: "emergency_modal", situation_text: "..." })` to enter the counselor intake queue.
   - **Preserves** the existing `api.alerts.createAlert` call to trigger clinical safety escalation.
3. **Counselor Status Update & Student Notification**:
   - Counselor updates status (`scheduled`, `completed`, `dismissed`) in `dashboard/src/pages/CounsellorRequests.tsx`.
   - Invokes `api.counsellorRequests.updateStatus`.
   - Automatically dispatches a notification to the student's notification center.
4. **Student Request Visibility**:
   - The student can see their active request status, requested date, situation text, and counselor notes directly in `app/(auth)/tools/appointments.tsx`.

---

## 4. Ordinary vs. Crisis Request Behavior

| Attribute | Ordinary Support Request | Crisis Emergency Path |
|---|---|---|
| **Entrypoint** | `app/(auth)/tools/appointments.tsx` (Support card) | `app/(auth)/(tabs)/_layout.tsx` (Emergency modal) |
| **`counsellorRequests` Table** | **Inserted** (`sourceType: "self_initiated"`) | **Inserted** (`sourceType: "emergency_modal"`) |
| **`alerts` Table** | **None** (Cleanly suppressed) | **Inserted** (`type: "counselor_request"`, severity high) |
| **Staff Notifications** | Dispatched via `notifications` | Dispatched via `notifications` + crisis alert banner |
| **Student UI Feedback** | Real-time card: "Pending Review" | Confirmation Alert + emergency contacts shown |

---

## 5. Duplicate Prevention

Implemented in `convex/counsellorRequests.ts:create`:
```typescript
const searchIds = new Set<string>([effectiveUserId, identity.subject]);
if (caller) {
  searchIds.add(String(caller._id));
  if (caller.clerkId) searchIds.add(caller.clerkId);
}

const activeStatuses = new Set(["pending", "assigned", "scheduled"]);
for (const uid of Array.from(searchIds)) {
  const existing = await ctx.db
    .query("counsellorRequests")
    .withIndex("by_user_id", (q) => q.eq("user_id", uid))
    .collect();

  const activeReq = existing.find((r) => activeStatuses.has(r.status || "pending"));
  if (activeReq) {
    // Return existing active request ID, do not create duplicate record or send duplicate notification
    return activeReq._id;
  }
}
```
- Active requests (`pending`, `assigned`, `scheduled`) prevent duplicate insertions.
- Historical requests (`completed`, `cancelled`, `dismissed`) allow students to submit new requests once the prior engagement is closed.

---

## 6. Counselor Notifications

When a new counselor request is created:
- The system queries institutional counselors and admins via `users.by_role`:
  ```typescript
  const staffMembers = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "counsellor")).collect();
  const adminMembers = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "admin")).collect();
  ```
- Each staff member receives a server-generated notification:
  - `recipientId`: Canonical `String(staff._id)`.
  - `type`: `"counsellor_request"`.
  - `title`: `"New Counselor Support Request"`.
  - `message`: `"${studentName} requested counselor support."`
  - `priority`: `"medium"`.
- Private clinical screening responses and sensitive distress transcripts are **NOT** leaked into notification previews.

---

## 7. Student Status UI

Integrated into `app/(auth)/tools/appointments.tsx`:
- Queries `api.counsellorRequests.getMyRequests`.
- If a request exists:
  - Displays a clean card with status badge:
    - `"pending"` $\rightarrow$ Amber badge ("Pending Review")
    - `"scheduled"` / `"assigned"` $\rightarrow$ Blue badge ("Scheduled")
    - `"completed"` $\rightarrow$ Green badge ("Completed")
    - `"dismissed"` / `"cancelled"` $\rightarrow$ Gray badge ("Closed")
  - Displays requested date and student situation note.
  - Displays counselor feedback/notes once reviewed.
  - Enables "New Request" button if prior request is completed/closed.
- If no request exists:
  - Displays "Need Counselor Guidance?" card with a quick-action button opening a submission modal.

---

## 8. Authorization

- **`create`**: Enforces authenticated caller. Students can only create requests for themselves (`args.user_id !== identity.subject` throws `Unauthorized` unless caller is staff).
- **`getMyRequests`**: Enforces authenticated caller. Scoped strictly to caller's `_id`, `clerkId`, and `identity.subject`.
- **`getRequestById`**: Authorizes the owning student or staff (`admin` / `counsellor`). Unrelated students are rejected with `"Unauthorized: Cannot view another student's counselor request."`
- **`updateStatus`**: Strictly gated via `requireCounselorOrAdmin(ctx)`. Students are denied with `"Unauthorized: Counselor or Admin access required."`

---

## 9. Notification Security

- `recipientId` is strictly derived server-side from database documents; clients cannot forge or override `recipientId`.
- Reads remain strictly scoped by `dashboard.ts:getNotifications` (verified by `NOTIF-02` tests).
- Mark-read operations remain ownership-enforced.

---

## 10. Provenance

Each created counselor request persists:
- `user_id`: Canonical student identity.
- `timestamp`: Creation time in epoch milliseconds.
- `status`: `"pending"` default.
- `sourceType`: `"self_initiated"` (ordinary) or `"emergency_modal"` (crisis).
- `triageId`: Causal triage ID when triggered from crisis assessment.
- `updatedAt`: Normalized timestamp for audit trail.

---

## 11. Tests Added

A dedicated regression test suite was created in `convex/p12_step3_counsellor_request_flow.test.ts` covering 12 discrete test cases:

| Test ID | Description | Result |
|---|---|---|
| **REQUEST-FLOW-01** | Student can create counselor request | **PASS** |
| **REQUEST-FLOW-02** | Unauthenticated user cannot create request | **PASS** |
| **REQUEST-FLOW-03** | Student cannot create request for another user | **PASS** |
| **REQUEST-FLOW-04** | Duplicate active request is prevented | **PASS** |
| **REQUEST-FLOW-05** | Completed/cancelled historical request does not prevent a new request | **PASS** |
| **REQUEST-FLOW-06** | Counselor receives appropriate request notification | **PASS** |
| **REQUEST-FLOW-07** | Student receives notification after counselor status update | **PASS** |
| **REQUEST-FLOW-08** | Student can retrieve own request status | **PASS** |
| **REQUEST-FLOW-09** | Student cannot retrieve another student's request | **PASS** |
| **REQUEST-FLOW-10** | Counselor can retrieve intended request queue | **PASS** |
| **REQUEST-FLOW-11** | Existing safety alert behavior remains intact for crisis path | **PASS** |
| **REQUEST-FLOW-12** | Ordinary counselor request does not generate crisis alert | **PASS** |

---

## 12. Focused Test Results

```
 RUN  v4.1.10 D:/Projects/EmotifyApp/Emotify-Clerk

 ✓ convex/p12_step3_counsellor_request_flow.test.ts (12 tests) 223ms

 Test Files  1 passed (1)
      Tests  12 passed (12)
   Duration  1.25s
```

Step 2 authorization tests also re-verified:
```
 ✓ convex/p12_step2_security_authorization.test.ts (14 tests) 150ms
```

---

## 13. Full Regression Results

```
 Test Files  38 passed (38)
      Tests  635 passed (635)
   Duration  22.35s
```
*Note: Test count increased from 623 to 635 (12 new flow tests, 100% passing across all 38 files).*

---

## 14. TypeScript

```bash
npx tsc --noEmit
# Exit code: 0 (Clean, 0 errors)
```

---

## 15. Dashboard Build

```bash
npm run build
# Exit code: 0
# ✓ built in 866ms (Clean production bundle)
```

---

## 16. Files Modified

| File | Change |
|---|---|
| `convex/counsellorRequests.ts` | Added server-authoritative identity, duplicate active check, staff notification dispatch, student status notifications, `getMyRequests`, and `getRequestById`. |
| `app/(auth)/(tabs)/_layout.tsx` | Aligned emergency modal to create canonical `counsellorRequests` record while maintaining the crisis safety alert. |
| `app/(auth)/tools/appointments.tsx` | Integrated student Counselor Support card, real-time status tracking, and request submission modal. |
| `convex/p12_step3_counsellor_request_flow.test.ts` | 12 new regression test cases. |

---

## 17. Schema/Index Changes

**Zero schema changes. Zero index changes.**

---

## 18. Manual Verification

- **Ordinary Request**:
  - Opened appointments/support screen $\rightarrow$ tapped "Request Counselor Support" $\rightarrow$ entered note $\rightarrow$ submitted.
  - Verified request appeared in student status view with badge "Pending Review".
  - Verified request appeared in counselor dashboard queue (`CounsellorRequests.tsx`) with student name.
  - Verified NO records were inserted into `alerts`.
- **Duplicate Prevention**:
  - Repeated request while pending $\rightarrow$ returned existing request ID $\rightarrow$ no duplicate rows in database.
- **Status Lifecycle**:
  - Counselor updated status to "scheduled" $\rightarrow$ student received notification $\rightarrow$ status badge changed to "Scheduled".
- **Crisis Path**:
  - Emergency modal triggered $\rightarrow$ tapped "Talk to Counsellor Now" $\rightarrow$ both `counsellorRequests` and high-urgency `alerts` record created.

---

## 19. Remaining P12 Work

- **P12 Step 4**: Appointment Lifecycle & Provenance Integration (two-way status lifecycle hardening, reschedule flow checks).
- **P12 Step 5**: Follow-Up Management System in Counselor Dashboard.
- **P12 Step 6**: Longitudinal Review Unification in `PatientDetail.tsx`.
- **P12 Step 7**: End-to-End Verification & Closure.

---

## 20. Conclusion

The disconnected counselor request pipeline has been fully repaired. Ordinary requests flow cleanly through `counsellorRequests`, duplicate requests are prevented server-side, notifications are dispatched bidirectionally, crisis safety alerts remain intact for emergencies, and students can view their request status in real time.

---

P12 STEP 3 — COMPLETE
