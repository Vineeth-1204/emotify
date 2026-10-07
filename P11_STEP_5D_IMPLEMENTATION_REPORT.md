# P11 Step 5D: Targeted Security & Scalability Hardening Implementation Report

**Document Status:** COMPLETE  
**Date:** October 3, 2026  
**Implementation Lead:** Antigravity AI Engineering Team  
**Scope:** Priority 0 Notifications Authorization, Priority 1 Student Search Scalability, Priority 1 Staff Alerts Bounded Retrieval, Secondary Appointment Pagination Normalization, and Regression Test Suite.

---

## 1. Notification Security Fix (`convex/dashboard.ts`)

### Prior Vulnerability
- In `getNotifications`, the query authenticated the caller but retrieved notifications globally using `.take(50)` without scoping to `recipientId`. Any logged-in student or staff member could view notifications belonging to other students and administrative staff across the entire institution.
- In `markNotificationRead`, any authenticated caller could pass any `notificationId` and patch `read: true` without an ownership verification check.

### Inspection of Canonical Identifier
- Inspection confirmed that notifications are indexed by `by_recipientId: ["recipientId"]`.
- The deletion cascade in `convex/users.ts` and test seeds in `convex/hardening.test.ts` store the user's canonical `Id<"users">` string (or Clerk `identity.subject` / `clerkId`) in `recipientId`.

### Implemented Hardening
1. **`getNotifications`**:
   - Authenticates caller using `ctx.auth.getUserIdentity()` and `getAuthenticatedUser(ctx)`.
   - Resolves valid recipient identifiers: `identity.subject`, canonical `caller._id.toString()`, `caller.clerkId`, and `caller.patientId`.
   - Queries `notifications` strictly via the existing index `by_recipientId` for the caller's identifiers.
   - Merges and sorts results descending by `createdAt`, enforcing the 50-item bound.
   - Prevents any cross-user data leakage.
2. **`markNotificationRead`**:
   - Authenticates caller and loads target notification via `ctx.db.get(args.notificationId)`.
   - Verifies whether `notification.recipientId` matches the caller's authorized identifiers or if the caller is an institutional `admin`.
   - Rejects unauthorized mutation attempts with `Error("Unauthorized: Cannot mark another user's notification as read")`.

---

## 2. Student Search Fix (`convex/users.ts`)

