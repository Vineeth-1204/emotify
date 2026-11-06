# EMOTIFY — PRIORITY 7 IMPLEMENTATION REPORT
## PHASES 1–4: SECURITY, EMOTION DOMAIN NORMALIZATION, SOMATIC TRACKING & REASSESSMENT INTEGRITY

**Date:** September 28, 2026  
**Reference Audit:** [`PRIORITY_7_STEP_1_EMOTION_AND_REASSESSMENT_AUDIT.md`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/PRIORITY_7_STEP_1_EMOTION_AND_REASSESSMENT_AUDIT.md)  
**Execution Scope:** Phases 1–4 strictly implemented. Cadence/scheduling crons, 14/30-day clinical rules, Priority 8, and Priority 9 intentionally excluded pending clinical/product review.

---

## EXECUTIVE SUMMARY

Phases 1 through 4 of Priority 7 have been successfully implemented and verified across the entire Emotify codebase. All critical P0 security vulnerabilities identified in the audit (`convex/insights.ts:getDailyStats` authorization leak and `convex/screening.ts:submitScreeningAttempt` identity fallback vulnerability) were resolved with zero weakening of existing Priority 4 authorization invariants.

The emotion domain architecture was unified: `dailyCheckins` is now established as the single, authoritative state for daily mood check-ins (with client-local date handling across all timezones including IST), eliminating competing shadow writes to `emotionLogs`. The Mitra Companion "Daily Mood" modal was refactored to write directly to `dailyCheckins`. Somatic tracking (`emotionMaps`) now strictly validates 1–10 intensity scores, enforces cross-student isolation, and cleanly integrates into the longitudinal clinical timeline under the `monitoring` category filter while suppressed from default triage views. Reassessment integrity is now guaranteed with deterministic server-side `attemptType` assignment (`baseline`, `reassessment`, `force_retest`), and `getLatest` / `getLatestAttempt` queries are secured against hiding completed screenings behind abandoned or in-progress attempts.

Across the entire test suite, **12/12 test files passed (153/153 tests passing)**, TypeScript compilation passed with **0 errors**, and the counselor dashboard production build compiled cleanly.

---

## 1. AUDIT FINDINGS ADDRESSED

