# P12 STEP 5 — COUNSELOR FOLLOW-UP MANAGEMENT SYSTEM
## Implementation & Verification Report

**Date**: October 3, 2026  
**Status**: COMPLETE  
**Baseline Test Count**: 651/651 passing tests (39 test files)  
**Post-Implementation Test Count**: 669/669 passing tests (40 test files)  
**TypeScript Status**: Zero Errors (`npx tsc --noEmit` clean across root and dashboard)  
**Dashboard Production Build**: Clean (`tsc -b && vite build` succeeded in 1.00s)

---

### 1. Objective
Implement a production-safe Counselor Follow-Up Management System allowing authorized counselors and administrators to:
1. View follow-ups belonging to students they are authorized to access.
2. Create standalone or appointment-linked care follow-ups for students with strict identity resolution.
3. View follow-up details with complete data separation (sanitizing staff-only notes for students).
4. Update follow-up status, due date, and notes for non-completed records.
5. Mark follow-ups complete with timestamping and actor logging (`completedAt`, `completedBy`).
6. Preserve student ownership and institutional authorization boundaries.
7. Maintain appointment provenance (`appointmentId`) preventing forged cross-student references.
8. Retain auditability and timeline representation without duplicating database state.
9. Deliver an operational counselor dashboard interface within the existing calm design language.
10. Expose a lightweight care follow-up status card on the student mobile experience.

---

### 2. Pre-Implementation Audit
1. **Schema (`followUps` in `convex/schema.ts`)**:
   - Fields present: `userId: v.string()`, `type: v.string()`, `dueDate: v.number()`, `completed: v.boolean()`, `createdAt: v.number()`, `sourceType: v.optional(v.string())`, `attemptId: v.optional(v.id("screeningAttempts"))`, `triageId: v.optional(v.id("triages"))`.
   - Index present: `by_userId`.
   - Missing fields: `appointmentId: v.optional(v.id("appointments"))`, `notes: v.optional(v.string())`, `status: v.optional(v.string())`, `completedAt: v.optional(v.number())`, `completedBy: v.optional(v.string())`.
   - Missing index: `by_appointmentId`.
2. **Lifecycle & Status Model**:
   - Binary boolean `completed` was the historical standard; extended safely to support `status: "pending" | "scheduled" | "completed" | "cancelled"`.
3. **Creation Paths**:
   - `create` in `convex/followUps.ts` previously ignored client-supplied `userId` and overwrote with `identity.subject`, blocking staff creation for students.
   - `scheduleFollowUp` in `convex/followUps.ts` handled automated screening/triage follow-ups.
4. **Update & Completion Paths**:
   - `markComplete` was hardened in Step 2 to allow staff or the student owner. Missing explicit validation preventing repeated mutations on terminal records.
   - General `update` for counselor adjustments (due date, notes) was missing.
5. **Authorization**:
   - `getAuthenticatedUser` and `assertCanAccessStudent` used throughout.
6. **Appointment & Timeline Relationship**:
   - No direct `appointmentId` field previously existed on `followUps`. Timeline mapper omitted appointment provenance for follow-ups.
7. **Dashboard & Student Visibility**:
   - Dashboard Sessions page lacked follow-up management view. Student mobile appointments screen lacked follow-up tracking.
8. **Delete Cascade**:
   - `convex/users.ts` (`deleteUser`) already contained cascade deletion for `followUps` via `by_userId` index query.

---

### 3. Existing Follow-Up Lifecycle
The baseline schema recorded follow-ups as pending items (`completed: false`) scheduled with `dueDate: v.number()`. Follow-ups created from screenings and triages preserved `attemptId` and `triageId`.

### 4. Lifecycle Changes
1. **Status Alignment**: Stored `status: v.optional(v.string())` aligned with `completed: boolean`. A follow-up is either `"pending"` or `"completed"` (with support for `"scheduled"` and `"cancelled"`).
2. **Terminal Integrity**: Once `completed: true` (or `status === "completed"`), repeated completion attempts and mutation updates are rejected server-side with informative errors.
3. **Actor Auditing**: Completion records `completedAt: Date.now()` and `completedBy: String(caller._id)`.

---

### 5. Creation Flow
- **Counselor/Admin Creation**:
  - Staff caller authenticates server-side.
  - Target student `userId` is resolved authoritatively against `users` table via `ctx.db.get` or `by_clerkId` index.
  - Rate limiting applied against target student.
  - Optional appointment reference (`appointmentId`) is verified: appointment must exist and its `userId` must match the target student. Cross-student or nonexistent appointment links are strictly rejected.
  - Server-side notification (`follow_up_created`) is dispatched directly to the student recipient.
- **Student Creation**:
  - If a student creates a follow-up, `targetUserId` is enforced server-side as the caller's canonical identity. Any attempt to supply an arbitrary target student is rejected (`Unauthorized: Cannot create follow-up for another user.`).

