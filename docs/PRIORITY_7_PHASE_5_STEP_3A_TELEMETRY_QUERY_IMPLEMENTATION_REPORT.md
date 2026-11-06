# Priority 7 Phase 5 — Step 3A: Telemetry Query Normalization Implementation Report

**Date:** September 28, 2026  
**Status:** Implemented & Verified — 12/12 Test Files Passing (179/179 Tests)  
**Deliverables:**
- `PRIORITY_7_PHASE_5_STEP_3A_TELEMETRY_QUERY_IMPLEMENTATION_REPORT.md` (Workspace root)
- `reports/PRIORITY_7_PHASE_5_STEP_3A_TELEMETRY_QUERY_IMPLEMENTATION_REPORT.md` (Mirror repository)

---

## 1. Executive Summary

In Step 3A of Priority 7 Phase 5, the telemetry query source-of-truth disconnect identified in the Step 3 Audit was resolved in `convex/insights.ts:getDailyStats`.

### Key Outcomes:
1. **Authoritative Daily Check-in Sourcing:** `getDailyStats` now queries `dailyCheckins` (using the `by_userId` index) to compute `totalCheckins` and derive the student's 7-day daily mood trend (`recentDailyMood`). It no longer queries `emotionLogs` for daily check-in counts.
2. **Backward-Compatible Mood Trend Representation:** To prevent breaking the current student Insights mobile UI (`app/(auth)/(tabs)/insights.tsx`), `stats.emotionLogs` returns a normalized compatibility representation derived from recent `dailyCheckins` with intensity mappings and date strings, ensuring active students immediately see their mood trend without modifying UI code in this step. True episodic logs remain available via `episodicEmotionLogs`.
3. **Screening Projection & Field Preservation:** Completed screening attempt projection now preserves `wsas_total`, `reqol10_total`, `phq9_item9_score`, and `phq9_item9_flag` whenever present in stored attempt results, restoring full data fidelity for the student CSV export in `app/(auth)/(tabs)/profile.tsx`. Incomplete and abandoned attempts remain strictly excluded.
4. **Performance & Query Bounding:** Unbounded `.collect()` queries across `microGoals`, `jpmrLogs`, `reframeLogs`, `emotionLogs`, `screeningAttempts`, and `triages` were replaced with bounded index queries (`.take(30)`, `.take(50)`, `.take(100)`), eliminating full-history scans on user telemetry.
5. **Authorization Preservation:** The P0 security hardening (`assertCanAccessStudent(ctx, targetUserId)`) and canonical `users._id` / `clerkId` resolution remain strictly intact.
6. **Zero Excluded Area Scope Creep:** No dailyCheckin write logic, emotionLogs mutations, somatic tracking, screening scoring, triage algorithms, or unblock logic were altered.

---

## 2. Files and Functions Modified

### Modified Files:
1. `convex/insights.ts`
   - **Function Modified:** `getDailyStats` (query)
   - **Changes:**
     - Added `moodToIntensity` helper for categorical mood-to-intensity mapping (good: 8, calm: 6, low: 4, heavy: 3, default: 5).
     - Queried `dailyCheckins` via `by_userId` index bounded to the 30 most recent check-ins.
     - Deduplicated across canonical `users._id` and legacy `clerkId` by `_id`, and deduplicated multiple entries per calendar date keeping the latest.
     - Derived `totalCheckins` directly from `dailyCheckins.length`.
     - Computed `recentDailyMood` bounded to the 7 most recent daily check-ins sorted chronologically.
     - Provided `emotionLogs` backward-compatible mapping from `recentDailyMood` for the current `insights.tsx` consumer, and provided `episodicEmotionLogs` for actual episodic records.
     - Bounded `microGoals` (.take(100)), `jpmrLogs` (.take(50)), `reframeLogs` (.take(50)), `emotionLogs` (.take(20)), `screeningAttempts` (.take(50)), and `triages` (.take(50)).
     - Preserved all screening result fields in completed attempts: `phq9_total`, `gad7_total`, `pq16_total`, `wsas_total`, `reqol10_total`, `phq9_item9_score`, `phq9_item9_flag`.

2. `convex/priority7.test.ts`
   - **Added Test Suite:** `STEP 3A: TELEMETRY QUERY NORMALIZATION (INSIGHT-3A-01 to INSIGHT-3A-12)`
   - **Tests Added:** 12 focused regression and validation tests covering all required invariants.

---

## 3. API Contract & Compatibility Considerations

### API Return Shape Comparison:

```typescript
// Previous Return Shape:
{
  totalCalmPoints: number,
  completedGoalsCount: number,
  jpmrMinutes: number,
  avgJpmrDrop: string,
  reframesCount: number,
  avgReframeDrop: string,
  totalCheckins: number,      // Defect: was emotionLogs.length
  emotionLogs: any[],         // Defect: was raw episodic emotionLogs
  microGoals: any[],
  jpmrLogs: any[],
  reframes: any[],
  screenings: any[],          // Defect: dropped wsas_total, reqol10_total, item9
  triages: any[]
}

// Updated Step 3A Return Shape:
{
  totalCalmPoints: number,
  completedGoalsCount: number,
  jpmrMinutes: number,
  avgJpmrDrop: string,
  reframesCount: number,
  avgReframeDrop: string,
  totalCheckins: number,          // Fixed: from dailyCheckins.length
  dailyCheckins: any[],           // New: authoritative recent daily check-in records
  recentDailyMood: any[],         // New: 7-day chronologically sorted mood trend
  emotionLogs: any[],             // Compatibility: mapped from recentDailyMood for insights.tsx
  episodicEmotionLogs: any[],     // Clean separation: actual episodic emotion logs
  microGoals: any[],              // Bounded
  jpmrLogs: any[],                // Bounded
  reframes: any[],                // Bounded
  screenings: any[],              // Preserved: wsas_total, reqol10_total, item9
  triages: any[]                  // Bounded
}
```

### Compatibility Details:
- **`app/(auth)/(tabs)/insights.tsx`:** The current mobile screen consumes `stats.totalCheckins` and `stats.emotionLogs.slice(-7)`. It expects each item in `stats.emotionLogs` to have `.createdAt` and `.preIntensity`. The compatibility representation supplies these exact fields from `recentDailyMood`. Active students now immediately see their real daily check-in count and a live 7-day mood trend without modifying any frontend code.
- **`app/(auth)/(tabs)/profile.tsx`:** The CSV export consumes `exportData.screenings`. Secondary instrument columns (`WSAS`, `ReQoL10`, `Item9`) now receive their real values whenever present in the completed attempt results.

---

## 4. Verification & Test Results

### 1. Vitest Test Suite
- **Command:** `npx vitest run`
- **Result:** **12 passed, 12 test files (179 passed, 179 tests)**
- **Duration:** 5.72s
- **Breakdown of Tests Added:**
  - `INSIGHT-3A-01`: Daily check-in records are returned from `dailyCheckins`. (PASS)
  - `INSIGHT-3A-02`: `totalCheckins` equals `dailyCheckins` count for the intended period. (PASS)
  - `INSIGHT-3A-03`: `emotionLogs` are NOT used as the source of daily check-in count. (PASS)
  - `INSIGHT-3A-04`: 7-day daily mood history uses `dailyCheckins`. (PASS)
  - `INSIGHT-3A-05`: `dailyCheckin` local `dateStr` semantics work across midnight boundaries. (PASS)
  - `INSIGHT-3A-06`: Completed screening attempts remain included. (PASS)
  - `INSIGHT-3A-07`: Incomplete/abandoned screening attempts remain excluded. (PASS)
  - `INSIGHT-3A-08`: Existing WSAS/ReQoL/Item9 fields are preserved when already stored. (PASS)
  - `INSIGHT-3A-09`: Unauthenticated Insights access remains denied. (PASS)
  - `INSIGHT-3A-10`: Cross-student Insights access remains denied. (PASS)
  - `INSIGHT-3A-11`: Counselor/admin authorized access remains functional. (PASS)
  - `INSIGHT-3A-12`: Historical clinical records are not silently deleted or overwritten. (PASS)

### 2. TypeScript Compilation Check
- **Command:** `npx tsc --noEmit`
- **Result:** **Exit Code 0** (Clean, 0 errors across workspace).

### 3. Counselor Dashboard Production Build
- **Command:** `npm run build --prefix dashboard`
- **Result:** **Exit Code 0** (`tsc -b && vite build` completed successfully in 858ms).

---

## 5. Confirmation of Strict Invariants & Exclusions

- [x] **No shadow writes reintroduced:** `emotionLogs` receives no check-in writes.
- [x] **No mutation changes:** `dailyCheckins` write mutations, `emotionLogs.create`, and `emotionMaps.create` were NOT modified.
- [x] **No clinical logic alterations:** Screening scoring, psychometric cutoffs, triage level evaluations, and alert rules were NOT touched.
- [x] **No `unblockPatient` changes:** Triage clearance mechanisms remain unmodified.
- [x] **No UI modifications in this step:** Step 3B (Student UI alignment) and Step 3D (Counselor daily check-in UI) were NOT started.
- [x] **No timezone fixes outside query scope:** Step 3C timezone work in `wellness.ts` and `app/index.tsx` was NOT touched.
- [x] **No Step 2C, Priority 8, or Priority 9 work started.**

---

**STEP 3A COMPLETE — STRICT STOP CONDITION OBSERVED.**  
Awaiting review before proceeding to Step 3B or subsequent roadmap steps.