| Finding ID | Audit Finding | Phase | Status | Resolution Summary |
|---|---|---|---|---|
| **P0-SEC-01** | `convex/insights.ts:getDailyStats` allowed unauthenticated callers and lacked cross-student authorization gating. | Phase 1 | **IMPLEMENTED & VERIFIED** | Added mandatory `assertCanAccessStudent(ctx, targetUserId)`. Unauthenticated requests rejected; Student A cannot access Student B; counselor and admin access authorized. |
| **P0-SEC-02** | `convex/screening.ts:submitScreeningAttempt` trusted `args.userId` as an identity fallback without verifying caller identity. | Phase 1 | **IMPLEMENTED & VERIFIED** | Removed untrusted fallback. Enforced that `identity.subject` is authoritative. Forged `userId` attempts reject unauthenticated or unauthorized callers. |
| **ARCH-NORM-01** | Client-side `toISOString().split('T')[0]` caused UTC/IST midnight date shift bugs on check-ins. | Phase 2 | **IMPLEMENTED & VERIFIED** | Created `utils/date.ts` with `getLocalDateString(date)` using client device calendar date (`YYYY-MM-DD`) and `isValidCheckinDateStr(dateStr)`. |
| **ARCH-NORM-02** | Student Home daily check-in created shadow duplicate entries in `emotionLogs`. | Phase 2 | **IMPLEMENTED & VERIFIED** | Removed shadow writes to `emotionLogs` from `handleCheckInSubmit` and `handleInlineCheckIn`. Daily check-in writes exclusively to `dailyCheckins`. |
| **ARCH-NORM-03** | Companion Chat "Daily Mood" created competing daily records in `emotionLogs`. | Phase 2 | **IMPLEMENTED & VERIFIED** | Routed Companion "Daily Mood" prompt to `submitMorningCheckin` using `getLocalDateString()`, eliminating competing daily mood tables. |
| **PERF-IDX-01** | `dailyCheckins` lacked a single-field `by_userId` index for chronological timeline queries, forcing full table scans. | Phase 2 | **IMPLEMENTED & VERIFIED** | Added `by_userId` index to `dailyCheckins` schema; updated `convex/timeline.ts` query to use indexed retrieval. |
| **SOMATIC-01** | `emotionMaps.getRecentLogs` lacked cross-student authorization and returned counselor's own logs when requesting student data. | Phase 3 | **IMPLEMENTED & VERIFIED** | Refactored `getRecentLogs` to resolve `targetUserId` and assert caller permissions via `assertCanAccessStudent`. |
| **SOMATIC-02** | `emotionMaps.create` lacked 1–10 intensity boundary checks, permitting 0, negative, and >10 intensities. | Phase 3 | **IMPLEMENTED & VERIFIED** | Added server-side validation enforcing `1 <= intensity <= 10` on all `bodyRatings` items and `averageIntensity`. |
| **SOMATIC-03** | Somatic tracking was disconnected from counselor timeline visibility. | Phase 3 | **IMPLEMENTED & VERIFIED** | Integrated `emotionMaps` into `convex/timeline.ts` under `category: "monitoring"`, `eventType: "emotion_map"`. Suppressed by default; visible under monitoring filter. |
| **REASSESS-01** | `screeningAttempts` had no attempt classification enum (`baseline` vs `reassessment` vs `force_retest`). | Phase 4 | **IMPLEMENTED & VERIFIED** | Added `attemptType` enum validator to schema; computed deterministically on server from screening history and prior triage state. |
| **REASSESS-02** | Abandoned or `in_progress` screening attempts could mask the latest completed screening attempt. | Phase 4 | **IMPLEMENTED & VERIFIED** | Updated `getLatestAttempt` and `getLatest` to explicitly filter for `status === "completed"`. Added `getLatestRawAttempt` for incomplete inspect/resume. |
| **REASSESS-03** | Risk of overwriting past screening scores or resolving active alerts during reassessments. | Phase 4 | **IMPLEMENTED & VERIFIED** | Preserved append-only non-destructive attempt architecture. Existing scores and alerts remain untouched. |

---

## 2. PHASE 1: P0 SECURITY IMPLEMENTATION

### 1. `convex/insights.ts:getDailyStats`
- **Authenticated Identity Required:** Rejects unauthenticated callers immediately with `Unauthenticated: Must be logged in to view insights.`
- **Strict Clinical Authorization:** Calls `assertCanAccessStudent(ctx, targetUserId)`. Students can query only their own stats; counselors and admins can access authorized students.
- **Identity Resolution:** Resolves canonical `users._id` and legacy `clerkId` to ensure complete longitudinal data aggregation without exposing unauthorized records.
- **Regression Tests Added:**
  - `SEC-01`: Unauthenticated request rejected.
  - `SEC-02`: Student A cannot access Student B.
  - `SEC-03`: Student A can access Student A.
  - `SEC-04`: Authorized Counselor and Admin can access student stats.

### 2. `convex/screening.ts:submitScreeningAttempt`
- **Untrusted `args.userId` Fallback Eliminated:** Caller MUST have a valid authenticated identity (`ctx.auth.getUserIdentity()`).
- **Authoritative Subject Matching:** If `args.userId` is passed and differs from `identity.subject`, caller MUST satisfy `assertCanAccessStudent(ctx, args.userId)`.
- **Identity Absent Rejection:** Throws `Unauthenticated: Must be logged in to submit screening.` if no identity exists. Forged `userId` strings cannot create screening attempts.
- **Regression Tests Added:**
  - `SEC-05`: Unauthenticated submission rejected.
  - `SEC-06`: Student A cannot submit for Student B (forged `userId` rejected).
  - `SEC-07`: Authenticated student can submit their own screening attempt.

---

## 3. PHASE 2: CHECK-IN / EMOTION DOMAIN NORMALIZATION

