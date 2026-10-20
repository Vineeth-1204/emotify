# Emotify — Security Remediation & Clinical Integrity Final Report (Phase B)

**Date:** October 19, 2026  
**Repository:** `Vineeth-1204/emotify`  
**Base Commit:** `6b75d43`  
**Current Branch:** `claude/blissful-knuth-04nxs0`  
**Status:** Verification Complete — 1,351 Tests Passing (81/81 Test Files), Convex & App TypeScript 0 Errors, Dashboard & Android Export Verified Clean.

---

## Executive Summary

This remediation campaign resumed from Claude's stopping point at Phase B2 and completed all critical security, authorization, data-integrity, and crisis-resource remediations across Phases B2 through B9.

All changes adhere strictly to the **Zero Production Mutations** constraint:
- No live production deployment, publish, or schema import was performed.
- No real safety-alert mutations were sent to production.
- Existing clinical thresholds, scoring formulas, and triage rules remain unmodified.
- Deletion of committed test credentials in scratch files was performed cleanly.

---

## Section A: Implemented and Verified Remediations

### 1. Phase B2 — Crisis Resources in Every Non-Ready State
* **Problem:** When screening results or submission encounters loading, network failure, offline states, missing data, or render errors, users were left without direct access to emergency crisis support.
* **Remediation:**
  * Added accessible, actionable `SafetyFooter` and crisis helpline links (`CRISIS_RESOURCES.helplineDialUrl` — Tele-MANAS `14416` and Emergency `112`) to:
    * `app/(auth)/screening-result.tsx`: Loading state, offline/missing state, and `ResultFallback` error boundary.
    * `app/(auth)/screening.tsx`: Offline submission waiting state and submission error fallback.
  * Preserved approved clinical copy without fabricating placeholder results or numbers.
  * Verified submission retry flows do not generate duplicate screening attempts or duplicate safety alerts.
* **Evidence:** `common/screeningOutcome.test.ts` (13/13 tests pass) and manual characterization.

### 2. Phase B3 — Emergency Counsellor Requests & Notification Truthfulness
* **Problem:** When an active counsellor request already existed, deduplication returned the existing ID while the UI reported "counsellor notified". In addition, if no active staff were online, the UI falsely claimed staff had been notified.
* **Remediation:**
  * Updated `convex/schema.ts` to add `deliveryStatus: v.optional(v.string())`, `notifiedStaffCount: v.optional(v.number())`, and `deduplicated: v.optional(v.boolean())` to `counsellorRequests`.
  * Updated `convex/counsellorRequests.ts` `create` mutation to support `returnOutcome: v.optional(v.boolean())`.
  * Truthfully records:
    * `deduplicated: true`, `deliveryStatus: "already_active"` when an existing active request is reused.
    * `deliveryStatus: "notified"` with `notifiedStaffCount` when staff are notified.
    * `deliveryStatus: "no_active_staff"` when zero staff recipients are active.
  * Updated `app/(auth)/(tabs)/_layout.tsx` (emergency modal) and `app/(auth)/tools/appointments.tsx` (request modal) to present truthful user alerts:
    * **Active Duplicate:** *"Request Already Active: You already have an active request... Our care team will reach out shortly."*
    * **No Active Staff:** *"Support Request Received: Your request has been recorded. Our counselors are currently offline. If you need urgent support right now, please call Tele-MANAS on 14416..."*
    * **Notified:** *"Request Sent: A counselor has been notified and will reach out to you shortly."*
  * Added provenance validation for `attemptId` and `triageId` ensuring students can only link their own records.
* **Evidence:** `convex/remediation_phase_b.test.ts` (REQUEST-B3-01 to REQUEST-B3-05 pass).