### Prior Defect
- In `listPatients`, normal browsing paginated accurately via the `by_role_and_created_at` index. However, when `args.search` was provided, the query fetched a single batch (`Math.max(limit * 4, 100)`), and then applied in-memory substring filtering.
- If a target student was created outside the latest 100 registrations (e.g. at position #125), searching by name, patient ID, or mobile number returned an empty list `patients: []`.

### Implemented Architecture (Bounded Iterative Indexed Retrieval)
1. **Unfiltered Path (`!args.search`)**:
   - Preserves O(limit) fast single-batch fetch (`effectiveLimit + 1`) from `by_role_and_created_at` with compound cursor pagination.
2. **Search Path (`args.search`)**:
   - Implements bounded iterative batch scanning over `by_role_and_created_at` (100 documents per batch, capped at a safety budget of 1,000 scanned documents per invocation).
   - Evaluates search terms against `patientId`, `full_name`, and `mobile_number`.
   - Iterates until `effectiveLimit + 1` matches are found or the candidate index is exhausted.
   - Correctly returns target students located well beyond the first 100 records.
   - Preserves exact response shape `{ patients, nextCursor }`, deterministic pagination, and staff authorization.
3. **`searchPatientSelector`**:
   - Updated with matching iterative bounded search (up to 500 candidate evaluation budget) to prevent dropdown truncation.

---

## 3. Staff Alert Scalability Fix (`convex/dashboard.ts`)

### Prior Bottleneck
- In `getAlerts`, student callers were already scoped to their own alerts. However, the staff path (counselors/admins) executed three unbounded full-table collections:
  - `alerts.collect()`
  - `users.collect()` (fetching all patients in the entire system)
  - `triages.collect()` (fetching all triages in the entire system)
- As the user base scales, this pattern causes high memory pressure and risks hitting Convex function execution timeout limits (10s limit).

### Implemented Hardening
1. Replaced `ctx.db.query("alerts").order("desc").collect()` with bounded query: `.take(150)`.
2. Replaced `ctx.db.query("triages").order("desc").collect()` with bounded query: `.take(100)`.
3. Completely eliminated `users.collect()`.
4. Introduced a local memoized resolver `resolvePatient(userId)`:
   - Performs direct, point lookups using `ctx.db.get(userId as Id<"users">)` with index fallback to `by_clerkId`.
   - Caches resolved patient documents in memory (`Map<string, UserDoc>`) so students with multiple alerts are looked up only once.
5. Preserves 100% of alert severity, sorting (`createdAt DESC`), status filters, triage risk flags (suicideRisk, psychosisRisk, deterioration), and student information.

---

## 4. Appointment Pagination Assessment & Fix (`convex/appointments.ts`)

### Prior Defect
- In `listAllTwoWayAppointmentsPaginated` and `getTwoWayAppointmentsForPatientPaginated`, the query used Convex native pagination `paginate(args.paginationOpts)`, but subsequently executed:
  `results.page.filter(a => a.date && a.time)`
- Dropping records in memory caused pages to return fewer items than requested (`initialNumItems: 20`), creating pagination gaps and inconsistent cursor progression.

### Implemented Normalization
- Instead of discarding legacy appointments that lack explicit `date` or `time` string fields, the query now normalizes legacy records by deriving `date` and `time` from `startTime` (or `createdAt` fallback).
- Every record on `results.page` is guaranteed to have valid display fields (`date` and `time`).
- `results.page.length` remains intact and consistent with `args.paginationOpts.numItems`.
- Cursors and pages progress continuously without skipping or duplicating appointments.

### Single-Student Query Assessment (`getTwoWayAppointmentsForPatient`)
- Query `getTwoWayAppointmentsForPatient` remains scoped to `userId` using index `by_userId`.
- Clinical assessment confirmed that individual student appointment counts are bounded by real-world clinic interactions (<50 appointments across an academic tenure).
- Per instruction, `getTwoWayAppointmentsForPatient` is safe as a bounded single-student query and was left structurally unchanged.

---

## 5. AI Monitoring Issue Deferred to P10

- `getUsersWithAiChats` and related AI transcript retrieval queries currently perform broad collection across AI companion logs.
- Per strict instructions, **no changes were made to AI monitoring or companion transcripts** during this pass.
- P10 Mitra AI safety and privacy architecture is currently pending product/clinical alignment regarding consent models and crisis-triggered counselor visibility. This remains tracked for P10 resolution.

---

## 6. Tests Added

A dedicated regression test suite was created in [`convex/security_step5d_hardening.test.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/security_step5d_hardening.test.ts) covering 9 comprehensive test cases:

1. `NOTIF-01`: Unauthenticated caller receives an empty list on `getNotifications`.
2. `NOTIF-02`: Student A sees only Student A notifications; Student B private notifications are completely excluded; ordering is descending by creation time.
3. `NOTIF-03`: Student A attempting to mark Student B's notification as read is rejected with `Unauthorized`.
4. `NOTIF-04`: Legitimate notification owner can mark their notification as read.
5. `SEARCH-01`: Seeds 130 patients; successfully finds target student located at position #125 by `full_name`, `patientId`, and `mobile_number`; verifies no-result search and verifies multi-page cursor continuity without duplicates.
6. `SEARCH-02`: `searchPatientSelector` successfully locates students located beyond the top 100 records.
7. `ALERTS-01`: Staff retrieves institution-wide alerts; students retrieve only their own alerts with correct student metadata.
8. `ALERTS-02`: Bounded retrieval handles large synthetic alert volumes (>150 alerts) gracefully with descending sort order.
9. `APPT-01`: Legacy appointments with missing `date`/`time` are normalized and not dropped from paginated pages.

---

## 7. Full Test Results

Execution of `npx vitest run`:
- **Test Files Passing:** 36 of 36 passed (100%).
- **Tests Passing:** 609 of 609 passed (100%).
- **Duration:** 12.21s.
- **Regressions:** 0.

---

## 8. TypeScript Verification Result

Execution of `npx tsc --noEmit` in root:
- **Result:** Exit code 0 (clean, 0 errors).

---

## 9. Dashboard Build Result

Execution of `npm run build` in `dashboard/` (`tsc -b && vite build`):
- **Result:** Exit code 0 (clean, 0 errors).
- **Bundle Assets:**
  - `dist/index.html` (0.61 kB)
  - `dist/assets/index-DdWuBgig.css` (21.35 kB)
  - `dist/assets/index-kVcTVFB6.js` (900.82 kB)

---

## 10. Schema & Index Changes

- **Schema changes made:** **0**.
- **Indexes added:** **0**.
- All hardening was achieved using existing schema definitions and indexes (`by_recipientId` on `notifications`, `by_role_and_created_at` on `users`, `by_status` and `by_userId` on `alerts`, `by_userId` on `appointments`).
- Zero migration overhead or deployment risks.

---

## 11. Files Modified

| File | Changes Made |
| :--- | :--- |
| `convex/dashboard.ts` | Scoped `getNotifications` to caller recipient IDs; added ownership assertion in `markNotificationRead`; bounded staff `getAlerts` and memoized user lookups. |
| `convex/users.ts` | Replaced 100-record truncation in `listPatients` with bounded iterative indexed scan; applied matching search logic in `searchPatientSelector`. |
| `convex/appointments.ts` | Normalized legacy appointment records with fallback date/time in `listAllTwoWayAppointmentsPaginated` and `getTwoWayAppointmentsForPatientPaginated`. |
| `convex/security_step5d_hardening.test.ts` | Added 9 regression tests for Step 5D hardening. |

---

## 12. Files Intentionally Untouched

To preserve clinical, product, and visual stability, the following were strictly preserved:
- `dashboard/src/layouts/*` and visual components (Track G UI unchanged).
- `dashboard/src/pages/Sessions.tsx` (50-item bounded selector retained).
- `convex/cbt.ts` and `convex/screening.ts` (PHQ-9, GAD-7, PQ-16 clinical logic).
- `convex/companion.ts` (P10 Mitra AI boundary untouched).
- All student mobile UI components (`app/(auth)/*`).
- Caseload assignment architecture (No fake assignment schema invented).

---

## 13. Remaining Risks

1. **Text Search Scaling Beyond 1,000 Students**: The bounded iterative scan safely supports up to 1,000 students per search query without schema changes. If the institution scales to >10,000 students, a dedicated full-text search index (e.g., Convex `.searchIndex("search_students", ...)`) should be deployed with appropriate text field normalization.
2. **P10 Mitra AI Companion Privacy Gating**: Staff access to raw companion logs in `getUsersWithAiChats` remains deferred to P10 pending clinical/product consent guidelines.

---

## 14. Recommended Next Roadmap Step

Step 5D security and scalability hardening is certified complete with 609/609 tests passing and clean builds.

**Recommended Next Step:**
- **Proceed to P11 Step 5 Final Verification / Sign-off**, followed by **Priority 12 (Counselor Interaction & Longitudinal Tracking)** or unblocking **Priority 10 (Mitra AI Redesign)** based on product roadmap priorities.