### 1. Local Date Handling (`utils/date.ts`)
Created shared helper functions:
```typescript
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidCheckinDateStr(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  // Validates real calendar date and rejects future dates beyond local today + 1 day
}
```
- Replaced all instances of `new Date().toISOString().split("T")[0]` in `app/(auth)/(tabs)/index.tsx`, `app/(auth)/tools/companion.tsx`, and `convex/microGoals.ts`.
- Server-side validation in `convex/microGoals.ts:submitMorningCheckin` and `getTodayCheckin` rejects arbitrary future dates and malformed strings.

### 2. Removal of Daily Check-in Shadow Writes
- Architectural boundary finalized:
  - `dailyCheckins`: Authoritative daily mood state.
  - `emotionLogs`: Episodic / situational emotion events.
- Removed dual-writes to `emotionLogs` from Student Home check-in (`handleCheckInSubmit` and `handleInlineCheckIn`).
- Historical `emotionLogs` rows are preserved untouched.

### 3. Companion "Daily Mood" Resolution
- **Decision:** **Option A (Daily mood check-in).**
- **Analysis:** Companion chat presented: *"How are you feeling today? Tap to log your mood and update Mitra's reflections."* This semantically represents the student's daily mood state.
- **Implementation:** Routed Companion "Daily Mood" to `submitDailyCheckin` (`api.microGoals.submitMorningCheckin`) with `dateStr: getLocalDateString()` and `allowUpdate: true`.
- **Deduplication:** Added `todayCheckin` query check: if the student has already checked in today (on Student Home or Companion), the prompt is hidden.

### 4. Index Optimization
- Added `.index("by_userId", ["userId"])` to `dailyCheckins` in `convex/schema.ts`.
- Preserved existing compound index `.index("by_userId_and_dateStr", ["userId", "dateStr"])`.
- Updated `convex/timeline.ts` to query `dailyCheckins` using indexed `.withIndex("by_userId")`, eliminating full table scans.

---

## 4. PHASE 3: SOMATIC TRACKING (EMOTION MAPS)

### 1. Authorization Enforcement in `convex/emotionMaps.ts:getRecentLogs`
- Calls `assertCanAccessStudent(ctx, targetUserId)`.
- Student A can query only Student A's body maps. Student B is denied.
- Authorized counselors and administrators can query authorized students' body maps.

### 2. Intensity Validation
- Enforced `1 <= intensity <= 10` on:
  - Each item in `bodyRatings` (`rating.intensity`).
  - `averageIntensity`.
- Rejects non-numeric, `NaN`, 0, negative values, and values `> 10`.
- Requires `bodyRatings` to be a non-empty array.

### 3. Dynamic Clinical Timeline Integration
- Integrated `emotionMaps` into `convex/timeline.ts`:
  - **Category:** `"monitoring"`
  - **EventType:** `"emotion_map"`
  - **Source Table:** `"emotionMaps"`
  - **Title:** `Emotion Body Map: {emotionLabel}`
  - **Suppression:** Excluded by default from the primary clinical timeline along with other high-frequency telemetry.
  - **Filter Selection:** Displayed when counselor explicitly selects `categoryFilter: "monitoring"`.
  - **Privacy:** Mitra dialogue and raw chat text are excluded from timeline events.

---

## 5. PHASE 4: REASSESSMENT INTEGRITY

### 1. Controlled `attemptType` Enum
- Added `attemptType: v.optional(v.union(v.literal("baseline"), v.literal("reassessment"), v.literal("force_retest")))` to `screeningAttempts` table in `convex/schema.ts`.
- **Deterministic Server-Side Calculation:**
  1. Checks prior triage records before writing the current triage: if the latest prior triage has `level === "force_retest"`, assign `"force_retest"`.
  2. Else if user has at least one prior completed screening attempt, assign `"reassessment"`.
  3. Else assign `"baseline"`.
- Clients cannot forge or arbitrarily choose `attemptType`.

### 2. Completed vs. Incomplete Attempt Queries
- Updated `convex/screening.ts:getLatestAttempt` and `getLatest` to filter for `status === "completed"`.
- In-progress or abandoned screening attempts cannot mask or hide the latest completed screening attempt.
- Created `getLatestRawAttempt` for separate inspection or resume workflows of in-progress screenings without deleting abandoned records.