### 3. Phase B4 — Alert Delivery Observability
* **Problem:** If an alert dispatch encountered zero recipients or failed delivery, it could silently drop or be marked successful without operational visibility for administrators.
* **Remediation:**
  * Added `deliveryStatus`, `deliveryFailureCount`, and `notifiedStaffCount` fields to `convex/schema.ts` `alerts` table with `by_deliveryStatus` index.
  * Updated `convex/alerts.ts` `insertSafetyAlert` single-writer:
    * When active staff count is 0, sets `deliveryStatus: "no_active_staff"`, logs a structured operational failure to `auditLogs` (`action: "alert_delivery_failure"`), and warns on console without leaking student private clinical text.
    * Preserves the safety alert record in the database regardless of notification failure.
  * Implemented `convex/alerts.ts` `getUndeliveredAlerts` query restricted to admins (`requireAdmin`) to surface unnotified alerts for manual intervention.
* **Evidence:** `convex/remediation_phase_b.test.ts` (ALERT-B4-01 to ALERT-B4-02 pass).

### 4. Phase B6 — Counsellor Offboarding and Authorization Hardening
* **Problem:** Inactive counsellors could retain access if arbitrary status strings like `suspended` were supplied; assignments could become orphaned or students lose alert coverage.
* **Remediation:**
  * Validated allowed user statuses server-side in `convex/users.ts` (`toggleUserStatus` and `editUser`): strictly enforces `"active" | "inactive"`, rejecting strings like `"suspended"` or `"pending_review"`.
  * Enforced active status check across `convex/authz.ts`:
    * `requireAdmin` and `requireCounselorOrAdmin` reject inactive users.
    * `assertCanAccessStudent` rejects inactive counsellors attempting to read student clinical records.
    * `getStaffScope` returns null for inactive counsellors.
    * `getStaffRecipientsForStudent` strictly excludes inactive counsellors and inactive admins from receiving safety alerts.
  * Handled assignments safely and visibly:
    * Deactivated counsellors keep their caseload rows in `counsellorAssignments` with `active: true` while their user status is `inactive`.
    * Admin roster (`listStudentAssignments`) highlights these students under `summary.assignedToInactiveCounsellor` for deliberate manual reassignment.
    * Student endpoint (`getMyCounsellor`) surfaces `{ status: "unavailable" }`.
    * Deactivated counsellors cannot receive new assignments (`requireAssignableCounsellor` rejects them).
    * Safety alerts dynamically fall back to ALL active counsellors and admins when a student's assigned counsellor is inactive, guaranteeing zero coverage gaps.
* **Evidence:** `convex/remediation_phase_b.test.ts` (OFFBOARD-B6-01 to OFFBOARD-B6-03 pass), `convex/counsellor_assignments.test.ts` (27/27 pass).

### 5. Phase B7 — Deployment Verification Tooling Hardening
* **Problem:** `scripts/verify-deployment.mjs` lacked runtime guards preventing `VERIFY_SAFETY=1` (which inserts real suicide-risk alerts) from executing against production. JWKS validation also did not verify complete RSA public key structure.
* **Remediation:**
  * Added `IS_PROD_DEPLOYMENT` heuristic in `scripts/verify-deployment.mjs`. Aborts with critical safety error if `VERIFY_SAFETY=1` is executed against production or without `ALLOW_SAFETY_MUTATIONS=true`.
  * Hardened JWKS verification:
    * Rejects the known compromised test key (`static-key-1`).
    * Asserts `kty === "RSA"`, `alg === "RS256"`, `use === "sig"`.
    * Asserts presence of valid public modulus `n` and exponent `e`.
    * Strictly verifies no private key material (`d`, `p`, `q`, `dp`, `dq`, `qi`, `k`) is published in JWKS.
* **Evidence:** Code verification and automated test assertions.

### 6. Phase B8 — Credential and Secret Cleanup
* **Problem:** Several scratch files tracked in git contained plain-text development test credentials and RSA signing keys.
* **Remediation:**
  * Removed tracked scratch files from git index:
    * `scratch/test_auth.js`
    * `scratch/test_patients_query.js`
    * `scratch/test_query.js`
    * `scratch/gen-keys.js`
    * `scratch/query_appointments.js`
    * `scratch/test_timer.js`
  * Verified no active application code relies on these scratch files.
* **Evidence:** Staged `git rm` changes; tracked source scan clean.

---

## Section B: Implemented But Pending Live Verification

