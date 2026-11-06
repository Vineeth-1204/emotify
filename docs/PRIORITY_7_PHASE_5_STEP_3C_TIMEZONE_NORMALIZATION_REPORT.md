# PRIORITY 7 — PHASE 5 — STEP 3C
## TIMEZONE / LOCAL-CALENDAR NORMALIZATION REPORT

**Status:** COMPLETE AND VALIDATED  
**Author:** Antigravity Agent  
**Date:** September 28, 2026  
**Scope:** Priority 7 Phase 5 Step 3C ONLY  

---

### 1. Executive Summary

In Priority 7 Phase 5 Step 3C, date/time logic across the application was audited and normalized to eliminate improper UTC semantics where product intent specifies local calendar semantics.

The audit established that:
1. The user database (`users` table) contains **no timezone preference field**.
2. Consistent with the established architecture of `dailyCheckins.dateStr`, the client application boundary is the authoritative source for the student's local calendar date (`getLocalDateString()`) and local offset (`new Date().getTimezoneOffset()`).
3. Core streak, content gating, and wellness energy classifications that previously derived dates or hours via server UTC (`toISOString().split("T")[0]` or `getUTCHours()`) have been normalized to accept client local calendar semantics with deterministic fallbacks.
4. Zero historical database records were modified or backfilled. Zero clinical scoring, triage, or alert rules were touched.

---

### 2. Timezone & Local-Calendar Audit Table

| File | Current Logic | Product Meaning | UTC Risk | Required Change | Resolution Status |
|------|---------------|-----------------|----------|-----------------|-------------------|
| `app/index.tsx` | `new Date().toISOString().split('T')[0]` used for `last_played_video_date` | Once-daily landing video gating per local calendar day | Users east of UTC (e.g. IST UTC+5:30) roll over to next day before local midnight; users west of UTC remain on previous day | Replace with `getLocalDateString()` | **FIXED** |
| `convex/wellness.ts` | `getHours()` on server runtime (which executes in UTC) to classify energy patterns | Classify student's active energy window in their actual local diurnal cycle | UTC hour 02:00 (which is 07:30 AM local time in IST) was incorrectly classified as nighttime/early riser instead of morning person | Accept `timezoneOffsetMinutes` from client boundary, compute `(createdAt - offset*60000).getUTCHours()`; document server fallback | **FIXED** |
| `convex/microGoals.ts:checkAndFreezeStreak` | `new Date().toISOString().split("T")[0]` and `yesterday.toISOString().split("T")[0]` | Streak evaluation based on student's local day sequence | Streak broke or froze prematurely across timezone offsets spanning UTC midnight | Accept `clientDateStr`; use calendar-based `getPreviousDateStr()` | **FIXED** |
| `convex/microGoals.ts:getStreak` | Query derived `todayStr` and `yesterdayStr` from UTC `toISOString()` | Student's current streak on today's local date | Displayed broken streak or 0 streak if local day was different from UTC calendar day | Accept `dateStr: v.optional(v.string())`; use `getPreviousDateStr(todayStr)` | **FIXED** |
| `convex/microGoals.ts:completeGoalWithFeelingHelper` | Stored `lastCompletionDate` and evaluated streak using UTC `toISOString()` | Mark streak completed on student's local date | Stored completion on wrong calendar day across UTC midnight | Accept `dateStr?: string` and compute streak using local calendar day | **FIXED** |
| `convex/microGoals.ts:ensureWeeklyMission` & `getWeeklyMission` | `monday.toISOString().split("T")[0]` | Week start anchor (Monday) in student's calendar | `.toISOString()` could slide into Sunday evening in negative UTC offsets | Format Monday via calendar `[year, month, day]` format | **FIXED** |
| `convex/microGoals.ts:getTodayGoals` | Server `new Date()` midnight timestamp range | Retrieve goals belonging to today's local calendar day | Filtered goals according to UTC server midnight boundaries | Accept `dateStr?: string` and anchor `startOfDay`/`endOfDay` to local calendar day | **FIXED** |
| `app/(auth)/tools/microgoals.tsx` | Queried `getStreak({})` and `getTodayCheckin({})` without `dateStr` | Retrieve streak and checkin for local calendar day | Reverted to server UTC date | Passed `dateStr: getLocalDateString()` | **FIXED** |
| `app/(auth)/(tabs)/index.tsx` | Queried `getStreak({})` and mutated `updateWellness({})` without timezone context | Local streak display and diurnal wellness pattern | Defaulted to server UTC | Passed `dateStr: getLocalDateString()` and `timezoneOffsetMinutes: new Date().getTimezoneOffset()` | **FIXED** |
| `app/(auth)/(tabs)/profile.tsx` | Mutated `updateWellness({})` without timezone context | Diurnal wellness pattern | Defaulted to server UTC | Passed `timezoneOffsetMinutes: new Date().getTimezoneOffset()` | **FIXED** |
| `convex/dailyCheckins` | `dateStr` stored as `"YYYY-MM-DD"` | Local calendar date | None (contract was already correct in Step 3A) | Preserved authoritative `dateStr` contract; zero UTC conversion | **PRESERVED** |
| `convex/screeningAttempts.ts` | `startedAt`, `completedAt` as epoch timestamps | Precise clinical event timestamp | None (epoch timestamps are timezone-agnostic UTC milliseconds) | Do NOT convert to string dates; retain epoch timestamps | **PRESERVED** |
| `convex/triages.ts` | `createdAt` as epoch timestamp | Clinical triage event time | None | Retain epoch timestamp | **PRESERVED** |
| `convex/alerts.ts` | `createdAt`, `acknowledgedAt` as epoch timestamps | Clinical safety alert lifecycle | None | Retain epoch timestamp | **PRESERVED** |

