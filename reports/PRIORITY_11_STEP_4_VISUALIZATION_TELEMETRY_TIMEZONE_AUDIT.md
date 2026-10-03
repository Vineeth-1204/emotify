# Priority 11 — Step 4 Audit
# Student Mood Visualization, Intervention Telemetry & Timezone Audit

## 1. Status

**READ-ONLY AUDIT COMPLETE**

- Production Code Changes: **0 lines**
- Schema Changes: **0 lines**
- Test Modifications: **0 lines**
- Baseline Status: **367 / 367 tests passing (19 test files)**
- TypeScript Compiler: **Clean (exit code 0)**
- Counselor Dashboard Build: **Clean (exit code 0)**

---

## 2. Mood Visualization

### A. Current Data Source
- **Database Table:** `dailyCheckins`
- **Fields in Check-In Document:**
  - `userId: v.id("users")` (or string user ID)
  - `dateStr: v.string()` (format: `"YYYY-MM-DD"`)
  - `mood: v.string()` (categorical values: `"good"`, `"calm"`, `"low"`, `"heavy"`)
  - `note?: v.optional(v.string())`
  - `createdAt: v.number()`
- **Backend Query:** `convex/insights.ts:getDailyStats`
  - Queries `ctx.db.query("dailyCheckins").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()`
  - Deduplicates by `dateStr`, taking the latest record if multiple check-ins exist for the same date.
  - Slices the most recent 7 check-ins (`recent7Checkins`).
  - Constructs `recentDailyMood`:
    ```typescript
    const recentDailyMood = recent7Checkins
      .map((c) => ({
        date: c.dateStr,
        mood: c.mood,
        intensity: moodToIntensity(c.mood),
      }))
      .reverse();
    ```

### B. Current Transformation & Number Conversion
- **Conversion Function:** `convex/insights.ts:moodToIntensity(mood: string): number`
  ```typescript
  function moodToIntensity(mood: string): number {
    switch (mood.toLowerCase()) {
      case "great":
      case "excited":
      case "energetic":
      case "happy":
      case "good":
        return 8;
      case "calm":
      case "relaxed":
      case "peaceful":
      case "content":
        return 6;
      case "tired":
      case "bored":
      case "neutral":
      case "okay":
        return 5;
      case "sad":
      case "anxious":
      case "stressed":
      case "low":
        return 4;
      case "angry":
      case "frustrated":
      case "overwhelmed":
      case "heavy":
        return 3;
      default:
        return 5;
    }
  }
  ```
- **Nature of Conversion:** **Arbitrary and Clinically Unsound.**
  - Assigns an artificial 1–10 ordinal scale (`8`, `6`, `5`, `4`, `3`) to nominal emotional states.
  - Treats qualitative emotions as a continuous scalar intensity.
  - Implies that `"good"` is quantitatively twice as "intense" or "better" as `"low"`, and `"heavy"` is `3`.

### C. Current Visualization & Interpolation Logic
- **Component File:** `app/(auth)/(tabs)/insights.tsx` (lines 33–72, 128–158)
- **Chart Library:** `react-native-chart-kit` (`LineChart`)
- **Configuration:**
  ```tsx
  <LineChart
    data={{
      labels: dailyMoodEntries.map((e) => e.label),
      datasets: [{ data: dailyMoodEntries.map((e) => e.intensity) }],
    }}
    bezier={dailyMoodEntries.length > 1}
    // ...
  />
  ```
- **Interpolation / Smoothing:** `bezier={true}` generates a cubic spline interpolation between discrete points.
- **Empty States:** When no entries exist, renders an empty state fallback text (`"No check-in entries yet"`).