### 3. Historical Data Integrity
- Prior screening attempts, scores, and triage classifications are preserved append-only.
- Active safety alerts (`alerts`) are never auto-resolved on reassessment.
- Zero changes to clinical scoring logic (PHQ-9, GAD-7, PQ-16, WSAS, ReQoL-10) or triage threshold rules.

---

## 6. FILES MODIFIED & CREATED

### Created:
1. [`utils/date.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/utils/date.ts): Client-local calendar date formatter and validator.
2. [`convex/priority7.test.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/priority7.test.ts): 19 comprehensive automated regression and functional tests covering Phases 1–4.
3. [`PRIORITY_7_PHASE_1_4_IMPLEMENTATION_REPORT.md`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/PRIORITY_7_PHASE_1_4_IMPLEMENTATION_REPORT.md): This report.
4. [`reports/PRIORITY_7_PHASE_1_4_IMPLEMENTATION_REPORT.md`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/reports/PRIORITY_7_PHASE_1_4_IMPLEMENTATION_REPORT.md): Permanent reports copy.

### Modified:
1. [`convex/schema.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/schema.ts): Added `attemptType` to `screeningAttempts`; added `by_userId` index to `dailyCheckins`.
2. [`convex/insights.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/insights.ts): Secured `getDailyStats` with authenticated identity and `assertCanAccessStudent`.
3. [`convex/screening.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/screening.ts): Enforced identity in `submitScreeningAttempt`, computed `attemptType`, secured `getLatestAttempt` and `getLatest` to completed attempts.
4. [`convex/microGoals.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/microGoals.ts): Added date validation and future date rejection to check-ins; fixed `userId` context in `submitMorningCheckin`.
5. [`convex/emotionMaps.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/emotionMaps.ts): Added 1–10 intensity validation and authorized access in `getRecentLogs`.
6. [`convex/timeline.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/timeline.ts): Integrated `emotionMaps` as monitoring events; indexed `dailyCheckins` query via `by_userId`.
7. [`app/(auth)/(tabs)/index.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/%28auth%29/%28tabs%29/index.tsx): Replaced ISO date splits with `getLocalDateString()`; removed shadow writes to `emotionLogs`.
8. [`app/(auth)/tools/companion.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/%28auth%29/tools/companion.tsx): Refactored Companion Daily Mood to `submitMorningCheckin` using `getLocalDateString()`.

---

## 7. SCHEMA & INDEX CHANGES

```typescript
// convex/schema.ts

// 1. Added by_userId index to dailyCheckins
dailyCheckins: defineTable({
  userId: v.string(),
  dateStr: v.string(), // "YYYY-MM-DD" local student calendar date
  mood: v.string(),
  createdAt: v.number(),
})
  .index("by_userId_and_dateStr", ["userId", "dateStr"])
  .index("by_userId", ["userId"]), // NEW: Fast longitudinal retrieval

// 2. Added attemptType to screeningAttempts
screeningAttempts: defineTable({
  userId: v.string(),
  patientId: v.optional(v.string()),
  status: v.string(), // "in_progress" | "completed" | "abandoned"
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  instrumentVersions: v.object({ ... }),
  responses: v.object({ ... }),
  results: v.object({ ... }),
  triageLevel: v.string(),
  suicideFlag: v.boolean(),
  psychosisFlag: v.boolean(),
  triageId: v.optional(v.id("triages")),
  screeningId: v.optional(v.id("screenings")),
  attemptType: v.optional( // NEW: Controlled attempt classification
    v.union(v.literal("baseline"), v.literal("reassessment"), v.literal("force_retest"))
  ),
})
```

---

## 8. AUTHORIZATION & PRIVACY MATRIX