---

### 6. Authorization
- **Create**: Counselors and admins can create follow-ups for any institutional student. Students can only create for themselves.
- **Read**:
  - `getStudentFollowUps`: Accessible by student (own follow-ups only) or authorized staff. Internal counselor notes and completion actor IDs are stripped when accessed by non-staff callers.
  - `getFollowUpById`: Verifies identity ownership or staff role. Throws unauthorized if caller is an unrelated student. Notes sanitized for student callers.
  - `listAllFollowUps`: Restricted to counselors and admins. Returns enriched student name, phone, and originating appointment title.
- **Update**: Restricted to counselors and admins. Rejects mutations on already completed follow-ups.
- **Complete**: Allowed for the student owner or authorized staff. Unrelated users rejected. Terminal state transitions guarded.

---

### 7. Appointment Provenance
- `appointmentId: v.optional(v.id("appointments"))` added to `followUps` table in `convex/schema.ts`.
- Index `.index("by_appointmentId", ["appointmentId"])` added for fast provenance lookup.
- Causal provenance rule enforced:
  - If `appointmentId` is provided, the appointment must exist.
  - The appointment's `userId` must match the follow-up's `userId` (canonical user ID or clerkId). Cross-student linking is rejected (`Invalid provenance: Appointment does not belong to this student.`).
  - Standalone follow-ups remain valid when `appointmentId` is omitted.

---

### 8. Notification Behavior
1. **Creation Event**: When staff creates a follow-up for a student, a notification is inserted into `notifications` with `recipientId: studentAId`, type `"follow_up_created"`, title `"Care Follow-up Scheduled"`.
2. **Completion Event**: When staff marks a student's follow-up complete, a notification is inserted with `recipientId: studentAId`, type `"follow_up_completed"`. When a student completes their own follow-up, a notification is routed to staff.
3. **Privacy**: Notifications omit PHQ/GAD/PQ scores, AI conversation transcripts, or sensitive internal clinical notes.

---

### 9. Counselor Dashboard Changes
File: `dashboard/src/pages/Sessions.tsx`
1. **Navigation**: Added a third top-level tab button ("Care Follow-ups") alongside "Appointment Requests" and "AI CBT Session Log".
2. **Follow-Up Management View**:
   - Filterable tabs: "Pending", "Completed", "All".
   - Structured table listing Student (linked to patient record), Follow-Up Type, Due Date, Status badge, Originating Appointment link/badge, Counselor Notes snippet, and Action ("Mark Complete").
3. **Creation Modal**:
   - Student selection with integrated search filter.
   - Follow-up type selection (`counselor_checkin`, `clinical_monitoring`, `routine_checkin`, `triage_followup`).
   - HTML date picker converting to epoch timestamp for schema consistency.
   - Optional appointment dropdown filtered to the selected student.
   - Internal counselor notes textarea.
4. **Completion Action**: Direct inline action with mutation call (`markFollowUpComplete({ id })`).

---

### 10. Student UI Changes
File: `app/(auth)/tools/appointments.tsx`
1. Added lightweight "Care Follow-ups" card positioned cleanly below the Counselor Support Status Card.
2. Displays pending follow-ups with type, formatted due date, and current status.
3. Allows students to complete their own scheduled follow-up via an interactive "Complete" button with instant feedback.
4. Complete data privacy: Internal counselor notes are not queried or rendered.

---

### 11. Timeline / Provenance Behavior
File: `convex/timeline.ts`
1. Added `appointmentId?: string;` to `CanonicalTimelineEvent.provenance`.
2. In Source 7 (`followUps` mapper), mapped `appointmentId` into both event `provenance` and `metadata`.
3. Preserved existing timeline event types and display logic without introducing duplicate database records or exposing private counselor notes.

---

### 12. Schema & Index Changes
- **Table**: `followUps`
  - Added `appointmentId: v.optional(v.id("appointments"))`
  - Added `notes: v.optional(v.string())`
  - Added `status: v.optional(v.string())`
  - Added `completedAt: v.optional(v.number())`
  - Added `completedBy: v.optional(v.string())`
  - Added index: `.index("by_appointmentId", ["appointmentId"])`
- **Zero Destructive Changes**: All new fields are optional. Historical follow-ups remain 100% valid without data backfills.

---