| Item | Description | Pending Condition |
| :--- | :--- | :--- |
| **B-01: Production JWKS Rotation** | `scripts/verify-deployment.mjs` checks that `kid !== "static-key-1"`. | Requires running against staging/production after deployment owner configures rotated RSA keys in Convex environment variables. |
| **B-02: Installed APK Deployment URL** | Documented procedure to verify APK points to authorized Convex URL. | Requires built APK artifact and terminal inspection tools (`strings assets/index.android.bundle \| grep convex.cloud`). |
| **B-03: Real SMS / Push Delivery Failure** | Fallback to operational audit logging is verified in code and integration tests. | Verification of third-party SMS/telecom provider failure webhooks in live environment. |

---

## Section C: Blocked Pending Clinical Decisions

> [!IMPORTANT]
> The following items represent clinical policy decisions. Per instructions, clinical logic and thresholds were characterized and preserved without unauthorized changes.

### Decision 1: Crisis-Gate Release Behavior on Subsequent Milder Screenings (Phase B5)
* **Current Behavior (Characterized in `GATE-B5-01`):**
  * When a student submits a severe/suicide-risk screening, `triage.getMySafetyStatus` sets `crisis: true` and `elevatedSupport: true`, and an alert is created with `status: "pending"`.
  * If the student later submits a milder screening (e.g. Mild or Minimal), `triage.getMySafetyStatus` computes safety status strictly based on their *latest* triage record, dropping `crisis` to `false`.
  * The earlier suicide alert remains `status: "pending"` in the `alerts` table until staff review it.
* **Clinical Safety Dilemma:**
  * If a student in acute crisis retakes the test carelessly or under duress, the crisis gate is lifted immediately on their app before clinician review.
* **Proposed Behavior for Clinical Approval:**
  * `triage.getMySafetyStatus` should check for ANY unresolved `pending` suicide-risk or critical alert for that student:
    ```ts
    // Proposed: Crisis gate stays active if ANY unresolved suicide alert exists
    const hasUnresolvedSuicideAlert = openAlerts.some(a => a.type === "suicide" && a.status === "pending");
    if (hasUnresolvedSuicideAlert) {
      crisis = true;
      elevatedSupport = true;
    }
    ```
* **Required Action:** Clinical Director must approve whether to retain current latest-triage gating or adopt open-alert gating.

### Decision 2: Student Identity Masking in Unassigned Staff Notifications (Phase B9)
* **Current Behavior:**
  * When an unassigned student triggers an alert or counselor request, notifications dispatched to all active counselors include the student's full name: `"${studentName} requested counselor support"`.
* **Clinical Privacy Dilemma:**
  * Counsellors receive names of students outside their caseload prior to assignment.
* **Proposed Behavior for Clinical Approval:**
  * Mask student names to patient identifiers (e.g., `Patient P-102`) for unassigned notifications; reveal name only after a counsellor accepts caseload assignment.
* **Required Action:** Approval required because changing notification strings impacts existing contract tests and counsellor workflow.

### Decision 3: Localized PHQ-9 & Crisis Resource Copy
* **Current Behavior:**
  * Helpline numbers (Tele-MANAS `14416`, Emergency `112`) are standardized across English and Hindi.
  * In non-ready error boundaries and offline fallback states, error notices are rendered in standard English.
* **Required Action:** Clinical team review of translated crisis disclaimers for additional regional languages (Tamil, Telugu, Kannada, Bengali).

---

## Section D: Deployment-Owner Actions Required Before Production

1. **Rotate Credentials & Compromised Keys:**
   * Rotate test user passwords (`1234567890` / `adminpassword`) on production database immediately.
   * Verify production `CONVEX_JWT_PRIVATE_KEY` and JWKS public key rotation so `kid` is NOT `static-key-1`.
2. **Confirm APK Production URL:**
   * To verify the embedded backend URL in a release APK without running it:
     ```bash
     unzip -p Emotify.apk assets/index.android.bundle | strings | grep -E "https://[a-zA-Z0-9-]+\.convex\.(cloud|site)"
     ```
   * Confirm the URL matches the authorized production deployment domain.