### D. Misleading Interpretations Created by Current Implementation
1. **False Continuity:** The Bézier curve draws smooth trajectories connecting discrete daily points, falsely suggesting smooth continuous emotional transitions across days or missing intervals.
2. **Artificial Severity Scale:** Converting nominal categorical descriptors (`"good"`, `"calm"`, `"low"`, `"heavy"`) into arbitrary numeric levels (8, 6, 4, 3) mimics a clinical rating scale (like a Likert severity score) where none exists.
3. **Missing-Day Deception:** If a student checks in on Monday and Friday, the Bézier line connects them across Tuesday, Wednesday, and Thursday, inventing non-existent intermediate mood trajectories.
4. **Calendar Window Distortion:** Taking `slice(0, 7)` of sorted check-in entries rather than a strict 7-day calendar window displays 7 check-ins across months as if they occurred in a single week.

### E. Exact Affected Files
1. `convex/insights.ts`:
   - `moodToIntensity` function (lines 10–26) — should be deprecated/removed from `recentDailyMood`.
   - `recentDailyMood` projection (lines 109–116) — eliminate artificial `intensity: number`.
2. `app/(auth)/(tabs)/insights.tsx`:
   - `LineChart` import and usage from `react-native-chart-kit` (lines 8, 33–72, 128–158).
   - Component rendering and styles.

### F. Recommended Implementation
- **Visual Paradigm:** **Discrete 7-Day Calendar Grid / Chip Bar**.
  - A clean, horizontal 7-day window matching the student's local week (or past 7 calendar days).
  - Each day represented by an individual card/chip:
    - Day of week abbreviation (`Mon`, `Tue`, etc.)
    - Calendar day number (`12`, `13`, etc.)
    - Discrete categorical Mood icon / emoji / badge (`"good"` ☀️/😊, `"calm"` 🌿/😌, `"low"` 🌧️/😔, `"heavy"` ⛈️/😣)
    - Distinct, neutral empty state for days with no check-in (`"—"` or dotted placeholder)
- **Data Shape from Backend:**
  ```typescript
  recentDailyMood: Array<{
    dateStr: string;       // "YYYY-MM-DD"
    mood: string | null;   // "good" | "calm" | "low" | "heavy" | null
    label: string;         // e.g. "Mon" or formatted date
    hasCheckin: boolean;
  }>
  ```
- **Underlying Database Data:** `dailyCheckins` table schema and historical records remain **100% unchanged**.

### G. Acceptance Criteria for Step 4A
1. No `LineChart` or Bézier curve used for categorical student mood.
2. No arbitrary scalar conversion (no `moodToIntensity` numbers 1–10).
3. Missing calendar days are explicitly represented as empty slots, never interpolated.
4. Categorical moods are rendered with clear labels/chips/emojis.
5. All 367 tests continue to pass; mobile UI compiles cleanly without `react-native-chart-kit` line smoothing.

---

## 3. Breathing Telemetry

### A. Current Storage
- **Convex Table:** `breathingLogs` (defined in `convex/schema.ts:618–638`)
- **Key Fields:**
  - `userId: v.string()`
  - `protocolId: v.string()` (e.g. `"box-breathing"`, `"4-7-8"`)
  - `protocolName: v.string()` (e.g. `"Box Breathing"`, `"4-7-8 Breathing"`)
  - `pattern: v.object({ inhale: v.number(), hold1: v.number(), exhale: v.number(), hold2: v.number() })`
  - `targetCycles: v.number()`
  - `cyclesCompleted: v.number()`
  - `durationSeconds: v.number()`
  - `status: v.union(v.literal("completed"), v.literal("abandoned"))`
  - `startedAt: v.number()`
  - `completedAt: v.optional(v.number())`
  - `createdAt: v.number()`

### B. Current Completion Semantics
- **Authoritative Completion Criteria:**
  - `status === "completed"`
  - AND `completedAt !== undefined`
  - AND `cyclesCompleted >= targetCycles` (verified in `convex/breathing.ts:logSession`)

### C. Available Duration Data
- `durationSeconds: v.number()` is stored reliably for each session.
- Minutes can be calculated deterministically as `Math.round(durationSeconds / 60)` or total seconds converted at aggregation time.

