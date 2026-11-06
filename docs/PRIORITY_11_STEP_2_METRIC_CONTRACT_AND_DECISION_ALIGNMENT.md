# Priority 11 — Step 2: Metric Contract & Clinical/Product Decision Alignment

## 1. Status

**Status: DECISION ALIGNMENT COMPLETE — IMPLEMENTATION PENDING**  
**Execution Mode: Read-Only Contract Definition & Governance Alignment**  
**Production Code / Schema Changes: ZERO (Strictly Read-Only)**  

---

## 2. Source Audit

Reference: [PRIORITY_11_STEP_1_PROGRESS_INSIGHTS_AUDIT.md](file:///d:/Projects/EmotifyApp/Emotify-Clerk/PRIORITY_11_STEP_1_PROGRESS_INSIGHTS_AUDIT.md)

### Key Audit Findings Informing Decisions:
1. **Misleading Clinical "Improvement" Claims:** `dashboard/src/pages/Analytics.tsx` mislabels raw cross-sectional score averages as `"Avg PHQ-9 Improvement ... Longitudinal depression reduction"`. In `convex/dashboard.ts`, `avgPhqScore` is simply the arithmetic average of raw scores across all attempts (`totalPhq / count`). It is **not** an improvement delta and falsely implies clinical recovery.
2. **Fabricated Institutional Engagement:** `convex/dashboard.ts` generates Active Users as hardcoded formulas (`dau = patients.length * 0.45`, `wau = 0.75`) labeled `"High institutional engagement"`, presenting synthetic numbers as real clinical engagement telemetry.
3. **Calm Points Calculation Bug:** In `convex/insights.ts` (line 131), `totalCalmPoints` sums `g.points` across **all** micro-goals in the user's table without filtering `if (g.completed)`. A student with 4 pending or skipped goals worth 25 points each is erroneously awarded 100 Calm Points.
4. **Pseudo-Clinical Line Smoothing on Student Mood Trend:** In `app/(auth)/(tabs)/insights.tsx`, discrete categorical check-in moods are mapped to arbitrary 1–10 integers (`moodToIntensity`) and rendered on a Bézier curve line chart. It connects non-consecutive days as if continuous, misrepresenting qualitative check-ins as clinical intensity metrics.
5. **Modern Interventions Omitted from Student Insights:** Priority 9 somatic tools (`breathingLogs` and `groundingLogs`) are completely ignored by `convex/insights.ts` (`getDailyStats`). The student Insights screen reflects only JPMR under "RELAXATION", denying students credit for breathing and grounding.
6. **Data Minimization Violation in Student Insights:** `insights.getDailyStats` sends full historical `screenings` and `triages` arrays over the wire to `insights.tsx`, which renders neither of them.
7. **Inconsistent Gamification Accounting:** Three competing sources of user "points" exist: `points.totalPoints` (orphaned), `users.xp` (used on Home/Profile), and `microGoals.points` sum (used in Insights as "Calm Points").
8. **Server-Side UTC Midnight Date-Boundary Error:** In `convex/microGoals.ts` (`getTodayGoals`), `startOfDay` is generated as UTC midnight from `dateStr`. For students in non-UTC timezones (e.g. IST, UTC+5:30), goals scheduled between 00:00 and 05:30 local time disappear from "Today's Goals".
9. **Unbounded In-Memory Database `.collect()` Queries:** `convex/dashboard.ts`, `convex/insights.ts`, and `convex/timeline.ts` query whole tables (`triages`, `alerts`, `cbtSessions`, `users`, `screeningAttempts`) in memory without cursor pagination or date bounds.

---

## 3. Metric Contract

| Metric Name | Authoritative Source | Calculation / Definition | Target Population | Time Window | Classification | Student Visibility | Counselor Visibility | Approved Clinical / Behavioral Label |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **Institutional Mean PHQ-9** | `screeningAttempts` | Arithmetic mean of total scores across completed attempts ($\frac{\sum \text{PHQ-9}}{\text{count}}$) | Enrolled students with completed screening | Configurable / Academic term | Institutional Assessment Metric | No | Yes | `"Institutional Mean PHQ-9 (Depression Screening)"` |
| **Institutional Mean GAD-7** | `screeningAttempts` | Arithmetic mean of total scores across completed attempts ($\frac{\sum \text{GAD-7}}{\text{count}}$) | Enrolled students with completed screening | Configurable / Academic term | Institutional Assessment Metric | No | Yes | `"Institutional Mean GAD-7 (Anxiety Screening)"` |
| **Individual Longitudinal Change ($\Delta \text{PHQ-9}$)** | `screeningAttempts` | Follow-up score minus baseline score ($\text{Score}_{\text{latest}} - \text{Score}_{\text{baseline}}$) | Students with $\ge 2$ completed screening attempts | Baseline to Latest attempt | Individual Clinical Change Metric | No | Yes | `"PHQ-9 Score Shift (Baseline to Follow-up)"` |
| **Individual Longitudinal Change ($\Delta \text{GAD-7}$)** | `screeningAttempts` | Follow-up score minus baseline score ($\text{Score}_{\text{latest}} - \text{Score}_{\text{baseline}}$) | Students with $\ge 2$ completed screening attempts | Baseline to Latest attempt | Individual Clinical Change Metric | No | Yes | `"GAD-7 Score Shift (Baseline to Follow-up)"` |
| **Clinical Triage Tier** | `triages`, `screeningAttempts` | Deterministic classification: `mild`, `moderate`, `severe`, `suicide_flag`, `psychosis_flag` | Enrolled students with completed screening | Latest attempt | Standardized Clinical Triage | No | Yes | `"Clinical Triage Level"` |
| **Daily Check-in Mood** | `dailyCheckins` | Directly selected categorical emotion identifier (`great`, `good`, `calm`, `low`, `anxious`) | Individual student | 1 calendar day (`dateStr`) | Behavioral Telemetry | Yes | Yes | `"Self-Reported Daily Mood (Non-Diagnostic)"` |
| **Total Lifetime Check-ins** | `dailyCheckins` | Count of distinct calendar dates with a recorded check-in | Individual student | Lifetime | Behavioral Activity Metric | Yes | Yes | `"Total Check-ins"` |
| **Habit Streak** | `streaks` | Count of consecutive local calendar days with a completed check-in | Individual student | Continuous rolling | Behavioral Gamification | Yes | Yes | `"Daily Check-in Streak"` |
| **Calm Points (Earned)** | `microGoals` | Sum of `points` across completed micro-goals ($\sum_{\text{completed}} \text{points}$) | Individual student | Lifetime | Behavioral Gamification | Yes | No | `"Calm Points (Earned Goals)"` |
| **Goals Met Count** | `microGoals` | Count of micro-goals marked `completed === true` | Individual student | Lifetime | Behavioral Activity Metric | Yes | Yes | `"Goals Met"` |
| **Goal Completion Rate** | `microGoals` | Percentage of accepted goals completed ($\frac{\text{completed}}{\text{accepted}} \times 100$) | Individual student | Last 14 days / Lifetime | Behavioral Engagement Metric | No | Yes | `"Goal Activation Rate"` |
| **CBT Tension Delta** | `cbtSessions` | Immediate pre-exercise minus post-exercise rating ($\text{emotionBefore} - \text{emotionAfter}$) | Completed CBT sessions | Single session | Acute Behavioral Signal | No | Yes | `"Acute Session Tension Delta"` |
| **CBT Reframe Belief** | `cbtSessions` | Self-reported post-reframe belief rating (0–100%) | Completed CBT sessions | Single session | Acute Cognitive Signal | No | Yes | `"Reframe Belief Rating"` |
| **Thinking Styles Distribution** | `cbtSessions` | Categorical frequency histogram of identified distortions | Completed CBT sessions | Lifetime | Behavioral Pattern | No | Yes | `"Identified Thinking Styles"` |
| **JPMR Relaxation Duration** | `jpmrLogs` | Sum of completed timer seconds divided by 60 | Completed sessions | Lifetime | Behavioral Telemetry | Yes | Yes | `"JPMR Muscle Relaxation Duration"` |
| **Paced Breathing Activity** | `breathingLogs` | Completed sessions count and pacing cycles completed | Completed sessions | Lifetime | Behavioral Telemetry | Yes | Yes | `"Paced Breathing Cycles & Sessions"` |
| **Sensory Grounding Activity** | `groundingLogs` | Completed sessions count and 5-4-3-2-1 steps completed | Completed sessions | Lifetime | Behavioral Telemetry | Yes | Yes | `"Sensory Grounding Practice"` |
| **Combined Somatic Relaxation** | `jpmrLogs`, `breathingLogs`, `groundingLogs` | Total combined active minutes across JPMR, Breathing, Grounding | Completed sessions | Lifetime | Behavioral Telemetry | Yes | No | `"Total Mindful Relaxation Minutes"` |
| **User Experience (XP) & Level**| `users` | Cumulative XP and level threshold ($100, 250, \dots$) | Individual student | Lifetime | Progression Gamification | Yes | Yes | `"Level & Experience (XP)"` |

---

## 4. Clinical Assessment Metrics

### Standardized Psychometric Instruments (Active)
1. **PHQ-9 (Patient Health Questionnaire - 9 items):**
   - **Range:** 0 to 27.
   - **Clinical Tiers:** Minimal (0–4), Mild (5–9), Moderate (10–14), Moderately Severe (15–19), Severe (20–27).
   - **Safety Flag:** Item 9 $> 0$ immediately triggers `suicide_flag` triage and clinical safety alert.
   - **Status:** Active, server-side authoritative scoring in `convex/clinicalScoring.ts`.
2. **GAD-7 (Generalized Anxiety Disorder - 7 items):**
   - **Range:** 0 to 21.
   - **Clinical Tiers:** Minimal (0–4), Mild (5–9), Moderate (10–14), Severe (15–21).
   - **Status:** Active, server-side authoritative scoring in `convex/clinicalScoring.ts`.
3. **PQ-16 (Prodromal Questionnaire Brief - 16 items):**
   - **Range:** 0 to 16.
   - **Clinical Cutoff:** $\ge 6$ positive endorsements triggers `psychosis_flag` triage and clinical safety alert.
   - **Status:** Active, server-side authoritative scoring in `convex/clinicalScoring.ts`.

### Instruments Pending Approved Content (Inactive)
1. **WSAS (Work and Social Adjustment Scale - 5 items):**
   - **Status:** `pending_approved_content`.
   - **Clinical Rule:** Structurally defined in schema and validation module (`WSAS_CONFIG`), but **STRICTLY INACTIVE**. It is NOT administered in student screening (`app/(auth)/screening.tsx`), NOT computed in triage, and NOT rendered on any progress screen.
2. **ReQoL-10 (Recovering Quality of Life - 10 items):**
   - **Status:** `pending_approved_content`.
   - **Clinical Rule:** Structurally defined in schema and validation module (`REQOL10_CONFIG`), but **STRICTLY INACTIVE**. It is NOT administered in student screening, NOT computed in triage, and NOT rendered on any progress screen.

---

## 5. Longitudinal Clinical Change Contract

To eliminate the dangerous conflation of raw scores with clinical recovery, the system formally establishes three distinct concepts:

### A. Institutional Mean (Cross-Sectional)
- **Approved Terminology:** `"Institutional Mean PHQ-9"` / `"Institutional Mean GAD-7"`.
- **Definition:** The arithmetic average of all completed screening attempts within the institution.
- **Population:** All students with at least 1 completed screening attempt.
- **Rules:**
  - Abandoned or in-progress attempts are **strictly excluded**.
  - Must be clearly labeled: `"Institutional Mean Score (Not an improvement delta)"`.
  - Must **never** be labeled as "improvement", "depression reduction", or "recovery".

### B. Individual Longitudinal Change (Delta)
- **Approved Terminology:** `"PHQ-9 Score Shift"` / `"GAD-7 Score Shift"`.
- **Definition:** The mathematical difference between a follow-up assessment and the baseline assessment:
  $$\Delta = \text{Score}_{\text{latest}} - \text{Score}_{\text{baseline}}$$
- **Eligibility:**
  - Students with **only one attempt** have $\Delta = \text{undefined}$ (displayed as `"Baseline Only — No comparison available"`). Single-attempt users MUST NOT be assigned a zero delta.
  - Baseline attempt is the chronologically first completed attempt (`attemptType === "baseline"`).
  - Follow-up attempt is the chronologically newest completed attempt (`attemptType === "reassessment"` or `"force_retest"`).
- **Directionality:**
  - Negative delta ($\Delta < 0$): Lower symptom endorsement at follow-up (labeled `"Score reduction: X pts"`).
  - Positive delta ($\Delta > 0$): Higher symptom endorsement at follow-up (labeled `"Score increase: +X pts"`). If $\Delta \ge 5$, triggers escalation monitoring per clinical protocol.
- **Audience:** Counselor-only. **Must NOT be displayed to students in mobile app** to prevent pathologizing score fluctuations or triggering screening anxiety.

### C. Institutional Aggregate Change
- **Approved Terminology:** `"Cohort Mean Score Shift"`.
- **Definition:** The average of individual deltas across all students who have completed $\ge 2$ screenings:
  $$\text{Mean Shift} = \frac{\sum (\text{Score}_{\text{latest}} - \text{Score}_{\text{baseline}})}{N_{\ge 2}}$$
- **Status:** **REQUIRES CLINICAL PRODUCT DECISION** regarding whether this metric should be surfaced in administrative analytics or withheld until minimum cohort sizes ($N \ge 30$) are met to prevent statistical skew.

---

## 6. Behavioral Progress Contract

Behavioral telemetry reflects student engagement with self-care tools. It must remain clearly distinguished from clinical diagnostic evaluations:

1. **Daily Mood (`dailyCheckins`):**
   - Qualitative self-report of current subjective emotional state.
   - Strictly non-diagnostic; does not alter triage tiers or clinical risk status.
2. **Micro-Goals (`microGoals`):**
   - Behavioral activation tasks designed to foster routine and agency.
   - Completion rate reflects tool engagement, **not** clinical remission.
3. **CBT Tension Delta (`emotionBefore` vs `emotionAfter`):**
   - Measures acute situational relief experienced during a specific 5-step cognitive restructuring exercise.
   - **Contract Rule:** Must be labeled `"Acute Session Tension Delta"` or `"Immediate Tension Relief"`. Must **never** be labeled as "Recovery Trend" or "Depression Recovery".
4. **Cognitive Reframes (`reframeLogs`):**
   - Tracks cognitive exercises where unhelpful thoughts were identified and reframed.
   - Count represents coping skill practice.
5. **Streaks (`streaks`):**
   - Measures consecutive calendar days of opening the app and completing a check-in.
   - Reflects app habit formation; does not indicate psychiatric health.

---

## 7. Gamification Contract

The platform establishes an unambiguous hierarchy for points and gamification tokens:

```
┌─────────────────────────────────────────────────────────────┐
│                 GAMIFICATION ARCHITECTURE                   │
├──────────────────────────────┬──────────────────────────────┤
│ Progression Currency (XP)    │ Earned Reward (Calm Points)  │
│  - Stored in: users.xp       │  - Derived from: microGoals  │
│  - Earned via: all actions   │  - Earned via: goal complete │
│  - Drives: user level (1-10) │  - Displayed in: Insights    │
├──────────────────────────────┴──────────────────────────────┤
│ Orphaned Legacy Entity: points table (DEPRECATED)           │
└─────────────────────────────────────────────────────────────┘
```

1. **XP (`users.xp`):**
   - The primary progression currency across Emotify.
   - Displayed on the Student Home Screen and Profile Screen.
   - Drives leveling ($1 \to 10$) deterministically via `getLevelForXp`.
2. **Calm Points (`totalCalmPoints`):**
   - Specifically represents points awarded for completed behavioral micro-goals.
   - **Contract Definition:** Equals the exact sum of `points` for micro-goals marked `completed === true`.
3. **`points` Table:**
   - Pre-existing table in `convex/schema.ts` with field `totalPoints: v.number()`.
   - **Contract Decision:** Formally marked as **DEPRECATED**. Zero new writes should target this table, and existing query readers have already migrated to `users.xp`.
4. **Level (`users.level`):**
   - Deterministic integer ($1 \le \text{level} \le 10$) derived directly from cumulative XP.

---

## 8. Intervention Telemetry Contract

Priority 9 introduced dedicated persistence for somatic interventions. The Progress & Insights subsystem must incorporate them with clear completion criteria:

### 1. JPMR (`jpmrLogs`)
- **Completion Criteria:** Session marked `completed === true` with valid `durationSeconds > 0`.
- **Duration Accounting:** Direct timer elapsed time (`durationSeconds`). Abandoned sessions ($< 60\text{s}$ or uncompleted) do not contribute to relaxation minutes.

### 2. Paced / Box / Calming Breathing (`breathingLogs`)
- **Completion Criteria:** `status === "completed"` or `status === "partial"` with `cyclesCompleted \ge 1`.
- **Duration Accounting:** Active duration elapsed (`durationSeconds`).
- **Telemetry Display:** Cycles completed vs target cycles; protocol name (`box_4444`, `paced_444`, etc.).

### 3. 5-4-3-2-1 Sensory Grounding (`groundingLogs`)
- **Completion Criteria:** `status === "completed"` (all 5 steps finished) or `status === "partial"` ($\ge 1$ step finished).
- **Duration Accounting:** Active duration elapsed (`durationSeconds`).
- **Telemetry Display:** Steps completed (0–5); protocol name (`sensory_54321`). Zero free-text input or environmental descriptions.

### 4. Combined Somatic Practice in Student Insights
- Rather than displaying separate confusing counters for every individual protocol, Student Insights should display:
  1. `"Mindful Relaxation"`: Total active minutes across JPMR, Breathing, and Grounding.
  2. Sub-breakdown in Activity Stats: JPMR Sessions, Breathing Sessions, Grounding Sessions.

---

## 9. Student Insights Contract

To enforce strict privacy, data minimization, and clean domain boundaries, the student Insights endpoint (`api.insights.getDailyStats`) must adhere to this classification contract:

| Data Element | Contract Classification | Treatment in Response Payload |
| :--- | :---: | :--- |
| `totalCalmPoints` | **REQUIRED** | Return computed integer (completed goals only). |
| `completedGoalsCount` | **REQUIRED** | Return count of completed micro-goals. |
| `recentDailyMood` | **REQUIRED** | Return 7-day categorical check-in history with local `dateStr`. |
| `totalCheckins` | **REQUIRED** | Return count of distinct check-in calendar dates. |
| `reframesCount` | **REQUIRED** | Return count of completed reframe exercises. |
| `relaxationMinutes` | **REQUIRED** | Return combined duration across JPMR, Breathing, and Grounding. |
| `breathingSessionsCount` | **OPTIONAL** | Return count of completed breathing sessions. |
| `groundingSessionsCount` | **OPTIONAL** | Return count of completed grounding sessions. |
| `microGoals` (full raw records) | **MUST NOT BE SENT** | Strip from response. Client only needs aggregate counts. |
| `jpmrLogs` (full raw records) | **MUST NOT BE SENT** | Strip from response. Client only needs aggregate duration. |
| `reframeLogs` (full raw records) | **MUST NOT BE SENT** | Strip from response. Client only needs aggregate count. |
| `screeningAttempts` (clinical) | **MUST NOT BE SENT** | **STRICTLY EXCLUDED.** Exposing clinical scores on behavioral tab is a privacy defect. |
| `screenings` (legacy mirror) | **MUST NOT BE SENT** | **STRICTLY EXCLUDED.** |
| `triages` (clinical risk tier) | **MUST NOT BE SENT** | **STRICTLY EXCLUDED.** |
| `alerts` (safety alerts) | **MUST NOT BE SENT** | **STRICTLY EXCLUDED.** |
| `aiCompanionLogs` (Mitra chat) | **MUST NOT BE SENT** | **STRICTLY EXCLUDED.** |

---

## 10. Counselor Insights Contract

Counselors inspect student progress to inform clinical care. The dashboard must maintain visual and semantic boundaries between clinical assessment and behavioral telemetry:

### 1. Tab 1: Standardized Clinical Assessments
- **Allowed Content:** PHQ-9, GAD-7, and PQ-16 longitudinal score curves, historical attempt dates, Item 9 endorsements, and clinical triage tier.
- **Restricted Labeling:** The chart must be titled `"Standardized Clinical Score Trends"`. The tag `"TELEMETRY"` must be **removed**, as psychometric instruments are formal clinical milestone evaluations, not passive telemetry.
- **Behavioral Section:** The `"Daily Wellness Check-ins"` table must remain visually boxed and explicitly sub-headed: `"Student-Reported Wellness Telemetry — Non-Diagnostic"`.

### 2. Tab 3: AI CBT Therapy Analytics
- **Restricted Labeling:** The chart currently titled `"Recovery Progress Chart"` must be retitled to `"Acute Session Tension Delta (Pre vs Post Exercise)"`.
- **Restricted Labeling:** The summary card `"Recovery Plans Created"` must be retitled to `"Action Plans Created"`.

### 3. Tab 4: Somatic & Sensory Interventions
- Dedicated tables for JPMR, Emotion Maps, Breathing Sessions, and Sensory Grounding Sessions.
- Each table displays completion status, duration, and protocol metadata without implying clinical cure.

---

## 11. Timezone Contract

To prevent off-by-one errors and midnight date-boundary shifts across worldwide student populations:

1. **Mandatory Client Local Date (`dateStr`):**
   - Every daily operation (`submitMorningCheckin`, `getTodayCheckin`, `getTodayGoals`, `getStreak`) **MUST** accept a client-generated local date string (`YYYY-MM-DD` via `getLocalDateString()`).
2. **Prohibition of Server UTC Midnight as Local Boundary:**
   - Backend queries must **never** construct local day start via `new Date(y, m - 1, d, 0, 0, 0, 0).getTime()` on the Convex server runtime, as this evaluates to midnight UTC.
   - For daily goal matching, the backend must match directly against the record's `dateStr` field (`q.eq("dateStr", args.dateStr)` or `q.eq("date", args.dateStr)`).
3. **Absence of `dateStr` Fallback Policy:**
   - If `args.dateStr` is omitted by an older client, the backend must reject the request with a descriptive error or accept a client timezone offset (`timezoneOffsetMinutes`) to compute the true local calendar date, rather than falling back to `toISOString().split("T")[0]` in UTC.
4. **Rolling Time Windows:**
   - For multi-day lookbacks (e.g. 7-day or 14-day history), window boundaries must be computed using local calendar dates (e.g. subtracting calendar days via `getPreviousDateStr`) rather than subtracting milliseconds from `Date.now()`.

---

## 12. Scalability Contract

To prevent in-memory denial-of-service and database execution timeouts as user cohorts scale:

1. **Mandatory Bounding on Longitudinal Queries:**
   - Unconditional `.collect()` calls on high-volume tables (`dailyCheckins`, `microGoals`, `jpmrLogs`, `breathingLogs`, `groundingLogs`, `cbtSessions`) are **prohibited** without query bounds.
   - High-frequency query endpoints (`getDailyStats`, `getCounselorStudentDailyCheckins`, `getStudentClinicalTimeline`) must enforce explicit bounds:
     - Daily check-ins: capped to the most recent 30 entries (`.take(30)`).
     - Interventions: capped to the most recent 50 entries per table (`.take(50)`).
2. **Institutional Analytics Server-Side Aggregation:**
   - In `convex/dashboard.ts` (`getEnterpriseAnalytics`), reading entire tables into memory (`users.collect()`, `triages.collect()`, `screeningAttempts.collect()`) is a critical scalability blocker.
   - **Contract Rule:** Aggregations must be refactored into indexed queries or scheduled internal cron accumulators that maintain pre-aggregated counts (e.g. `systemStats` table updated on attempt completion) rather than performing ad-hoc full-table scans.
3. **Maximum Response Payload Sizes:**
   - Student `insights.getDailyStats` response payload must not exceed **25 KB** (currently transmits large unnecessary raw record arrays exceeding 100 KB).
   - Counselor timeline queries must support pagination (cursor-based or limit-bounded to 50 events per page).

---

## 13. Clinical Language Rules

To safeguard regulatory compliance and clinical ethics, language across the platform is governed by this explicit policy:

| Term / Phrase | Policy | Approved Usage / Replacement | Rationale |
| :--- | :---: | :--- | :--- |
| **"Recovery"** | **PROHIBITED** | Replace with: `"Tool Engagement"`, `"Habit Consistency"`, or `"Somatic Relief"`. | Prohibited because app does not diagnose remission, and intervention participation does not prove psychiatric cure. |
| **"Depression Reduction"** | **PROHIBITED** | Replace with: `"PHQ-9 Score Reduction"` (only when comparing two validated attempts). | Prohibited on behavioral screens or institutional score averages. |
| **"Anxiety Reduction"** | **PROHIBITED** | Replace with: `"GAD-7 Score Reduction"` (only when comparing two validated attempts). | Prohibited on behavioral screens or institutional score averages. |
| **"Improvement"** | **QUALIFIER REQUIRED** | Allowed ONLY with specific prefix: `"Session Tension Delta"`, `"Reframe Shift"`, or `"Score Shift"`. | Generic "improvement" deceptively implies medical cure from minor behavioral engagement. |
| **"Treatment Success"**| **PROHIBITED** | Replace with: `"Completed Protocol"` or `"Active Engagement"`. | Emotify is a supportive digital wellness tool, not a standalone medical treatment. |
| **"Clinical Progress"**| **QUALIFIER REQUIRED** | Allowed ONLY for formal reassessment comparisons reviewed by a licensed counselor. | Prohibited on student-facing self-help screens. |
| **"Therapeutic Effectiveness"**| **PROHIBITED** | Replace with: `"Intervention Completion Rate"`. | Requires rigorous clinical trial evidence; cannot be asserted from app usage metrics. |
| **"Intensity Tracking"**| **RESTRICTED** | Prohibited for categorical moods (great, calm, low). Allowed only for 1–10 slider ratings in JPMR/Reframe. | Categorical emotions do not possess scalar linear intensity. |

---

## 14. Product Decisions Required

The following decisions involve clinical governance, product positioning, or UX strategy that cannot be resolved solely from existing code evidence:

| Decision ID | Decision Title | Options Available | Recommended / Status | Clinical & Product Rationale |
| :--- | :--- | :--- | :---: | :--- |
| **PDEC-11-01** | Student Mood Trend Visualization | A: Calendar grid showing categorical daily mood chips with empty states for missed days<br>B: Discrete bar chart showing mood frequency counts over past 7 days<br>C: Keep line chart but remove smoothing and show categorical y-axis ticks | **Option A (Recommended)** | Option A accurately reflects daily check-ins without inventing fake mathematical intensity scales or connecting non-consecutive days. |
| **PDEC-11-02** | Institutional Active Users (DAU/WAU) | A: Replace with genuine distinct user check-in / session telemetry over 24h and 7d<br>B: Completely remove DAU/WAU panel from counselor analytics<br>C: Keep multiplier formulas but label as "Estimated" | **Option A (Recommended)** | Synthetic vanity multipliers destroy clinical credibility. Genuine activity can be cleanly derived from distinct `dailyCheckins` and `sessions` over rolling windows. |
| **PDEC-11-03** | Display of Longitudinal Change to Students | A: Display PHQ-9/GAD-7 score shifts directly to students on Profile screen<br>B: Keep clinical score shifts strictly counselor-facing (students only see completion date and export option) | **Option B (Recommended)** | Showing numerical depression/anxiety score fluctuations to students can induce anxiety, rumination, or fixation on scores. Standard clinical best practice keeps psychometric interpretation counselor-mediated. |
| **PDEC-11-04** | Institutional Cohort Mean Shift Metric | A: Calculate and display institutional average longitudinal shift ($\Delta$) once $N \ge 30$<br>B: Withhold aggregate longitudinal change until formal clinical outcome reporting is implemented in Priority 12 | **Option B (Recommended)** | Avoids premature claims of institutional clinical effectiveness before formalized outcome frameworks are established. |
| **PDEC-11-05** | Relaxation Duration Aggregation | A: Display single unified "Mindful Minutes" combining JPMR, Breathing, Grounding<br>B: Display three separate minute totals for JPMR, Breathing, Grounding | **Option A (Recommended)** | Single unified metric keeps student UI clean and rewards students equally regardless of which evidence-based calming tool they prefer. |

---

## 15. Implementation Dependency Graph

```
                                  ┌───────────────────────────────┐
                                  │   Priority 11 Step 2:         │
                                  │   Metric Contract & Alignment │
                                  └───────────────┬───────────────┘
                                                  │
                 ┌────────────────────────────────┴────────────────────────────────┐
                 │                                                                 │
                 ▼                                                                 ▼
┌─────────────────────────────────┐                             ┌─────────────────────────────────┐
│ Priority 11 Step 3:             │                             │ Priority 11 Step 4:             │
│ Metric Correctness & Boundaries │                             │ Telemetry & Visualization       │
│  - Fix Calm Points (completed)  │                             │  - Add Breathing/Grounding      │
│  - Correct Dashboard Labels     │                             │  - Student Mood Trend Redesign  │
│  - Remove Synthetic DAU/WAU     │                             │  - Combined Somatic Practice    │
│  - Data Minimization in Payload │                             │  - Timezone Date-Str Anchorage  │
└────────────────┬────────────────┘                             └────────────────┬────────────────┘
                 │                                                               │
                 └────────────────────────────────┬──────────────────────────────┘
                                                  │
                                                  ▼
                                  ┌───────────────────────────────┐
                                  │ Priority 11 Step 5:           │
                                  │ Scalability & Query Bounding  │
                                  │  - Unbounded .collect() caps  │
                                  │  - DailyCheckin Indexing      │
                                  │  - Institutional Aggregation  │
                                  └───────────────┬───────────────┘
                                                  │
                                                  ▼
                                  ┌───────────────────────────────┐
                                  │ Priority 11 Step 6:           │
                                  │ Final Closure & Readiness     │
                                  │  - Full Regression Suite      │
                                  │  - Clinical Sign-off          │
                                  └───────────────────────────────┘
```

---

## 16. Priority 11 Step 3 Scope

When approved to proceed, **Priority 11 Step 3** should focus strictly on **Core Metric Correctness, Labeling Remediation & Data Minimization**:

### Explicit Step 3 Scope:
1. **Calm Points Bug Fix (`convex/insights.ts`):**
   - Filter `microGoals.filter(g => g.completed)` before calculating `totalCalmPoints` so unearned points are never awarded.
2. **Dashboard Label Remediation (`dashboard/src/pages/Analytics.tsx`):**
   - Replace `"Avg PHQ-9 Improvement ... Longitudinal depression reduction"` with `"Institutional Mean PHQ-9 (Depression Screening)"`.
   - Replace `"Avg GAD-7 Improvement ... Longitudinal anxiety reduction"` with `"Institutional Mean GAD-7 (Anxiety Screening)"`.
   - Remove or replace synthetic DAU/WAU formulas in `convex/dashboard.ts` (`getEnterpriseAnalytics`).
3. **CBT Session Tension Retitling (`dashboard/src/pages/PatientDetail.tsx`):**
   - Retitle `"Recovery Progress Chart"` in Tab 3 to `"Acute Session Tension Delta"`.
   - Retitle `"Recovery Plans Created"` to `"Action Plans Created"`.
4. **Student Insights Payload Minimization (`convex/insights.ts`):**
   - Strip unrendered `screenings` and `triages` arrays from `getDailyStats` response to prevent transmitting clinical diagnostic records to the behavioral tab.

---

## 17. Explicit Non-Goals

I explicitly confirm that throughout this decision alignment:
- **NO application code was modified.**
- **NO database schema was modified.**
- **NO Convex backend functions were modified.**
- **NO React Native screens or web dashboard pages were redesigned or altered.**
- **NO clinical scoring logic or triage thresholds were altered.**
- **NO questionnaire content was modified.**
- **WSAS and ReQoL-10 remain strictly INACTIVE (structural pending approved content only).**
- **NO Mitra AI prompts or Priority 10 behaviors were touched.**
- **NO work on Priority 11 Step 3 or later was initiated.**

---

## 18. Validation

Because this task is an alignment contract specification, all validation was strictly non-destructive:

- **Vitest Regression Suite:**
  - Command: `npx vitest run`
  - Result: **18 test files passed (18/18)**
  - Total Tests: **356 passed (356/356)**
  - Duration: 6.42s
- **TypeScript Static Verification:**
  - Command: `npx tsc --noEmit`
  - Result: **Clean (0 errors, exit code 0)**
- **Dashboard Production Build:**
  - Command: `npm run build` (in `dashboard/`)
  - Toolchain: Vite v8.0.13 + tsc -b
  - Result: **Clean build in 771ms (0 errors, exit code 0)**
- **Repository Status:**
  - Working directory clean of any unauthorized production modifications.
