# Priority 8 — Step 6 Implementation Report: Non-Clinical Cooldown & Deterministic Habit Engine

**Date:** September 28, 2026  
**Status:** COMPLETE & VERIFIED  
**Baseline Test Suite:** 274 / 274 Vitest tests passing (13 test files)  
**Type Check:** `npx tsc --noEmit` clean (0 errors)  
**Dashboard Build:** `npm run build --prefix dashboard` clean (0 errors)

---

## 1. Scope

The scope of Priority 8 Step 6 was strictly limited to replacing the randomized daily micro-goal recommendation mechanism with a centralized, deterministic, history-aware, non-clinical routine habit recommendation engine.

Key requirements fulfilled:
- Centralized the routine micro-goal catalog into `common/interventions.ts`.
- Preserved all existing 24 goal IDs, titles, descriptions, difficulty tiers, durations, and coin/XP values.
- Completely removed `Math.random()` from daily recommendation generation (`generateRecommendedGoals`).
- Implemented a 7-day cooldown window (`[today - 7 days, today]`) based on authentic `microGoals` assignment records.
- Formulated a deterministic pseudo-random scoring algorithm using non-clinical inputs: authenticated `userId`, calendar date (`YYYY-MM-DD`), and catalog `goalId`.
- Preserved the daily recommendation structure: 2 small, 1 medium, 1 large, and 1 challenge goal (5 total).
- Implemented graceful deterministic fallback for candidate pool exhaustion without creating duplicate goals or inventing non-catalog content.
- Preserved strict clinical boundary: zero queries to `screeningAttempts`, `screenings`, `triages`, or clinical scales (PHQ-9, GAD-7, PQ-16, WSAS, ReQoL-10).
- Preserved API compatibility by keeping `mood` in function arguments, but strictly leaving it unused (mood-blind engine).
- Preserved existing authorization checks (`assertCanAccessStudent`) and ownership boundaries.
- Left the interactive CBT reframing pathway (`convex/cbt.ts`) intact.

---

## 2. Files Changed

### Created:
- `common/interventions.ts`: Central source-of-truth intervention catalog and deterministic habit recommendation engine. Defines all 24 routine micro-goal templates across 4 tiers (`small`, `medium`, `large`, `challenge`), deterministic FNV-1a hashing, date math utilities, cooldown filtering, tier candidate exhaustion fallback, and overall daily routine goal selection.

### Modified:
- `convex/microGoals.ts`:
  - Removed local `TEMPLATES` array and `GoalTemplate` interface; re-exported them from `../common/interventions`.
  - Replaced non-deterministic `arr.sort(() => 0.5 - Math.random())` in `generateRecommendedGoals` with `selectDailyRoutineGoalsDeterministically`.
  - Added query to student's existing `microGoals` history to extract assignment dates and timestamps for 7-day cooldown calculation.
  - Ensured `submitMorningCheckin` computes `startOfDayTime` accurately when `todayStr` is provided.
- `convex/priority8.test.ts`:
  - Added 16 new test cases covering `P8-DETERMINISTIC-01..03`, `P8-COOLDOWN-01..05`, `P8-FALLBACK-01..02`, `P8-TIER-01`, `P8-AUTH-01..02`, `P8-DECOUPLE-STEP6-01`, and `P8-MOOD-01..02`.

---

## 3. Central Catalog Design

The catalog is located at `common/interventions.ts` to allow seamless sharing across backend Convex functions and potential frontend consumption without circular dependencies.

### Catalog Schema (`RoutineGoalTemplate`):
```typescript
export interface RoutineGoalTemplate {
  id: string;
  title: string;
  category: "mindfulness" | "physical" | "social" | "productivity" | "creativity";
  difficulty: "small" | "medium" | "large";
  coins: number;
  xp: number;
  estimatedMinutes: number;
  description: string;
  isChallenge?: boolean;
}
```

### Key Catalog Principles:
1. **Preserved Goal IDs**: All 24 canonical IDs (`walk-10`, `hydration-1`, `deep-breath-5`, `stretch-5`, `tidy-desk-5`, `gratitude-3`, `call-friend-15`, `meditation-10`, `read-15`, `screen-break-30`, `drawing-10`, `journaling-10`, `workout-30`, `cooking-30`, `declutter-30`, `creative-writing-20`, `yoga-20`, `nature-walk-30`, `challenge-digital-detox`, `challenge-gratitude-streak`, `challenge-kindness`, `challenge-sleep-routine`, `challenge-hydration-master`, `challenge-mindful-morning`) are preserved exactly.
2. **Strictly Non-Clinical**: No clinical indications, contraindications, mood mappings, or diagnostic tags exist in the catalog.
3. **Immutability**: Exported as `ROUTINE_INTERVENTION_CATALOG` with tier-indexed helper `ROUTINE_TEMPLATES_BY_TIER`.