---

### 3. Established Date Contract & Reusable Date Helper

1. **Daily Check-ins Contract:**
   - `dailyCheckins.dateStr` = Local calendar date in `"YYYY-MM-DD"` format (e.g., `"2026-09-28"`).
   - Authoritative for day-level state, deduplication, and streak calculations.
   - Handled directly by `utils/date.ts` on the client and validated on the backend.

2. **Epoch Timestamps Contract:**
   - `createdAt`, `completedAt`, `startedAt`, `acknowledgedAt` = UTC epoch milliseconds (`Date.now()`).
   - Retained as the immutable source of truth for all clinical and audit event timelines.

3. **Reusable Date Helpers:**
   - Client: [`utils/date.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/utils/date.ts)
     - `getLocalDateString(date = new Date()): string`
     - `isValidCheckinDateStr(dateStr: string): boolean`
     - `getPreviousDateStr(dateStr: string): string` (added in Step 3C)
   - Backend (`convex/microGoals.ts`):
     - Due to Convex's self-contained bundling boundary (`convex/` cannot import outside its root), internal equivalents of `isValidCheckinDateStr`, `getPreviousDateStr`, and `getMondayDateStr` are maintained within `convex/microGoals.ts`.

---

### 4. Implementation Details by Subsystem

#### A. Landing Screen Video Gating ([`app/index.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/index.tsx))
- Replaced 3 occurrences of `new Date().toISOString().split('T')[0]` with `getLocalDateString()`.
- Video playback state in `AsyncStorage` (`last_played_video_date`) now tracks the student's actual local calendar day.

#### B. Diurnal Wellness Energy Pattern ([`convex/wellness.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/wellness.ts))
- Added `timezoneOffsetMinutes: v.optional(v.number())` to `api.wellness.updateProfile`.
- Computes local hour via `new Date(log.createdAt - timezoneOffsetMinutes * 60000).getUTCHours()`.
- Documented fallback: When called without offset, runtime uses server UTC hours, avoiding heuristic IP/location inference.
- Client screens ([`app/(auth)/(tabs)/index.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/(tabs)/index.tsx) and [`app/(auth)/(tabs)/profile.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/(tabs)/profile.tsx)) pass `new Date().getTimezoneOffset()`.

#### C. Micro-Goal Streak & Date Logic ([`convex/microGoals.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/microGoals.ts))
- `checkAndFreezeStreak(ctx, userId, clientDateStr)`:
  - Takes client local date string or falls back to server date.
  - Determines yesterday via `getPreviousDateStr(todayStr)` rather than subtracting 24 hours in UTC.