| Endpoint | Caller | Access Rule | Enforced By | Result |
|---|---|---|---|---|
| `insights.getDailyStats` | Unauthenticated | Denied | `ctx.auth.getUserIdentity()` | Throws `Unauthenticated` |
| `insights.getDailyStats` | Student A -> Student B | Denied | `assertCanAccessStudent` | Throws `Forbidden` |
| `insights.getDailyStats` | Student A -> Student A | Allowed | `assertCanAccessStudent` | Returns stats |
| `insights.getDailyStats` | Counselor -> Student A | Allowed | `assertCanAccessStudent` | Returns stats |
| `screening.submitScreeningAttempt` | Unauthenticated | Denied | `ctx.auth.getUserIdentity()` | Throws `Unauthenticated` |
| `screening.submitScreeningAttempt` | Student A (forged `userId: B`) | Denied | `assertCanAccessStudent` | Throws `Forbidden` |
| `screening.submitScreeningAttempt` | Student A (own identity) | Allowed | `identity.subject` | Returns result & `attemptType` |
| `emotionMaps.getRecentLogs` | Student A -> Student B | Denied | `assertCanAccessStudent` | Throws `Forbidden` |
| `emotionMaps.getRecentLogs` | Counselor -> Student A | Allowed | `assertCanAccessStudent` | Returns student body maps |

---

## 9. AUTOMATED TEST SUITE EXECUTION

### Priority 7 Automated Tests (`convex/priority7.test.ts`):
- `SEC-01`: `insights.getDailyStats` rejects unauthenticated call.
- `SEC-02`: Student A cannot access Student B stats via `getDailyStats`.
- `SEC-03`: Student A can query their own stats via `getDailyStats`.
- `SEC-04`: Authorized Counselor and Admin can access student stats via `getDailyStats`.
- `SEC-05`: `submitScreeningAttempt` rejects unauthenticated call.
- `SEC-06`: Student A cannot submit screening attempt for Student B (forged `userId` rejected).
- `SEC-07`: Authenticated student can submit their own screening attempt.
- `DATE-01`: Shared local date helper formats correctly across timezone boundaries.
- `CHECKIN-01`: Daily check-in writes to `dailyCheckins` and does NOT create `emotionLogs`.
- `CHECKIN-02`: Updating today's check-in updates `dailyCheckins` without duplicate.
- `CHECKIN-03`: Rejects invalid or future date strings.
- `EMOTION-01`: Episodic `emotionLog` remains functional as situational event.
- `EMAP-01`: `emotionMaps` enforces intensity between 1 and 10.
- `EMAP-02`: `emotionMaps.getRecentLogs` enforces student isolation and counselor access.
- `EMAP-03`: `emotionMaps` appears in monitoring timeline filter, suppressed in default.
- `REASSESS-01`: Deterministic `attemptType` assignment (`baseline` vs `reassessment`).
- `REASSESS-02`: Force retest triage leads to `force_retest` `attemptType`.
- `REASSESS-03`: Incomplete attempt does NOT hide latest completed screening.
- `REASSESS-04`: Historical screening records and safety alerts remain intact.

### Full Repository Vitest Suite:
```
 ✓ convex/authz.test.ts (9 tests)
 ✓ convex/dashboard_timeline.test.ts (12 tests)
 ✓ convex/longitudinal.test.ts (8 tests)
 ✓ convex/cbt.test.ts (2 tests)
 ✓ convex/authorization.test.ts (12 tests)
 ✓ convex/provenance.test.ts (7 tests)
 ✓ convex/mitra_avatar.test.ts (20 tests)
 ✓ convex/hardening.test.ts (17 tests)
 ✓ convex/timeline.test.ts (20 tests)
 ✓ convex/priority7.test.ts (19 tests)
 ✓ convex/screening.test.ts (17 tests)
 ✓ convex/auth.test.ts (10 tests)

 Test Files  12 passed (12)
      Tests  153 passed (153)
   Duration  8.84s
```

---

## 10. VERIFICATION SUMMARY

1. **Vitest Test Suite:** `npx vitest run` -> **12 passed, 153 passed, 0 failed**.
2. **TypeScript Compilation:** `npx tsc --noEmit` -> **Clean (0 errors, code 0)**.
3. **Counselor Dashboard Production Build:** `npm run build --prefix dashboard` -> **Clean (built in 4.84s, 0 errors, code 0)**.
4. **Historical Data Safety:** Zero existing database records modified or mutated. All migrations and index additions are non-destructive and backward-compatible.
5. **Clinical Scoring Preserved:** Zero modifications to PHQ-9, GAD-7, PQ-16, WSAS, or ReQoL-10 scoring algorithms or clinical triage thresholds.

---