---

## 4. Deterministic Selection Algorithm

To guarantee that the same user on the same calendar date with identical history always receives identical recommendations without `Math.random()`, a stable hash-based scoring function was implemented using the 32-bit FNV-1a hashing algorithm:

1. **Seed Generation**: A combined seed string is generated from the authenticated user's ID, the calendar date string (`YYYY-MM-DD`), and the template's unique ID:
   ```typescript
   const key = `${userId}:${dateStr}:${template.id}`;
   ```
2. **Deterministic Score**:
   ```typescript
   export function hashString(str: string): number {
     let hash = 2166136261;
     for (let i = 0; i < str.length; i++) {
       hash ^= str.charCodeAt(i);
       hash = Math.imul(hash, 16777619);
     }
     return hash >>> 0;
   }
   ```
3. **Selection**: Templates within each tier are sorted by their deterministic score ascending (`hashString(key)`), ensuring stable and repeatable ordering for any given `(userId, dateStr)`.
4. **Different Users / Dates**: Changing `userId` or changing `dateStr` alters the seed and produces a different deterministic distribution across the tier templates.

---

## 5. Cooldown Semantics

### Authoritative Rule for "Assigned":
In `microGoals`, a goal record represents an assignment for a given date (`date: YYYY-MM-DD`). 
- **Definition of "Assigned"**: Any goal entry present in the user's `microGoals` history table (whether `completed: true`, `completed: false`, or skipped) indicates that the user was assigned or engaged with that goal on that date.
- **Window Calculation**:
  - The cooldown window encompasses the previous 7 calendar days relative to `todayStr`:
    $$\text{window} = [\text{today} - 7\text{ days}, \text{today}]$$
  - Date comparisons use standard ISO calendar dates (`YYYY-MM-DD`).
- **Cooldown Rule**:
  - Any template whose `id` matches a goal assigned within `[today - 7 days, today]` is excluded from the primary eligible candidate pool.
  - Goals assigned $\ge 8$ days ago or never assigned are fully eligible.

---

## 6. Candidate Exhaustion Behavior

When a tier has fewer eligible candidates than its target requirement (e.g. if 7 of 8 small goals were assigned in the last 7 days):

1. **Primary Selection**: All remaining cooldown-eligible candidates are selected first, sorted by their deterministic score.
2. **Deterministic Fallback**:
   - The engine does NOT invent new goals or use generative models.
   - The engine does NOT duplicate goal IDs within the recommendation set.
   - The engine fills remaining slots from cooling-down candidates sorted by **least recently assigned first** (oldest assignment timestamp/date).
   - If multiple candidates have the same last-assigned date, the deterministic hash score serves as a stable tie-breaker.
3. **Genuine Exhaustion**:
   - If the total unique candidates available in the catalog tier is smaller than the target count, the engine returns all available unique candidates rather than generating duplicates.

---

## 7. Authorization Preservation

All authorization policies from previous steps remain strictly intact:
1. `generateRecommendedGoals` requires a valid authenticated identity via `getAuthUserId(ctx)`. Unauthenticated calls are rejected with `Unauthorized`.
2. Access to student data is gated by `assertCanAccessStudent(ctx, studentId)`. Students cannot access or generate goals for other students.
3. Counselor / Admin role access is preserved according to platform policies.
4. No public or unauthenticated endpoints were added.

---

## 8. Clinical Decoupling Verification

The daily habit recommendation path in `convex/microGoals.ts` and `common/interventions.ts`:
- Does NOT import or query `screeningAttempts`, `screenings`, or `triages`.
- Does NOT read or score PHQ-9, GAD-7, PQ-16, WSAS, or ReQoL-10 instruments.
- Does NOT receive or process psychiatric risk assessments or clinical alerts.
- Does NOT map emotions or moods to specific interventions.
- `args.mood` is retained purely for backward API compatibility and is completely unread by the selection engine.

---

## 9. Test Cases Summary

A dedicated suite of 16 tests was implemented in `convex/priority8.test.ts`:

| Test ID | Description | Result |
| :--- | :--- | :--- |
| `P8-DETERMINISTIC-01` | Same user + same date + same history = identical recommendations | PASS |
| `P8-DETERMINISTIC-02` | Different calendar dates produce different deterministic recommendations | PASS |
| `P8-DETERMINISTIC-03` | No `Math.random()` used during recommendation generation | PASS |
| `P8-COOLDOWN-01` | Goal assigned within previous 7 days is excluded from candidate pool | PASS |
| `P8-COOLDOWN-02` | Goal older than 7-day cooldown window (e.g. 8 days) is eligible again | PASS |
| `P8-COOLDOWN-03` | Skipped goals within cooldown window are excluded (authoritative creation) | PASS |
| `P8-COOLDOWN-04` | Completed goals within cooldown window are excluded | PASS |
| `P8-COOLDOWN-05` | Zero duplicate goal IDs occur within the same daily recommendation set | PASS |
| `P8-FALLBACK-01` | Insufficient candidates handled deterministically by least recently assigned | PASS |
| `P8-FALLBACK-02` | Engine never invents goals outside the centralized catalog | PASS |
| `P8-TIER-01` | Preserves 2 small, 1 med, 1 large, 1 challenge tier structure | PASS |
| `P8-AUTH-01` | Unauthenticated recommendation generation call is rejected | PASS |
| `P8-AUTH-02` | Cross-student recommendation access is denied | PASS |
| `P8-DECOUPLE-STEP6-01` | Recommendation generation does not query clinical screening attempts | PASS |
| `P8-MOOD-01` | Changing mood parameter alone does not alter daily recommendations | PASS |
| `P8-MOOD-02` | Verifies zero mood-to-goal mappings in catalog and selection logic | PASS |

Total test suite across all 13 test files: **274 / 274 passed**.

---

## 10. Manual QA Verification

The following verification scenarios were systematically executed and confirmed:

- **Scenario A (Same User, Same Date)**: Executing `generateRecommendedGoals` multiple times with identical user ID and date returns the exact same list of 5 goals with matching order.
- **Scenario B (Different Date Rotation)**: Advancing the date string shifts the deterministic hash seed and rotates the selected goals across available candidates.
- **Scenario C (Recent Goal Cooldown)**: Assigning a goal today ensures it does not appear in tomorrow's recommendation set.
- **Scenario D (Outside Cooldown)**: A goal assigned 8 days ago successfully returns to the eligible candidate pool.
- **Scenario E (Skip Handling)**: Skipping a goal leaves its assignment record in `microGoals`, which correctly suppresses it for the next 7 days.
- **Scenario F (Catalog Source of Truth)**: Every returned goal matches an entry in `ROUTINE_INTERVENTION_CATALOG`.
- **Scenario G (Existing Completion & Streak)**: Marking recommended goals as complete updates `completed: true`, increments coins and XP, and advances streaks as expected.
- **Scenario H (Daily Challenge)**: Exactly 1 challenge goal is selected from the challenge pool with `isChallenge: true`.
- **Scenario I (Mood Isolation)**: Calling `generateRecommendedGoals` with `mood: "anxious"` vs `mood: "happy"` vs `mood: undefined` yields identical recommendations.

---

## 11. Regression Results

- **Vitest Suite**: 13 test files, 274 tests passed, 0 failures.
- **TypeScript Check**: `npx tsc --noEmit` exited with code 0.
- **Dashboard Production Build**: `npm run build --prefix dashboard` built cleanly in 1.20s with 0 errors.

---

## 12. Before / After Behavior

| Dimension | Before Step 6 | After Step 6 |
| :--- | :--- | :--- |
| **Catalog Location** | Hardcoded array inside `convex/microGoals.ts` | Centralized in `common/interventions.ts` |
| **Selection Method** | `arr.sort(() => 0.5 - Math.random())` | Deterministic FNV-1a hash scoring (`userId + date + goalId`) |
| **Repetition Control** | None (could re-roll same goal daily or upon check-in retry) | Strict 7-day cooldown window based on `microGoals` history |
| **Exhaustion Fallback** | Random slice | Deterministic least-recently-assigned fallback; zero duplicates |
| **Re-opening Consistency**| Recommendations randomized every check-in submit | Recommendations stable and idempotent throughout the calendar day |
| **Clinical Isolation** | Untracked implicit boundary | Explicit decoupling test suite and strict mood isolation |

---

## 13. Remaining Priority 8 Findings

- **P8-F05 (Mood-Adaptive Goals)**: Audited in Step 5. Remains intentionally deferred until clinical protocol approval and product specifications are defined.
- **P8-F06 (Intervention Feedback Loop)**: User feedback ("not helpful") and explicit interest preferences remain outside current scope.

---

## 14. Explicit Scope Exclusions

As mandated by the stopping rule, the following areas were strictly excluded:
- No mood-to-intervention mapping.
- No emotion intensity weighting or clinical triage gating.
- No modifications to clinical screening tables or counselor triage workflows.
- No modifications to Mitra avatar or conversational prompts.
- No modifications to CBT interactive session flow (`convex/cbt.ts`).
- No new database tables or schema changes.
- No progression to Priority 9.

---

## 15. Final Status

Priority 8 Step 6 is **COMPLETE, VERIFIED, AND FULLY REPRODUCIBLE**.
All systems are stable, type-safe, and passing all tests.
