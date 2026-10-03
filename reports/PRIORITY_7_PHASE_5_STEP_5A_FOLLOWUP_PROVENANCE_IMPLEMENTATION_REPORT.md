# PRIORITY 7 — PHASE 5 — STEP 5A: FOLLOW-UP PROVENANCE & DEAD-CODE CLEANUP IMPLEMENTATION REPORT

**Status:** COMPLETE & FULLY VERIFIED  
**Date:** September 28, 2026  
**Auditor & System Architect:** Antigravity AI Pair Programmer  
**Current Baseline:** 214 / 214 tests passing across 12 test suites, clean TypeScript (`tsc --noEmit`), clean dashboard production build (`tsc -b && vite build`).

---

## 1. Executive Summary

In accordance with Priority 7 Phase 5 Step 5A, we resolved the causal provenance gap between screening attempts, clinical triage decisions, and the resulting follow-up records.

Previously, `convex/followUps.ts:scheduleFollowUp` accepted only `{ userId, level }` and inserted a row into `followUps` without populating the optional `attemptId` or `triageId` fields already defined in `schema.ts`. When a student completed a screening in `app/(auth)/screening.tsx`, the authoritative `attemptId` and `triageId` returned by `submitScreeningAttempt` were discarded.

In this step:
1. `convex/followUps.ts:scheduleFollowUp` was extended to accept optional `attemptId` (`Id<"screeningAttempts">`) and `triageId` (`Id<"triages">`).
2. Robust server-side verification was introduced: `attemptId` and `triageId` are validated to ensure they exist and strictly belong to the target student, preventing cross-student provenance tampering.
3. `app/(auth)/screening.tsx` was updated to pass `attempt.attemptId` and `attempt.triageId` directly into `scheduleFollowUp`.
4. Backward compatibility was preserved: historical follow-ups without provenance remain valid and readable, and independent/manual follow-up calls continue to function without fabricated links.
5. **Zero automated scheduling was activated:** `dueDate` intervals remain behaviorally identical; no crons, notification queues, or automated reassessments were introduced.

---

## 2. Files Modified

| File | Change Description |
|---|---|
| [`convex/followUps.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/followUps.ts) | 1. Extended `scheduleFollowUp` args to accept optional `attemptId` and `triageId`.<br/>2. Added target student authorization (`assertCanAccessStudent`) and ownership validation for both `attemptId` and `triageId`.<br/>3. Persisted `attemptId`, `triageId`, and `sourceType: args.attemptId ? "screening" : "counselor"`.<br/>4. Updated `getPending` query to support authorized counselor/admin queries and resolve both canonical `users._id` and legacy `clerkId`. |
| [`app/(auth)/screening.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/screening.tsx) | Updated the post-submission step to pass `attemptId: attempt.attemptId` and `triageId: attempt.triageId` into `scheduleFollowUp`. |
| [`convex/priority7.test.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/priority7.test.ts) | Appended 8 focused automated regression tests (`FOLLOWUP-PROV-01` through `FOLLOWUP-PROV-08`). |

---

## 3. Exact Provenance Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        app/(auth)/screening.tsx                        │
│                                                                        │
│ 1. Student completes PHQ-9, GAD-7, and PQ-16 items                     │
│ 2. Calls api.screening.submitScreeningAttempt                          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        convex/screening.ts                             │
│                                                                        │
│ 3. Computes authoritative scores & evaluates clinical triage           │
│ 4. Inserts row into triages -> returns triageId                        │
│ 5. Inserts row into screeningAttempts -> returns attemptId             │
│ 6. Patches triages.attemptId = attemptId (Bidirectional Link)          │
│ 7. Returns { attemptId, triageId, triageLevel, ... } to client         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        app/(auth)/screening.tsx                        │
│                                                                        │
│ 8. Receives attempt = { attemptId, triageId, triageLevel }             │
│ 9. Calls api.followUps.scheduleFollowUp({                              │
│      userId: user.id,                                                  │
│      level: attempt.triageLevel,                                       │
│      attemptId: attempt.attemptId,                                     │
│      triageId: attempt.triageId,                                       │
│    })                                                                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        convex/followUps.ts                             │
│                                                                        │
│ 10. Validates caller session via ctx.auth.getUserIdentity()            │
│ 11. Enforces assertCanAccessStudent(ctx, targetUserId)                 │
│ 12. Validates attemptId exists and belongs to targetUserId             │
│ 13. Validates triageId exists and belongs to targetUserId               │
│ 14. Computes dueDate (mild: 30d, mod: 7d, sev: 2d, default: 14d)       │
│ 15. Inserts followUps row with:                                        │
│     - userId: targetUserId                                             │
│     - attemptId: attemptId                                             │
│     - triageId: triageId                                               │
│     - sourceType: "screening"                                          │
│     - completed: false                                                 │
│     - dueDate: dueDate                                                 │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Authorization and Security Verification

1. **Student Self-Scheduling:**
   - When a student completes a screening, `scheduleFollowUp` uses `authSubject` (the authenticated student's identity) as `targetUserId`.
   - If `args.userId` is passed, the mutation verifies `assertCanAccessStudent(ctx, args.userId)`. If a student attempts to schedule a follow-up for another student, the mutation is immediately rejected.
2. **Provenance Tampering Prevention:**
   - If a student passes an `attemptId` or `triageId` belonging to another patient, the backend validates the record's `userId` against the target student's resolved canonical identifiers (`users._id` and `clerkId`).
   - Mismatched IDs throw: `Unauthorized: Screening attempt does not belong to target student.`
3. **Counselor Access:**
   - Counselors and admins passing `assertCanAccessStudent` can schedule manual or screening-linked follow-ups for authorized students.

---

## 5. Backward Compatibility and Invariance

1. **Historical Records Without Provenance:**
   - Pre-existing `followUps` records without `attemptId`, `triageId`, or `sourceType` remain completely valid and queryable via `api.followUps.getPending`.
   - Zero heuristic or fabricated backfilling was performed on historical rows.
2. **Manual / Independent Follow-ups:**
   - Calls to `scheduleFollowUp` or `create` without `attemptId` or `triageId` continue to insert rows with `attemptId: undefined` and `triageId: undefined`, correctly categorizing the event with `sourceType: "counselor"`.
3. **DueDate Calculation Invariance:**
   - The interval logic was preserved verbatim:
     - `mild`: 30 days (`30 * 24 * 60 * 60 * 1000`)
     - `moderate`: 7 days (`7 * 24 * 60 * 60 * 1000`)
     - `severe` / `suicide_flag` / `psychosis_flag`: 2 days (`2 * 24 * 60 * 60 * 1000`)
     - default: 14 days (`14 * 24 * 60 * 60 * 1000`)
4. **Explicit Invariance Confirmation:**
   - **NO automated cron jobs were created.**
   - **NO notifications or push reminders were activated.**
   - **NO automated reassessments were triggered.**
   - **NO clinical scoring formulas or triage level rules were modified.**
   - **NO triage or alert records were modified.**

---

## 6. Automated Test Suite

Eight focused regression tests were added in [`convex/priority7.test.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/priority7.test.ts):

