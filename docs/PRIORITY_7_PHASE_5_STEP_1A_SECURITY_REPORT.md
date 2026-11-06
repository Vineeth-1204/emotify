# Priority 7 Phase 5 — Step 1A Security Implementation Report
**Security Hardening: Clinical Alert Acknowledgment Authorization**

**Date:** September 28, 2026  
**Status:** Complete & Verified — All 12/12 Test Suites Passing (159/159 Tests)  
**Deliverable:** `PRIORITY_7_PHASE_5_STEP_1A_SECURITY_REPORT.md`

---

## 1. Vulnerability Addressed

- **Vulnerability Identifier:** P0 Security / Clinical Safety Defect (`ALERT-AUTH-VULN`)
- **Target File & Function:** `convex/alerts.ts:acknowledgeAlert`
- **Description:** Previous implementation allowed the student who generated a clinical safety alert (e.g. from acute suicidal ideation PHQ-9 item 9 or severe psychosis risk) to acknowledge and dismiss their own alert without counselor or administrative intervention.
- **Clinical & Security Risk:** Crisis safety protocols require licensed clinician or authorized staff triaging and intervention. Allowing patients to self-dismiss crisis alerts from client devices creates extreme liability, potential suppression of life-safety alerts, and circumvention of emergency outreach.

---

## 2. Root Cause

In the original code for `convex/alerts.ts:acknowledgeAlert`:

```typescript
// BEFORE: Faulty authorization gate
const alert = await ctx.db.get(args.alertId);
if (!alert) throw new Error("Alert not found");

if (alert.userId !== identity.subject) {
  const user = await getAuthenticatedUser(ctx);
  if (!user || (user.role !== "admin" && user.role !== "counsellor")) {
    throw new Error("Unauthorized: Cannot acknowledge alert for another user.");
  }
}
```

When `alert.userId === identity.subject` (the caller is the student who owns the alert), the condition `alert.userId !== identity.subject` evaluated to `false`. Execution bypassed the role check entirely, proceeding directly to `ctx.db.patch(args.alertId, { status: "acknowledged", acknowledgedAt: Date.now() })`.

---

## 3. Exact Files / Functions Modified

### 1. `convex/alerts.ts`
- **Function:** `acknowledgeAlert`
- **Change:**
  - Removed flawed self-ownership bypass.
  - Imported and invoked centralized `requireCounselorOrAdmin(ctx)` from `convex/authz.ts`.
  - Added `assertCanAccessStudent(ctx, alert.userId)` to enforce student access rules under the counselor/admin authorization architecture.
  - Ensured provenance fields (`attemptId`, `triageId`, `userId`, `type`, `createdAt`) are 100% immutable and preserved.

```typescript
// AFTER: Hardened authorization gate
import { assertCanAccessStudent, requireCounselorOrAdmin } from "./authz";

/** Acknowledge an alert (Counselor or Admin only) */
export const acknowledgeAlert = mutation({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, args) => {
    await requireCounselorOrAdmin(ctx);

    const alert = await ctx.db.get(args.alertId);
    if (!alert) throw new Error("Alert not found");

    await assertCanAccessStudent(ctx, alert.userId);

    await ctx.db.patch(args.alertId, {
      status: "acknowledged",
      acknowledgedAt: Date.now(),
    });
  },
});
```

### 2. `convex/priority7.test.ts`
- **Change:** Added automated regression test suite covering all required authorization and provenance cases (`ALERT-AUTH-01` through `ALERT-AUTH-06`).

---

## 4. Authorization Behavior Before vs After

| Caller Role & Scenario | Behavior Before Hardening | Behavior After Hardening | Verdict |
|---|---|---|---|
| **Unauthenticated caller** | Rejected (`Unauthenticated`) | Rejected (`Unauthenticated: Login required.`) | **SECURED** |
| **Student A on Student A's Alert** | **ALLOWED (VULNERABILITY)** | **REJECTED** (`Unauthorized: Counselor or Admin access required.`) | **FIXED** |
| **Student A on Student B's Alert** | Rejected (`Unauthorized`) | **REJECTED** (`Unauthorized: Counselor or Admin access required.`) | **SECURED** |
| **Counselor on Student A's Alert** | Allowed | **ALLOWED** (`status: "acknowledged"`) | **PRESERVED** |
| **Admin on Student A's Alert** | Allowed | **ALLOWED** (`status: "acknowledged"`) | **PRESERVED** |
| **Alert Provenance (`attemptId`, `triageId`)** | Untracked verification | **VERIFIED PRESERVED** (100% immutable across patch) | **VERIFIED** |

---

## 5. Tests Added

Six automated regression tests were implemented in `convex/priority7.test.ts`:

1. **`ALERT-AUTH-01`:** Unauthenticated caller attempts `acknowledgeAlert` → **REJECTED** (`/Unauthenticated/`).
2. **`ALERT-AUTH-02`:** Student A attempts to acknowledge Student A's clinical alert → **REJECTED** (`/Counselor or Admin access required/`).
3. **`ALERT-AUTH-03`:** Student A attempts to acknowledge Student B's clinical alert → **REJECTED** (`/Counselor or Admin access required/`).
4. **`ALERT-AUTH-04`:** Counselor Clara acknowledges Student A's alert → **ALLOWED** (Alert status updated to `"acknowledged"`, timestamp recorded).
5. **`ALERT-AUTH-05`:** Admin acknowledges Student A's alert → **ALLOWED** (Alert status updated to `"acknowledged"`, timestamp recorded).
6. **`ALERT-AUTH-06`:** Existing alert provenance remains unchanged after counselor/admin acknowledgment → **VERIFIED** (`attemptId`, `triageId`, `createdAt`, `userId`, `type` completely intact).

---

## 6. Full Test Results

Execution command: `npx vitest run`

```
 ✓ convex/longitudinal.test.ts (8 tests) 452ms
 ✓ convex/authz.test.ts (9 tests) 479ms
 ✓ convex/cbt.test.ts (2 tests) 489ms
 ✓ convex/provenance.test.ts (7 tests) 507ms
 ✓ convex/mitra_avatar.test.ts (20 tests) 511ms
 ✓ convex/dashboard_timeline.test.ts (12 tests) 540ms
 ✓ convex/authorization.test.ts (12 tests) 552ms
 ✓ convex/timeline.test.ts (20 tests) 566ms
 ✓ convex/hardening.test.ts (17 tests) 580ms
 ✓ convex/priority7.test.ts (25 tests) 561ms
 ✓ convex/screening.test.ts (17 tests) 768ms
 ✓ convex/auth.test.ts (10 tests) 2026ms

 Test Files  12 passed (12)
      Tests  159 passed (159)
   Start at  07:02:04
   Duration  8.85s
```

All 12 test files passed; all 159 tests passed cleanly without any regressions.

---

## 7. TypeScript Compilation Result

Execution command: `npx tsc --noEmit`

- **Exit Code:** 0
- **Errors:** 0 errors across frontend mobile app, backend Convex functions, and shared libraries.

---

## 8. Dashboard Build Result

Execution command: `npm run build --prefix dashboard`

- **Exit Code:** 0
- **Build Output:**
  ```
  > dashboard@0.0.0 build
  > tsc -b && vite build

  vite v8.0.13 building client environment for production...
  transforming...✓ 2409 modules transformed.
  rendering chunks...
  dist/index.html                   0.66 kB │ gzip:   0.40 kB
  dist/assets/index-DtVgz1y3.css   12.37 kB │ gzip:   3.18 kB
  dist/assets/index-Cdja0DNX.js   890.41 kB │ gzip: 242.77 kB
  ✓ built in 1.23s
  ```

---

## 9. Manual QA Verification

1. **Student Login & Alert Isolation:**
   - Authenticated student sessions have zero ability to transition alerts out of `"pending"` status.
   - Any invocation of `acknowledgeAlert` from a patient context fails with an explicit authorization error.
2. **Counselor & Admin Resolution:**
   - Clinicians authenticated with role `"counsellor"` or `"admin"` successfully acknowledge alerts.
   - Alert timestamps (`acknowledgedAt`) and status (`"acknowledged"`) are cleanly persisted.
3. **Provenance Integrity:**
   - Provenance links (`attemptId` and `triageId`) linking alerts to their causal screening attempts remain untouched during status updates.
4. **Dashboard Safety & Stability:**
   - Counselor dashboard emergency queues in `dashboard/src/pages/AlertsCenter.tsx` operate seamlessly with no breaking changes.
5. **Student Experience Continuity:**
   - Student mobile flows do not invoke `acknowledgeAlert` internally; mobile app stability is completely unaffected by this restriction.

---

## 10. Confirmation of Safety Constraints

- [x] **`triage.ts:unblockPatient` was NOT modified.** Premature alert resolution during force retests remains untouched pending clinical policy decisions.
- [x] **Historical-risk UI was NOT modified.** `PatientDetail.tsx` and risk banner styling remain untouched pending clinical approval of the dual-indicator model.
- [x] **No clinical scoring or thresholds were modified.** PHQ-9, GAD-7, and PQ-16 logic remain identical.
- [x] **No reassessment cadence or scheduling crons were implemented.**
- [x] **No wellness or insights calculations were modified.**
- [x] **Priority 8 and Priority 9 work was NOT started.**

---

## 11. Strict Stop & Ready for Review

In compliance with instructions, implementation is halted at this step. No further modifications will be made until this security report is reviewed and the next phase is explicitly authorized.