- `getStreak`:
  - Accepts `dateStr: v.optional(v.string())`.
  - Compares `lastCompletionDate` against local `todayStr` and `yesterdayStr`.
- `completeGoalWithFeelingHelper`:
  - Accepts `dateStr?: string`.
  - Records completion and checks freeze using local calendar day.
- `getTodayGoals`:
  - Accepts `dateStr: v.optional(v.string())`.
  - Derives `startOfDay` and `endOfDay` from the specified local calendar date.
- `ensureWeeklyMission` and `getWeeklyMission`:
  - Generates Monday week start via local calendar components (`[year, month, day]`) instead of `.toISOString()`.

---

### 5. Issues Intentionally NOT Fixed and Why

1. **User Timezone Database Field:**
   - Not added to `schema.ts`. No user timezone field previously existed, and prompt constraints strictly forbid inventing a timezone model without an explicit product decision. Timezone offsets are communicated explicitly across client-backend query boundaries.
2. **Clinical Event Timestamps (`createdAt`, `startedAt`, `completedAt`):**
   - Intentionally untouched. Clinical scoring, audit logs, and timelines require unambiguous, timezone-agnostic UTC epoch timestamps.
3. **Historical Streak Records:**
   - Stored `streaks` records are preserved as-is. No heuristic migration or backfill was performed.

---

### 6. Test Suite & Verification Results

A dedicated suite of 7 focused boundary tests (`TZ-01` through `TZ-07`) was implemented in [`convex/priority7.test.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/priority7.test.ts):

| Test ID | Description | Result |
|---------|-------------|--------|
| `TZ-01` | Local date before UTC midnight does not roll to the next calendar day incorrectly | **PASSED** |
| `TZ-02` | Local date after UTC midnight does not incorrectly remain on the previous calendar day | **PASSED** |
| `TZ-03` | `dailyCheckins.dateStr` remains authoritative without UTC mutation | **PASSED** |
| `TZ-04` | Micro-goal streak/date logic uses calendar semantics via `dateStr` and `getPreviousDateStr` | **PASSED** |
| `TZ-05` | Wellness energy-hour calculation uses `timezoneOffsetMinutes` instead of UTC | **PASSED** |
| `TZ-06` | Existing Step 3A date deduplication and stats semantics remain intact | **PASSED** |
| `TZ-07` | Weekday label parsing from `dateStr` does not shift across timezones | **PASSED** |

#### Test Execution Summary:
- **Command:** `npx vitest run`
- **Test Files:** 12 passed (12 total)
- **Tests:** 195 passed (0 failed, 195 total)
- **TypeScript:** `npx tsc --noEmit` exited with code 0 (0 errors)
- **Dashboard Build:** `npm run build --prefix dashboard` exited with code 0 (`tsc -b && vite build` succeeded)

---

### 7. Files Modified

1. [`utils/date.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/utils/date.ts)
2. [`app/index.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/index.tsx)
3. [`convex/wellness.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/wellness.ts)
4. [`convex/microGoals.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/microGoals.ts)
5. [`app/(auth)/(tabs)/index.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/(tabs)/index.tsx)
6. [`app/(auth)/(tabs)/profile.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/(tabs)/profile.tsx)
7. [`app/(auth)/tools/microgoals.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/tools/microgoals.tsx)
8. [`app/(auth)/tools/recovery-plan.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/tools/recovery-plan.tsx)
9. [`convex/priority7.test.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/priority7.test.ts)

---

### 8. Strict Scope Compliance Checklist

- [x] Date/time semantics ONLY modified
- [x] Zero telemetry redesign
- [x] Zero wellness scoring redesign
- [x] Zero reassessment scheduling changes
- [x] Zero screening scoring or clinical triage modifications
- [x] Zero historical database migrations or timestamp rewrites
- [x] Zero user timezone preference field invented in database
- [x] Step 3A & Step 3B verified intact (all 195 tests pass)
- [x] Execution stopped after Step 3C; Step 3D NOT started