### D. Existing Queries
- `convex/breathing.ts:getUserLogs({ userId, limit })`:
  - Enforces `assertCanAccessStudent(ctx, student._id)`.
  - Returns raw log documents (ordered by `createdAt desc`).
- `convex/breathing.ts:getRecentSession({ userId })`:
  - Returns the latest session for the user.
- **Counselor Timeline Integration:** Priority 9 Step 6B integrated `breathingLogs` into `convex/timeline.ts` and `dashboard/src/pages/PatientDetail.tsx` Tab 4.
- **Student Insights Integration:** **Currently NONE.** `convex/insights.ts:getDailyStats` does not query `breathingLogs`.

### E. Required Changes for Step 4
- In `convex/insights.ts:getDailyStats`:
  - Query completed breathing sessions for the user:
    `ctx.db.query("breathingLogs").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()`
  - Filter for `log.status === "completed"`.
  - Calculate:
    - `breathingSessionsCompleted = completedBreathing.length`
    - `breathingDurationMinutes = Math.round(completedBreathing.reduce((acc, l) => acc + (l.durationSeconds ?? 0), 0) / 60)`
- Do NOT expose raw session logs, protocol parameters, or timestamps in Student Insights payload.

### F. Acceptance Criteria for Step 4B
1. Only completed sessions (`status === "completed"`) count toward totals.
2. Completed count and total minutes are accurately summed.
3. No raw logs, notes, or cycle configurations exposed to the student insights response.
4. Access control verified (student can only access their own telemetry).

---

## 4. Grounding Telemetry

### A. Current Storage
- **Convex Table:** `groundingLogs` (defined in `convex/schema.ts:639–659`)
- **Key Fields:**
  - `userId: v.string()`
  - `protocolId: v.string()` (e.g. `"5-4-3-2-1"`)
  - `protocolName: v.string()` (e.g. `"5-4-3-2-1 Sensory Grounding"`)
  - `totalSteps: v.number()` (typically `5`)
  - `stepsCompleted: v.number()`
  - `durationSeconds: v.number()`
  - `status: v.union(v.literal("completed"), v.literal("abandoned"))`
  - `startedAt: v.number()`
  - `completedAt: v.optional(v.number())`
  - `createdAt: v.number()`

### B. Current Completion Semantics
- **Authoritative Completion Criteria:**
  - `status === "completed"`
  - AND `completedAt !== undefined`
  - AND `stepsCompleted === totalSteps` (verified in `convex/grounding.ts:logSession`)

### C. Available Duration Data
- `durationSeconds: v.number()` is stored reliably for each session.
- Minutes calculated deterministically as `Math.round(durationSeconds / 60)` or total seconds converted at aggregation time.

### D. Existing Queries
- `convex/grounding.ts:getUserLogs({ userId, limit })`:
  - Enforces `assertCanAccessStudent(ctx, student._id)`.
  - Returns raw log documents (ordered by `createdAt desc`).
- `convex/grounding.ts:getRecentSession({ userId })`:
  - Returns the latest session for the user.
- **Counselor Timeline Integration:** Priority 9 Step 6B integrated `groundingLogs` into `convex/timeline.ts`.
- **Student Insights Integration:** **Currently NONE.** `convex/insights.ts:getDailyStats` does not query `groundingLogs`.

### E. Required Changes for Step 4
- In `convex/insights.ts:getDailyStats`:
  - Query completed grounding sessions for the user:
    `ctx.db.query("groundingLogs").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()`
  - Filter for `log.status === "completed"`.
  - Calculate:
    - `groundingSessionsCompleted = completedGrounding.length`
    - `groundingDurationMinutes = Math.round(completedGrounding.reduce((acc, l) => acc + (l.durationSeconds ?? 0), 0) / 60)`
- Do NOT expose raw session logs or steps data to the student insights response.

### F. Acceptance Criteria for Step 4C
1. Only completed sessions (`status === "completed"`) count toward totals.
2. Completed count and total minutes are accurately summed.
3. No raw logs or sensory inputs exposed to the student insights response.
4. Access control verified.

---

