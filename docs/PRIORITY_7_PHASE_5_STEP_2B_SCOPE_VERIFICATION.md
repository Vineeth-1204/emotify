# Priority 7 Phase 5 — Step 2B Scope Verification & Cleanup Report

**Date:** September 28, 2026  
**Status:** Scope Verified & Reverted — 12/12 Test Suites Passing (167/167 Tests)  
**Deliverable:** `PRIORITY_7_PHASE_5_STEP_2B_SCOPE_VERIFICATION.md`

---

## 1. Executive Summary & Purpose

During review of the Step 2B implementation, a scope boundary concern was identified:
The Step 2B implementation report noted that `convex/alerts.ts` modified both `getPending` and `getAll`. Because Step 2B strictly required counselor-facing visibility of active clinical safety alerts in `dashboard/src/pages/PatientDetail.tsx` (which consumes only `getPending`), an audit was conducted to determine whether changes to `getAll` were necessary or out of scope.

### Verification Outcome:
1. **`getPending` Scope Confirmed Necessary:** Retained canonical `users._id` and legacy `clerkId` resolution. `PatientDetail.tsx` queries `api.alerts.getPending` using the route parameter `id` (which may be a `clerkId` or a `users._id`). Cross-id resolution ensures that pending alerts stored under either format are matched and deduplicated without failure.
2. **`getAll` Scope Confirmed Unneeded & Reverted:** `PatientDetail.tsx` does **not** consume `api.alerts.getAll`. The Step 2B multi-id search loop in `getAll` was out of scope. `getAll` has been **reverted to its pre-Step 2B implementation** (`assertCanAccessStudent(ctx, targetUserId)` + single-index query).
3. **Zero Regressions:** Full test suite passes completely (167/167 tests across 12 files), TypeScript is clean (0 errors), and the counselor dashboard production build is clean (1.30s).

---

## 2. Detailed Audit of `convex/alerts.ts`

### Initial Diff Analysis:
The Step 2B initial implementation modified three queries/mutations in `convex/alerts.ts`:
1. `acknowledgeAlert`: Secured in Step 1A with `requireCounselorOrAdmin(ctx)` and `assertCanAccessStudent`. (Kept intact).
2. `getPending`: Added canonical `users._id` and `clerkId` multi-id lookup with deduplication. (Kept intact for `PatientDetail.tsx`).
3. `getAll`: Added identical multi-id lookup with deduplication. (Identified as out of scope).

### Dependency Check:
- Grep search for `api.alerts.getAll` across the entire codebase revealed:
  - `PatientDetail.tsx`: Does **NOT** call `api.alerts.getAll`.
  - `AlertsCenter.tsx`: Calls `api.dashboard.getAlerts` (a separate dashboard query).
  - Only test caller: `convex/provenance.test.ts:322`.
- Conclusion: `getAll` was not required for Step 2B.

---

## 3. Scope Cleanup Action

`convex/alerts.ts:getAll` was reverted to its clean, pre-Step 2B implementation:

```typescript
// RESTORED: convex/alerts.ts:getAll (Pre-Step 2B State)
/** Get all alerts for a user */
export const getAll = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const targetUserId = args.userId || identity.subject;
    await assertCanAccessStudent(ctx, targetUserId);

    return await ctx.db
      .query("alerts")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .collect();
  },
});
```

### Current Status of Functions in `convex/alerts.ts`:
| Function | Step 1A State | Step 2B State | Final Verified State | Rationale |
|---|---|---|---|---|
| `createAlert` | Untouched | Untouched | Untouched | Standard alert insertion |
| `acknowledgeAlert` | Secured (P0) | Untouched | Secured (P0) | Restricts alert acknowledgment to Counselors/Admins |
| `getPending` | Single-id query | Multi-id lookup | Multi-id lookup | Strictly required for `PatientDetail.tsx` canonical ID compatibility |
| `getAll` | Single-id query | Multi-id lookup | **Single-id query** | Reverted; out of scope for Step 2B |
| `getAlertProvenance` | Priority 4 | Untouched | Priority 4 | Provenance linkage intact |
| `getTriageAlerts` | Priority 4 | Untouched | Priority 4 | Provenance linkage intact |

---

## 4. Preservation of Invariants & Strict Boundaries

The cleanup verified that no unauthorized changes occurred:
- [x] **`PatientDetail.tsx` Active Alert Banner is intact:** Renders prominent active safety alerts, displays provenance IDs, provides "Alerts Center" navigation, and counselor acknowledgment button.
- [x] **`acknowledgeAlert` authorization is intact:** Enforces `requireCounselorOrAdmin(ctx)`.
- [x] **`convex/triage.ts:unblockPatient` was NOT modified.**
- [x] **`PatientDetail.tsx` current triage calculation (`latestTriage?.level`) was NOT modified.**
- [x] **Historical-risk / dual-indicator model was NOT implemented.**
- [x] **No clinical scoring or thresholds were modified.**
- [x] **No reassessment cadence or scheduling crons were implemented.**
- [x] **Priority 8 and Priority 9 were NOT started.**

---

## 5. Verification Results

### 1. Automated Vitest Suite:
Execution command: `npx vitest run`
- **Result:** **12 passed, 12 test files (167 passed, 167 tests)**
- **Duration:** 8.79s
- **Breakdown:**
  - `convex/priority7.test.ts`: 33 passed (including all 6 `ALERT-AUTH` and 8 `ALERT-VIS` tests).
  - `convex/auth.test.ts`: 10 passed.
  - `convex/screening.test.ts`: 17 passed.
  - `convex/hardening.test.ts`: 17 passed.
  - `convex/timeline.test.ts`: 20 passed.
  - `convex/authorization.test.ts`: 12 passed.
  - `convex/mitra_avatar.test.ts`: 20 passed.
  - `convex/dashboard_timeline.test.ts`: 12 passed.
  - `convex/provenance.test.ts`: 7 passed.
  - `convex/cbt.test.ts`: 2 passed.
  - `convex/authz.test.ts`: 9 passed.
  - `convex/longitudinal.test.ts`: 8 passed.

### 2. TypeScript Type Check:
Execution command: `npx tsc --noEmit`
- **Result:** **Exit Code 0 (0 errors across entire workspace)**

### 3. Counselor Dashboard Production Build:
Execution command: `npm run build --prefix dashboard`
- **Result:** **Exit Code 0 (Built in 1.30s)**

---

## 6. Final Scope Closure Assessment

Step 2B is now strictly scoped, verified, and closed:
- `getPending` contains only the identity compatibility needed by `PatientDetail.tsx`.
- `getAll` has been restored to its pre-Step 2B implementation.
- All 167 tests pass cleanly.

**HALTED AT STRICT STOP CONDITION.**  
Awaiting authorization before proceeding to subsequent steps.