## 11. MANUAL QA VERIFICATION CHECKLIST

| Verification Item | Tested Flow | Result |
|---|---|---|
| **1. Check-in Single Write** | Student A performs Daily Check-in | Exactly 1 `dailyCheckins` record created. |
| **2. No Shadow Write** | Daily check-in performed | Zero `emotionLogs` rows created. |
| **3. Same-Day Update** | Student changes today's mood | Existing `dailyCheckins` row patched; no duplicate. |
| **4. Local Calendar Date** | IST boundary test | Local calendar date `YYYY-MM-DD` preserved regardless of UTC offset. |
| **5. Episodic Emotion Logging** | Situational emotion entry logged | `emotionLogs` row created with intensities and sensations. |
| **6. Body Map Validation** | Somatic map submitted | Intensities strictly validated 1–10. Invalid numbers rejected. |
| **7. Somatic Isolation** | Student B queries Student A body map | Denied with authorization error. |
| **8. Counselor Somatic Access** | Counselor queries Student A body map | Authorized and returns correct student somatic data. |
| **9. Monitoring Filter** | Timeline queried with `categoryFilter: "monitoring"` | `emotionMaps` events included. |
| **10. Default Timeline Cleanliness** | Default timeline query | `emotionMaps` events suppressed from high-level clinical view. |
| **11. Cross-Student Insights Isolation** | Student A queries Student B in `insights.getDailyStats` | Denied with authorization error. |
| **12. Screening Identity Enforcement** | Unauthenticated screening submission | Denied with `Unauthenticated`. |
| **13. Forged Screening Attempt** | Student A submits screening with `userId: Student B` | Denied with authorization error. |
| **14. Completed Screening Priority** | Screening completed, followed by in-progress attempt | `getLatestAttempt` and `getLatest` return the completed attempt. |
| **15. Reassessment Record Integrity** | Repeat screening submitted after baseline | Both attempts preserved in DB; alert state preserved. |

---

## 12. SCOPE STATUS CLASSIFICATION

- **IMPLEMENTED & VERIFIED:**
  - P0 Security: `convex/insights.ts:getDailyStats` authorization.
  - P0 Security: `convex/screening.ts:submitScreeningAttempt` caller identity enforcement.
  - Check-in normalization: `getLocalDateString` helper in `utils/date.ts`.
  - Discontinuation of shadow writes to `emotionLogs` from Student Home.
  - Companion "Daily Mood" unified into `dailyCheckins`.
  - `dailyCheckins` `by_userId` index added.
  - `emotionMaps.getRecentLogs` authorization.
  - `emotionMaps.create` 1–10 intensity boundary enforcement.
  - `emotionMaps` timeline integration under `monitoring` category.
  - `attemptType` enum (`baseline`, `reassessment`, `force_retest`) in `screeningAttempts`.
  - Latest completed attempt queries secured against in-progress / abandoned attempts.
  - Historical data and clinical scoring integrity preserved.

- **PENDING CLINICAL APPROVAL (Intentionally NOT Implemented):**
  - Automated 14-day / 30-day reassessment cron schedules.
  - Automatic clinical alerts triggered by emotion log dips.
  - Mandatory reassessment gating blocking student app usage.

- **PENDING PRODUCT DECISION (Intentionally NOT Implemented):**
  - Longitudinal mood graph UI presentation format.
  - Companion contextual conversational prompts based on multi-week mood trends.

- **NOT IN SCOPE (Intentionally NOT Implemented):**
  - Priority 8: Reframe Interactive Conversation.
  - Priority 9: Breathing & Grounding Video/Media Integration.
  - Counselor dashboard UI redesign beyond timeline validation.

---

## 13. RISKS & NEXT STEPS

1. **Convex Cloud Deployment:** When deploying to production Convex, ensure the schema index `by_userId` on `dailyCheckins` and `attemptType` on `screeningAttempts` are deployed via `npx convex deploy`. All existing records are compatible.
2. **Phase 5 Progression:** Once clinical leadership establishes policy for repeat screening intervals (e.g. 14 days vs 30 days vs clinician order), automated notification reminders or cadence flags can be safely attached to the established `attemptType` architecture.