## 5. Mindful Relaxation Contract

### A. Approved Metric Definition
Under the Priority 11 Step 2 Metric Contract, guided somatic exercises (JPMR, Breathing, Grounding) are unified under the non-clinical behavioral umbrella: **"Mindful Relaxation"**.

### B. Mathematical Aggregation
$$\text{mindfulRelaxationMinutes} = \text{jpmrMinutes} + \text{breathingDurationMinutes} + \text{groundingDurationMinutes}$$
$$\text{mindfulRelaxationSessions} = \text{jpmrSessionsCompleted} + \text{breathingSessionsCompleted} + \text{groundingSessionsCompleted}$$

Where:
- $\text{jpmrMinutes}$: $\text{Math.round}\left(\sum \text{jpmrLogs.durationSeconds} / 60\right)$ (or legacy `duration`) for `completedAt !== undefined`.
- $\text{breathingDurationMinutes}$: $\text{Math.round}\left(\sum \text{breathingLogs.durationSeconds} / 60\right)$ for `status === "completed"`.
- $\text{groundingDurationMinutes}$: $\text{Math.round}\left(\sum \text{groundingLogs.durationSeconds} / 60\right)$ for `status === "completed"`.

### C. Prohibited Terminology & Clinical Boundaries
- **STRICTLY PROHIBITED:**
  - "Therapeutic effectiveness"
  - "Clinical improvement"
  - "Recovery rate"
  - "Anxiety reduction factor"
  - "Depression alleviation minutes"
  - Any correlation between relaxation minutes and PHQ-9/GAD-7/PQ-16 scores.
- **APPROVED TERMINOLOGY:**
  - "Mindful Relaxation"
  - "Relaxation Practice (minutes)"
  - "Breathing Exercises Completed"
  - "Grounding Sessions Completed"
  - "Guided Body Relaxation (JPMR) Completed"

### D. Payload Shape in `convex/insights.ts:getDailyStats`
```typescript
mindfulRelaxation: {
  totalMinutes: number;
  totalSessions: number;
  breakdown: {
    breathing: {
      sessionsCompleted: number;
      minutes: number;
    };
    grounding: {
      sessionsCompleted: number;
      minutes: number;
    };
    jpmr: {
      sessionsCompleted: number;
      minutes: number;
    };
  };
}
```
*(Note: To maintain backwards compatibility with existing UI callers, preserve `jpmrMinutes` and `jpmrSessions` as top-level fields during migration).*

---

## 6. Timezone Audit

| Area | Current Behavior | Contract Compliant? | Required Change | File |
|------|------------------|---------------------|-----------------|------|
| **Daily Check-in Storage** | Client supplies `dateStr` (`"YYYY-MM-DD"`) from device local time; server stores as-is in `dailyCheckins.dateStr`. | **YES** | None. Preserves client local date. | `convex/insights.ts`, `app/(auth)/(tabs)/index.tsx` |
| **Check-in Deduplication** | `insights.ts:getDailyStats` deduplicates records matching `c.dateStr` using `seenDates.has(c.dateStr)`. | **YES** | None. Deduplication key is purely calendar date string. | `convex/insights.ts` |
| **Mood Window Selection** | `insights.ts` uses `.slice(0, 7)` over all sorted historic check-ins. If check-ins are sparse (e.g. 1 per month), it displays a 7-entry list spanning 7 months rather than the last 7 calendar days. | **NO** | Client or query should supply local reference date and build a strict 7-day local calendar window (`[dateStr - 6 days ... dateStr]`). | `convex/insights.ts`, `app/(auth)/(tabs)/insights.tsx` |
| **Mobile Weekday Formatting** | `insights.tsx:41`: `new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: "short" })`. Can shift day-of-week by $\pm 1$ in negative UTC offsets if midnight is parsed as UTC. | **NO (Fragile)** | Parse `dateStr` with explicit local year, month, date constructor (`new Date(year, month - 1, day, 12, 0, 0)`) to anchor at local noon and avoid timezone boundary roll-backs. | `app/(auth)/(tabs)/insights.tsx` |
| **Institutional 7-Day Window** | `convex/dashboard.ts:90–96`: Iterates `new Date()` 7 times to compute `startOfDay` and `endOfDay` using server execution timezone. | **NO (Deferred to Step 5)** | Institutional dashboard uses server/campus timezone. Does not affect individual Student Insights in Step 4. | `convex/dashboard.ts` |
| **Breathing / Grounding Date Filtering** | Sessions store `startedAt` and `completedAt` as epoch milliseconds. | **YES** | When filtering by date, derive start/end timestamps from student local date window or match `createdAt` against local day boundaries. | `convex/breathing.ts`, `convex/grounding.ts` |