### 13. Focused Tests
File: `convex/p12_step5_followup_management.test.ts`
- **FOLLOWUP-01**: Authorized counselor can create a follow-up for a valid student (PASSED)
- **FOLLOWUP-02**: Unauthenticated caller cannot create a follow-up (PASSED)
- **FOLLOWUP-03**: Unauthorized student cannot create a follow-up for another student (PASSED)
- **FOLLOWUP-04**: Student can retrieve only their own follow-ups and internal notes are sanitized (PASSED)
- **FOLLOWUP-05**: Student cannot retrieve another student's follow-up (PASSED)
- **FOLLOWUP-06**: Authorized counselor can retrieve intended follow-up data including student name and notes (PASSED)
- **FOLLOWUP-07**: Unauthorized staff/student cannot mutate another student's follow-up (PASSED)
- **FOLLOWUP-08**: Authorized counselor can update notes/due date and complete a follow-up (PASSED)
- **FOLLOWUP-09**: Student can complete their own follow-up (PASSED)
- **FOLLOWUP-10**: Invalid/repeated terminal-state mutation is rejected (PASSED)
- **FOLLOWUP-11**: Valid appointment → follow-up provenance is stored and queried (PASSED)
- **FOLLOWUP-12**: Cross-student appointment → follow-up provenance is rejected (PASSED)
- **FOLLOWUP-13**: Nonexistent appointment provenance is rejected (PASSED)
- **FOLLOWUP-14**: Student cannot forge follow-up ownership through client-supplied identity (PASSED)
- **FOLLOWUP-15**: Follow-up notification recipient is server-derived for creation and completion (PASSED)
- **FOLLOWUP-16**: Existing P12 Step 2 authorization tests remain passing (PASSED)
- **FOLLOWUP-17**: Existing P12 Step 3 counselor request tests remain passing (PASSED)
- **FOLLOWUP-18**: Existing P12 Step 4 appointment/provenance tests remain passing (PASSED)
**Result**: 18/18 passing tests.

---

### 14. P12 Step 2 Regression
- File: `convex/p12_step2_security_authorization.test.ts`
- Result: 14/14 tests passing.

### 15. P12 Step 3 Regression
- File: `convex/p12_step3_counsellor_request_flow.test.ts`
- Result: 12/12 tests passing.

### 16. P12 Step 4 Regression
- File: `convex/p12_step4_appointment_lifecycle.test.ts`
- Result: 16/16 tests passing.

---

### 17. Full Backend Test Suite
- Command: `npx vitest run`
- Output:
  ```
  Test Files  40 passed (40)
       Tests  669 passed (669)
    Duration  15.45s
  ```
- Progression:
  - Baseline before Step 5: 651 tests / 39 test files.
  - Step 5 addition: 18 tests / 1 test file.
  - Post Step 5: 669 tests / 40 test files. Zero regressions across the entire suite.

---

### 18. TypeScript Verification
- Command: `npx tsc --noEmit`
- Result: Zero errors. Clean compilation across the entire project.

---

### 19. Dashboard Production Build
- Working Directory: `dashboard/`
- Command: `npm run build` (`tsc -b && vite build`)
- Result:
  ```
  vite v8.0.13 building client environment for production...
  ✓ 2409 modules transformed.
  rendering chunks...
  computing gzip size...
  dist/index.html                   0.61 kB │ gzip:   0.38 kB
  dist/assets/index-DdWuBgig.css   21.35 kB │ gzip:   4.82 kB
  dist/assets/index-CDyRzCAH.js   910.29 kB │ gzip: 246.27 kB
  ✓ built in 1.00s
  ```
- Exit Code: 0 (Clean build).

---

### 20. Manual Verification Summary
- **Flow A (Counselor creates follow-up)**: Counselor selects target student, specifies type, due date, notes, and optional appointment; follow-up appears on dashboard under pending; notification sent to student.
- **Flow B (Follow-up completion by staff)**: Counselor marks follow-up complete; record transitions to completed with `completedAt` and `completedBy`; student sees updated state; student notification generated.
- **Flow C (Student completion)**: Student views own follow-ups on mobile appointments screen; completes follow-up; completed badge appears; notes remain strictly hidden from student.
- **Flow D (Appointment Provenance)**: Follow-up linked to appointment stores `appointmentId`; can be retrieved via `getFollowUpsByAppointmentId`; forged cross-student appointment reference is rejected server-side.
- **Flow E (Security Isolation)**: Student A cannot read Student B follow-ups (`Unauthorized`); Student A cannot mutate Student B follow-ups; Student A cannot pass Student B's ID to forge creation.

---

### 21. Remaining Risks
- None identified in follow-up management. All database mutations are atomic transactions in Convex.
- `PatientDetail.tsx` longitudinal timeline unification has not yet been modified, as strictly mandated for Step 6.

---

### 22. Remaining P12 Roadmap
- **Step 6**: Longitudinal Review & Unified PatientDetail View (unifying screenings, triages, appointments, counsellorRequests, follow-ups, and interventions into the longitudinal clinical record).
- **Step 7**: P12 Final Closure, End-to-End Verification & Production Readiness.

---

P12 STEP 5 — COMPLETE