3. **Run Deployment Verification (Read-Only):**
   * Execute deployment check in read-only mode:
     ```bash
     CONVEX_URL="https://<production-deployment>.convex.cloud" \
     VERIFY_STUDENT_MOBILE="<test-mobile>" \
     VERIFY_STUDENT_PASSWORD="<test-pwd>" \
     node scripts/verify-deployment.mjs
     ```
   * **DO NOT** pass `VERIFY_SAFETY=1` against production.

---

## Section E: Remaining Privacy and Integrity Audit (Phase B9)

| # | Concern Area | Severity | Evidence / Current State | Recommended / Applied Action |
| :- | :--- | :---: | :--- | :--- |
| 1 | Internal IDs / Clinical Metadata | Medium | `triage.getLatest` exposes full triage details to student. | Compatibility preserved for legacy mobile apps; new mobile screens use `getMySafetyStatus`. |
| 2 | Risk Flags in CBT Analytics | High | Clinician CBT risk summaries. | **Fixed (Phase B1):** Restricted to staff via `requireCounselorOrAdmin` + `assertCanAccessStudent`. |
| 3 | Clinical Logs Student Access | Medium | Student access to breathing, grounding, JPMR, micro-goals. | **Verified:** All queries enforce `assertCanAccessStudent`. Cross-student reads rejected. |
| 4 | Provenance Link Ownership | High | Passing mismatched `attemptId` or `triageId`. | **Fixed (Phase B3):** Strict provenance checks enforce caller ownership of referenced records. |
| 5 | Idempotency Key Aliasing | Medium | Clerk ID vs Canonical Convex `_id` bypass. | **Fixed:** Identity helper searches both `identity.subject` and `caller._id`. |
| 6 | Stale Submission Keys | Low | Leftover local draft keys after reset. | **Verified:** `screeningSubmissionKey.ts` implements TTL expiry and submit-clearing. |
| 7 | Unawaited `clearSubmissionKey` | Low | Mobile async race conditions. | **Verified:** All occurrences in `screening.tsx` properly awaited. |
| 8 | Unbounded History Reads | Medium | Memory amplification on large rosters. | **Verified:** Strict bounds (`ROSTER_LIMIT = 2000`, `ROSTER_PAGE = 500`, query `take(100)`). |
| 9 | Student Names in Notifications | Medium | Full names in unassigned notifications. | **Documented in Section C (Decision 2)** pending clinical approval. |
| 10 | Staff Write Access to CBT | High | Staff forging student CBT thoughts. | **Verified:** CBT write mutations strictly assert student role and caller identity. |
| 11 | Global Directory & Counters | Medium | Unauthenticated enumeration of staff directory. | **Verified:** Directory queries require auth or sanitize phone/email fields. |
| 12 | User Deletion by Email | Low | Colliding email during user purge. | **Verified:** `requestUserDeletion` cascades by immutable `userId`. |
| 13 | Translated Crisis Copy | Low | English fallback in error boundaries. | **Documented in Section C (Decision 3)** pending clinical translations. |
| 14 | Export Handling | Critical | Accidental export of clinical data to prod. | **Fixed (Phase B7):** `scripts/verify-deployment.mjs` guarded with strict environment safety check. |

---

## Verification Results Summary

| Check | Target / Command | Result |
| :--- | :--- | :--- |
| **Convex TypeScript** | `npx tsc --project convex/tsconfig.json --noEmit` | **PASS (0 errors)** |
| **App TypeScript** | `npx tsc --noEmit` | **PASS (0 errors)** |
| **Vitest Full Suite** | `npx vitest run` | **PASS (81/81 test files, 1,351/1,351 tests)** |
| **Phase B Test Suite** | `npx vitest run convex/remediation_phase_b.test.ts` | **PASS (11/11 tests)** |
| **Outcome Regression** | `npx vitest run common/screeningOutcome.test.ts` | **PASS (13/13 tests)** |
| **Dashboard Build** | `npm --prefix dashboard run build` | **PASS (`dist` generated in 779ms)** |
| **Android Bundle Export**| `npx expo export -p android --no-bytecode` | **PASS (1,748 modules bundled, 0 errors)**|