---

## 7. Authorization Review

Every query touched or integrated in Step 4 must adhere to strict role-based access control and tenant isolation:

| Query / Operation | Access Control Function | Authorized Roles | Cross-Student Exposure Risk | Compliance State |
|-------------------|-------------------------|------------------|-----------------------------|------------------|
| `insights.getDailyStats` | Internal auth check: `getUserByClerkId` matching current authenticated student. | Self (Student only) | **NONE** (scopes queries by `user._id`). | **COMPLIANT** |
| `breathing.getUserLogs` | `assertCanAccessStudent(ctx, student._id)` | Self (Student) or Assigned Counselor/Admin | **NONE** (explicit tenant & relationship check). | **COMPLIANT** |
| `grounding.getUserLogs` | `assertCanAccessStudent(ctx, student._id)` | Self (Student) or Assigned Counselor/Admin | **NONE** (explicit tenant & relationship check). | **COMPLIANT** |
| `breathing.logSession` | `getUserByClerkId(ctx, identity.subject)` | Self (Student only) | **NONE** (writes only to own `userId`). | **COMPLIANT** |
| `grounding.logSession` | `getUserByClerkId(ctx, identity.subject)` | Self (Student only) | **NONE** (writes only to own `userId`). | **COMPLIANT** |

**Authorization Findings:**
1. No student can access or query another student's breathing or grounding telemetry.
2. In `getDailyStats`, queries are constrained to `q.eq("userId", user._id)`.
3. Counselor visibility into breathing and grounding is already isolated to the clinical timeline and patient detail tables via `assertCanAccessStudent` (verified in Priority 9 Step 6B).
4. No AI Companion (Mitra) chat transcripts or raw clinical diagnostic scores are exposed to Student Insights.

---

## 8. Step 5 Deferred Findings (Performance & Scalability)

In accordance with the strict scope boundary, the following performance patterns are identified for Priority 11 Step 5 and **MUST NOT** be implemented in Step 4:

1. **Unbounded Telemetry Queries (`.collect()`):**
   - `convex/insights.ts:getDailyStats`:
     - `dailyCheckins.withIndex("by_user").collect()` loads all historical check-ins for the user into server memory.
     - `jpmrLogs.withIndex("by_user").collect()` loads all JPMR logs.
     - In Step 4, adding `.collect()` for `breathingLogs` and `groundingLogs` is acceptable for small student history (<500 sessions), but represents an unbounded collection pattern that Step 5 must bound with index-based ranges or aggregation counters.
2. **Missing Date-Range Compound Indexes:**
   - `breathingLogs` has index `by_user` on `["userId"]`. Querying a 7-day or 30-day window requires loading all user logs and filtering in memory.
   - `groundingLogs` has index `by_user` on `["userId"]`.
   - *Deferred to Step 5:* Schema additions like `by_user_created` on `["userId", "createdAt"]` or monthly rolled-up counters.
3. **Institutional Aggregation Tables:**
   - `convex/dashboard.ts` queries multiple tables for campus-wide metrics. Step 5 will address aggregate rollup tables.

---

## 9. Proposed Implementation Sequence

To ensure minimal, zero-regression changes, the future Step 4 implementation should proceed in 7 discrete sub-steps:

- **Step 4A — Student Mood Visualization Remediation:**
  - Deprecate `moodToIntensity` and remove artificial 1–10 scalar mapping.
  - In `app/(auth)/(tabs)/insights.tsx`, replace `react-native-chart-kit` `LineChart` and Bézier curve with a 7-day discrete calendar chip/card grid.
  - Display nominal mood tags/emojis and explicit empty-day states.
- **Step 4B — Breathing Telemetry Integration in `getDailyStats`:**
  - Query completed `breathingLogs` in `convex/insights.ts`.
  - Compute total completed sessions and duration minutes.
- **Step 4C — Grounding Telemetry Integration in `getDailyStats`:**
  - Query completed `groundingLogs` in `convex/insights.ts`.
  - Compute total completed sessions and duration minutes.
- **Step 4D — Mindful Relaxation Metric Aggregation:**
  - Combine JPMR, Breathing, and Grounding into `mindfulRelaxation` summary payload.
  - Update `app/(auth)/(tabs)/insights.tsx` to display unified "Mindful Relaxation" section with non-clinical breakdowns.
- **Step 4E — Timezone & Local Date Boundary Hardening:**
  - Provide local noon timestamp parsing in mobile date helpers to prevent UTC boundary shifts.
  - Align recent 7-day mood view with the student's actual local calendar window.
- **Step 4F — Comprehensive Regression Testing:**
  - Write dedicated Vitest tests verifying:
    - Non-clinical metric aggregation
    - Session completion filtering (ignoring abandoned sessions)
    - Categorical mood preservation (no numeric conversion)
    - Student isolation and access control
- **Step 4G — Final Build & Typecheck Validation:**
  - Verify all unit and integration tests pass.
  - Verify clean TypeScript compilation across mobile and dashboard.
  - Verify counselor dashboard build.

---

## 10. Test Plan

When implementation begins, the following exact test coverage must be added to a new test file `convex/priority11_step4.test.ts`:

1. **`P11-MOOD-01`**: `recentDailyMood` returns categorical string values without scalar numbers (intensity removed or deprecated).
2. **`P11-MOOD-02`**: Unchecked calendar days within the 7-day window are represented with `hasCheckin: false` / `mood: null`, not omitted or interpolated.
3. **`P11-TELEMETRY-01`**: `breathingLogs` with `status: "completed"` are counted toward `mindfulRelaxation`; `status: "abandoned"` sessions are strictly ignored.
4. **`P11-TELEMETRY-02`**: `groundingLogs` with `status: "completed"` and 5/5 steps are counted; abandoned sessions are ignored.
5. **`P11-RELAX-01`**: `mindfulRelaxationMinutes` correctly sums JPMR, Breathing, and Grounding durations.
6. **`P11-AUTH-01`**: `getDailyStats` cannot access another student's breathing or grounding logs.
7. **`P11-TIMEZONE-01`**: Check-ins recorded with local `dateStr` are correctly grouped without UTC day shift.

---

## 11. Scope Guard

We explicitly confirm that during this audit:
- [x] **No production code was modified** in `convex/`, `app/`, `components/`, or `dashboard/`.
- [x] **No database schema was modified** (`convex/schema.ts` untouched).
- [x] **No clinical scoring logic was altered** (PHQ-9, GAD-7, PQ-16 untouched).
- [x] **No clinical triage or safety alert thresholds were modified**.
- [x] **No Mitra AI prompts, functions, or schemas were altered**.
- [x] **WSAS and ReQoL-10 remain completely inactive**.
- [x] **No Priority 11 Step 5 scalability or pagination changes were implemented**.
- [x] **No Priority 12+ work was initiated**.

---

## 12. Verification & Validation Baseline

- **Test Suite Status:** 367 / 367 tests passing (19 test files)
- **TypeScript (`npx tsc --noEmit`):** Clean (exit code 0)
- **Dashboard Production Build (`npm --prefix dashboard run build`):** Clean (exit code 0)
- **Git Working Tree State:** No uncommitted changes introduced in this step.