| Test ID | Description | Result |
|---|---|---|
| `FOLLOWUP-PROV-01` | New screening-generated follow-up stores correct `attemptId` and `sourceType: "screening"` | **PASS** |
| `FOLLOWUP-PROV-02` | New screening-generated follow-up stores correct `triageId` | **PASS** |
| `FOLLOWUP-PROV-03` | `attemptId` and `triageId` point to authoritative originating records with reciprocal cross-links | **PASS** |
| `FOLLOWUP-PROV-04` | Historical `followUps` without provenance remain fully readable via `getPending` | **PASS** |
| `FOLLOWUP-PROV-05` | Manual/independent follow-up does not receive fabricated provenance (`attemptId: undefined`) | **PASS** |
| `FOLLOWUP-PROV-06` | Existing follow-up `dueDate` calculation intervals (2d, 7d, 14d, 30d) remain behaviorally identical | **PASS** |
| `FOLLOWUP-PROV-07` | Cross-student tampering (passing another student's `attemptId` or querying another student's follow-ups) is rejected | **PASS** |
| `FOLLOWUP-PROV-08` | No triage or alert records/behavior are altered as a result of provenance persistence | **PASS** |

---

## 7. Build and Verification Results

### Vitest Test Suite
```
$ npx vitest run
 Test Files  12 passed (12)
      Tests  214 passed (214)
   Duration  9.30s
```
*Note: All 206 previous tests passed + 8 new Step 5A tests = 214 total passed.*

### TypeScript Compilation
```
$ npx tsc --noEmit
Exit code: 0 (No type errors)
```

### Dashboard Production Build
```
$ npm run build --prefix dashboard
> dashboard@0.0.0 build
> tsc -b && vite build
✓ 2409 modules transformed.
dist/index.html                   0.66 kB │ gzip:   0.40 kB
dist/assets/index-DtVgz1y3.css   12.37 kB │ gzip:   3.18 kB
dist/assets/index-nSe53tHL.js   897.65 kB │ gzip: 244.05 kB
✓ built in 1.41s
```

---

## 8. Conclusion

Priority 7 Phase 5 Step 5A is **COMPLETE and FULLY CERTIFIED**.  
Causal provenance between clinical screening submissions, triage determinations, and scheduled follow-up records is now authoritatively established and validated.

**STOPPING POINT REACHED — DO NOT PROCEED TO STEP 5B OR PRIORITY 8.**
