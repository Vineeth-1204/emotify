# Priority 11 — Step 1: Progress & Insights Audit

## 1. Audit Status

**Status: READ-ONLY AUDIT COMPLETE**  
**Execution Mode: Observation and Analysis Only**  
**Production Code / Schema Changes: ZERO (Strictly Read-Only)**  

---

## 2. Scope

This audit performed an exhaustive, read-only inspection across the full Emotify codebase to evaluate the architectural integrity, clinical boundaries, longitudinal correctness, timezone safety, authorization, privacy, and scalability of the Progress & Insights subsystems.

### Inspected Directories & Modules:
- **Student Mobile App:**
  - `app/(auth)/(tabs)/insights.tsx` (Primary student Insights & Progress screen)
  - `app/(auth)/(tabs)/index.tsx` (Student home screen with daily check-in, streak, and insight message)
  - `app/(auth)/(tabs)/profile.tsx` (Wellness identity profile, habit traits, and screening CSV export)
  - `app/(auth)/(tabs)/tools.tsx` (Intervention hub navigation)
  - `app/(auth)/tools/microgoals.tsx` & `recovery-plan.tsx` (Behavioral activation & micro-goal tracking)
  - `app/(auth)/tools/reframe.tsx` & `saved-reframes.tsx` (Cognitive reframe generation and review)
  - `app/(auth)/tools/jpmr.tsx`, `breathing.tsx`, `grounding.tsx`, `emotion-map.tsx` (Somatic interventions)
  - `components/ui/ProgressBar.tsx`
  - `utils/insights.ts` (`generateInsightMessage` heuristic)
  - `utils/triage.ts` & `utils/date.ts`
  - `i18n/locales/en.json`, `hi.json`, `ta.json`, `te.json` (Localization for insights and metrics)
- **Backend (Convex):**
  - `convex/schema.ts` (All tables: `dailyCheckins`, `emotionLogs`, `emotionMaps`, `wellnessProfiles`, `screeningAttempts`, `screenings`, `triages`, `alerts`, `reframeLogs`, `reframes`, `cbtSessions`, `microGoals`, `jpmrLogs`, `breathingLogs`, `groundingLogs`, `points`, `badges`, `streaks`, `weeklyMissions`, `monthlyChallenges`, `clinicalTimelines`, `aiCompanionLogs`, `companionMessages`, `aiMonitoringLogs`)
  - `convex/insights.ts` (`getDailyStats`, `getCounselorStudentDailyCheckins`)
  - `convex/wellness.ts` (`getProfile`, `updateProfile`)
  - `convex/dashboard.ts` (`getDashboardOverview`, `getEnterpriseAnalytics`, `getPatientCbtAnalytics`, `getAlerts`, `getActivityFeed`, `getUsersWithAiChats`, `getPatientAiChatHistoryAdmin`)
  - `convex/timeline.ts` (`getStudentClinicalTimeline`)
  - `convex/screening.ts` (`submitScreeningAttempt`, `getAll`, `getLatest`, `getAllAttempts`, `getLatestAttempt`)
  - `convex/clinicalScoring.ts` (Authoritative scoring engines for PHQ-9, GAD-7, PQ-16, WSAS, ReQoL-10)
  - `convex/microGoals.ts` (`submitMorningCheckin`, `getTodayCheckin`, `getStreak`, `getGamificationStats`, `getWeeklySummary`, `getWeeklyMission`, `getMonthlyChallenge`, `getTodayGoals`, `getUserGoals`, `getGoalHistory`)
  - `convex/authz.ts` (`assertCanAccessStudent`, `requireCounselorOrAdmin`, `requireAdmin`, `getAuthenticatedUser`)
- **Counselor Web Dashboard:**
  - `dashboard/src/pages/PatientDetail.tsx` (5 Tabs: Clinical Assessments, Clinical Timeline, AI CBT Therapy, Somatic & Sensory Interventions, Gamification & Reframes)
  - `dashboard/src/pages/Analytics.tsx` (Enterprise Institutional Metrics)
  - `dashboard/src/pages/Overview.tsx`, `ScreeningCentre.tsx`, `AlertsCenter.tsx`, `AiMonitoring.tsx`
  - `dashboard/src/components/ClinicalTimelineView.tsx`

---

## 3. Current Progress Architecture

Emotify's progress and insights architecture operates across two distinct interfaces with varying degrees of maturity:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        STUDENT MOBILE APP (Expo)                       │
├────────────────────────────┬───────────────────────────────────────────┤
│ InsightsScreen             │ ProfileScreen                             │
│ (app/.../insights.tsx)     │ (app/.../profile.tsx)                     │
│  - Total Calm Points       │  - Personal Style (Trait summary)         │
│  - Goals Met Count         │  - Mood Pattern (Descriptive text)        │
│  - 7-Day Mood Trend Chart  │  - Energy Pattern (Morning/Evening)       │
│  - Total Check-ins         │  - Wellness Goals list                    │
│  - Reframes Count          │  - CSV Export (Screenings)                │
│  - Relaxation Minutes      │                                           │
└─────────────▲──────────────┴─────────────────────▲─────────────────────┘
              │                                    │
              │ query: getDailyStats               │ query: getProfile
              │                                    │ mutation: updateProfile
┌─────────────┴────────────────────────────────────┴─────────────────────┐
│                           CONVEX BACKEND                               │
├────────────────────────────────────────────────────────────────────────┤
│  Authoritative Behavioral Logs   │  Authoritative Clinical Records     │
│   - dailyCheckins                │   - screeningAttempts               │
│   - emotionLogs                  │   - triages                         │
│   - emotionMaps                  │   - alerts                          │
│   - jpmrLogs                     │                                     │
│   - breathingLogs (P9 Step 4B)   │  Legacy Tables (Fallback Only)      │
│   - groundingLogs (P9 Step 5B)   │   - screenings                      │
│   - reframeLogs (P8 Step 4)      │   - reframes                        │
│   - microGoals / streaks         │   - companionMessages               │
└─────────────▲────────────────────────────────────▲─────────────────────┘
              │                                    │
              │ queries: getPatientCbtAnalytics,   │ queries: getAll,
              │          getCounselorDailyCheckins │          getStudentTimeline,
              │                                    │          getEnterpriseAnalytics
┌─────────────┴────────────────────────────────────┴─────────────────────┐
│                      COUNSELOR WEB DASHBOARD (React)                   │
├────────────────────────────────────────────────────────────────────────┤
│ PatientDetail.tsx:                                                     │
│  - Tab 1: Clinical Score Trends & Table, Daily Check-in Telemetry Grid │
│  - Tab 2: Canonical Clinical Timeline (Multi-source audit trail)       │
│  - Tab 3: CBT Sessions, Emotion Before/After, Thinking Styles Frequency│
│  - Tab 4: Somatic: JPMR, Breathing, Grounding, Emotion Maps            │
│  - Tab 5: Gamification: Streaks, Badges, Level, XP, Reframe Logs       │
│ Analytics.tsx: Institutional Risk Distribution, Avg Scores, Interventions│
└────────────────────────────────────────────────────────────────────────┘
```

### Architectural Realities:
1. **Student Insights is a Minimal Behavioral Dashboard:** Student `insights.tsx` is powered almost entirely by a single endpoint: `api.insights.getDailyStats`. It presents 4 high-level metric cards, 1 line chart, and 1 banner note. It completely ignores `breathingLogs` and `groundingLogs`, which were implemented in Priority 9.
2. **Counselor Dashboard is Substantially More Comprehensive:** Counselors have access to deep longitudinal views via `PatientDetail.tsx` (5 dedicated clinical/behavioral tabs), consuming `api.screening.getAll`, `api.dashboard.getPatientCbtAnalytics`, `api.insights.getCounselorStudentDailyCheckins`, and `api.timeline.getStudentClinicalTimeline`.
3. **Data Bridging & Fallbacks:** Modern writes go to authoritative tables (`screeningAttempts`, `reframeLogs`, `breathingLogs`, `groundingLogs`). Query handlers maintain read fallbacks to legacy tables (`screenings`, `reframes`) to preserve historical continuity.

---

## 4. Data Sources

| Metric / Data Item | Source Table | Source Function | Raw / Derived | Time Window | Student Facing | Counselor Facing | Clinical / Behavioral | Status |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| **Total Check-ins** | `dailyCheckins` | `insights.getDailyStats`, `insights.getCounselorStudentDailyCheckins` | Derived (Deduplicated count by `dateStr`) | Lifetime | Yes | Yes | Behavioral | Authoritative |
| **7-Day Mood Trend** | `dailyCheckins` (fallback: `emotionLogs`) | `insights.getDailyStats` | Derived (`moodToIntensity` 1-10 mapping) | Last 7 distinct check-in entries | Yes | No | Behavioral | Flawed (categorical mapped to continuous line) |
| **Daily Check-in Grid** | `dailyCheckins` | `insights.getCounselorStudentDailyCheckins` | Raw records (`dateStr`, `mood`, `createdAt`) | Configurable (default 14 days, max 90) | No | Yes | Behavioral | Authoritative & Non-diagnostic |
| **Calm Points** | `microGoals` | `insights.getDailyStats` | Derived (Sum of `points` across goals) | Lifetime | Yes | No | Behavioral / Gamification | Buggy (sums all goals including uncompleted/skipped) |
| **Goals Met Count** | `microGoals` | `insights.getDailyStats`, `dashboard.getPatientCbtAnalytics` | Derived (`count(completed === true)`) | Lifetime | Yes | Yes | Behavioral | Authoritative |
| **14-Day Goal Activity** | `microGoals` | `dashboard.getPatientCbtAnalytics` | Derived (Daily completed vs total) | Last 14 days | No | Yes | Behavioral | Vulnerable to server UTC date splitting |
| **Weekly Goal Summary** | `microGoals` | `microGoals.getWeeklySummary` | Derived (Count, completion rate, points) | Last 7 days (`Date.now() - 7d`) | Yes | No | Behavioral | Authoritative (Rolling 7d window) |
| **Current / Longest Streak** | `streaks` | `microGoals.getStreak`, `dashboard.getPatientCbtAnalytics` | Directly recorded + dynamic resolution | Continuous | Yes | Yes | Behavioral / Gamification | Authoritative (Uses local `dateStr`) |
| **Level / XP / Coins** | `users` | `microGoals.getGamificationStats`, `dashboard.getPatientCbtAnalytics` | Directly recorded + derived level | Lifetime | Yes | Yes | Gamification | Authoritative |
| **JPMR Minutes** | `jpmrLogs` | `insights.getDailyStats` | Derived (Sum of `durationSeconds / 60`) | Lifetime | Yes | No | Behavioral | Authoritative |
| **JPMR Session Table** | `jpmrLogs` | `dashboard.getPatientCbtAnalytics` | Raw records (`preIntensity`, `postIntensity`, `delta`, `duration`) | Lifetime | No | Yes | Behavioral | Authoritative |
| **Breathing Sessions Table**| `breathingLogs` | `dashboard.getPatientCbtAnalytics`, `timeline.getStudentClinicalTimeline` | Raw records (`protocolName`, `cyclesCompleted`, `status`, `duration`) | Last 50 sessions | No | Yes | Behavioral | Missing from Student Insights |
| **Sensory Grounding Table** | `groundingLogs` | `dashboard.getPatientCbtAnalytics`, `timeline.getStudentClinicalTimeline` | Raw records (`protocolName`, `stepsCompleted`, `status`, `duration`) | Last 50 sessions | No | Yes | Behavioral | Missing from Student Insights |
| **Reframes Count** | `reframeLogs` (fallback: `reframes`) | `insights.getDailyStats` | Derived (`reframeLogs.length`) | Lifetime | Yes | No | Behavioral | Authoritative |
| **Guided Reframes Log** | `reframeLogs` | `dashboard.getPatientCbtAnalytics` | Raw records (`situation_text`, `thought_original`, `reframe_text`, etc.) | Lifetime | No | Yes | Behavioral | Authoritative |
| **Avg Reframe / JPMR Drop** | `reframeLogs`, `jpmrLogs` | `insights.getDailyStats` | Derived (`avg(pre - post)`) | Lifetime | Internal | No | Behavioral | Calculated on backend, not rendered in student UI |
| **Wellness Identity Profile** | `wellnessProfiles` | `wellness.getProfile`, `wellness.updateProfile` | Derived (Rule-based heuristics over last 10 logs) | Last 10 records | Yes | No | Behavioral | Authoritative |
| **Emotion Body Maps** | `emotionMaps` | `dashboard.getPatientCbtAnalytics` | Raw records (`emotionLabel`, `selectedRegions`, `bodyRatings`) | Lifetime | No | Yes | Behavioral | Authoritative |
| **CBT Tension Delta** | `cbtSessions` | `dashboard.getPatientCbtAnalytics` | Derived (`avg(emotionBefore - emotionAfter)`) | Completed sessions | No | Yes | Behavioral / Acute session | Misleadingly presented as "Recovery" |
| **CBT Belief Score** | `cbtSessions` | `dashboard.getPatientCbtAnalytics` | Derived (`avg(beliefScore)`) | Completed sessions | No | Yes | Behavioral | Authoritative |
| **Thinking Styles Trends** | `cbtSessions` | `dashboard.getPatientCbtAnalytics` | Derived (Categorical frequency histogram) | Completed sessions | No | Yes | Behavioral | Authoritative |
| **Clinical Assessment Scores**| `screeningAttempts` (fallback: `screenings`) | `screening.getAll`, `screening.getLatest`, `timeline.getStudentClinicalTimeline` | Directly recorded (Validated scores for PHQ-9, GAD-7, PQ-16) | Longitudinal attempts | Summary / Export | Yes | Standardized Clinical Assessment | Authoritative & Immutable |
| **Clinical Triage Level** | `triages`, `screeningAttempts` | `triage.getLatestByUserId`, `dashboard.getDashboardOverview` | Directly recorded (Classified triage tier & flags) | Latest attempt | No | Yes | Standardized Clinical Triage | Authoritative |
| **Institutional Avg PHQ/GAD** | `screeningAttempts` | `dashboard.getEnterpriseAnalytics` | Derived (`sum(scores) / count`) | All completed attempts | No | Yes | Institutional Assessment Summary | Critical: Mislabeled as "Improvement" |
| **Active Institutional DAU/WAU**| N/A | `dashboard.getEnterpriseAnalytics` | Synthetic formula (`0.45 * patients`, `0.75 * patients`) | N/A | No | Yes | Synthetic Vanity Metric | Fabrication (Not real telemetry) |

---

## 5. Student Insights

### Screen & Component Analysis (`app/(auth)/(tabs)/insights.tsx`):
- **Components:** `ScrollView`, `LinearGradient`, `LineChart` (`react-native-chart-kit`), `ActivityIndicator`, `StatCard`, `Ionicons`.
- **Backend Queries:** `api.insights.getDailyStats` (passes `{ userId: user?.id ?? "" }`).
- **Displayed Metrics:**
  1. Highlight Summary Card:
     - `stats.totalCalmPoints` ("CALM POINTS")
     - `stats.completedGoalsCount` ("GOALS MET")
  2. Weekly Progress Banner:
     - Text note: "You've logged mood checks consistently. Keep taking small steps." (if check-ins exist) or subtitle.
  3. Mood Trend Chart:
     - Line chart showing recent mood entries mapped to numerical values (1-10) with weekday labels ("Mon", "Tue", etc.).
  4. Activity Stats Grid:
     - `stats.totalCheckins` ("CHECK-INS")
     - `stats.reframesCount` ("REFRAMES")
     - `stats.jpmrMinutes` ("RELAXATION", formatted as `${minutes}m`)
- **Time Ranges:**
  - Summary metrics: Lifetime aggregates.
  - Mood Trend: 7 most recent distinct daily check-ins (arbitrary record slice, NOT a 7-day calendar window).
- **Empty States:**
  - If no check-ins exist, displays calendar icon with title and subtitle; summary cards display "0".
- **Loading / Error States:**
  - Shows centered `ActivityIndicator` while `stats === undefined`. No error boundary or retry mechanism if query rejects.
- **Filtering:** None available to students.
- **Date Handling:**
  - Extracts weekday via `new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: "short" })` from `entry.dateStr`.
- **Localization:** All headers, labels, and notes consume `t("insights.*")` via `useLanguage()`.
- **Accessibility:** Text scaling and screen reader accessibility are standard React Native views; chart kit canvas lacks semantic accessibility tree labels for screen readers.

### Granular Evaluation of Displayed Student Metrics:

#### 1. Calm Points (`stats.totalCalmPoints`)
- **What it represents:** Gamification points earned by completing micro-goals.
- **Where it comes from:** `goals.reduce((acc, g) => acc + (g.points || 0), 0)` in `convex/insights.ts`.
- **Bounded:** Yes (sum of non-negative integers).
- **Deterministic:** Yes.
- **Can it be misleading?** **YES.** In `convex/insights.ts` line 131, it sums `g.points` for **all** goals in the `microGoals` table for that user without checking `if (g.completed)`. A student who was assigned 4 goals worth 25 points each and never completed any of them is awarded 100 Calm Points on the Insights screen!
- **Implies clinical conclusion?** No (gamification).
- **Mixes behavioral with clinical?** No.

#### 2. Goals Met (`stats.completedGoalsCount`)
- **What it represents:** Total number of micro-goals marked completed.
- **Where it comes from:** `goals.filter(g => g.completed).length` in `convex/insights.ts`.
- **Bounded:** Yes.
- **Deterministic:** Yes.
- **Can it be misleading?** No; accurate lifetime completion counter.
- **Implies clinical conclusion?** No.

#### 3. Mood Trend Chart (`stats.recentDailyMood`)
- **What it represents:** Self-reported categorical mood mapped to a numerical 1-10 intensity score.
- **Where it comes from:** Authoritative `dailyCheckins.mood` mapped via `moodToIntensity`: "good"/"happy" = 8, "calm" = 6, "low"/"sad" = 4, "heavy"/"worried" = 3, default = 5.
- **Bounded:** Yes (1 to 10).
- **Deterministic:** Yes.
- **Can it be misleading?** **YES, significantly.**
  1. It maps categorical qualitative emotions into an artificial continuous integer scale (3, 4, 6, 8) and plots them with Bézier curved line interpolation. This falsely implies to the student that their emotional state was mathematically measured at "intensity 6.2" or "8.0".
  2. It takes the last 7 distinct entries, regardless of calendar distance. If a user checks in once a month for 7 months, the chart draws a 7-point line chart labeled with weekdays ("Mon", "Fri", "Wed") as if it were a single week of continuous tracking. Missing days are not represented as gaps.
- **Implies clinical conclusion?** It risks implying clinical fluctuation or affective instability where none was clinically diagnosed.
- **Mixes behavioral with clinical?** No, but it presents non-clinical check-in choices as pseudo-clinical intensity metrics.

#### 4. Relaxation (`stats.jpmrMinutes`)
- **What it represents:** Total lifetime minutes spent in Jacobson's Progressive Muscle Relaxation (JPMR).
- **Where it comes from:** `jpmrLogs.reduce((acc, log) => acc + Math.round((log.durationSeconds ?? (log.duration ?? 0)) / 60), 0)`.
- **Can it be misleading?** **YES.** It is labeled generally as "RELAXATION", but it tracks **only JPMR**. A student who logs 50 breathing sessions and 20 sensory grounding sessions will see "0m RELAXATION" if they have not used JPMR. It omits modern Priority 9 interventions.

---

## 6. Counselor Progress Review

### Implementation in Counselor Dashboard (`dashboard/src/pages/PatientDetail.tsx`):
Counselors review student progress across five tabs:

1. **Tab 1: Clinical Assessments (`activeTab === "screenings"`):**
   - Displays patient administrative profile (role, mobile, enrollment date).
   - "Clinical Score Trends": Recharts `AreaChart` plotting longitudinal PHQ-9 (0-27) and GAD-7 (0-21) scores over time from `api.screening.getAll`.
   - "Historical Screening Tests": Table listing every completed assessment date, PHQ-9 score, GAD-7 score, PQ-16 score, and Item 9 suicide endorsement.
   - "Daily Wellness Check-ins": Dedicated grid showing student-reported non-diagnostic daily moods over a configurable lookback window (default 14 days) via `api.insights.getCounselorStudentDailyCheckins`.
2. **Tab 2: Clinical Timeline (`activeTab === "timeline"`):**
   - Embeds `ClinicalTimelineView` querying `api.timeline.getStudentClinicalTimeline`.
   - Chronological unified audit trail aggregating 18 distinct source tables with explicit provenance links (`attemptId`, `triageId`, `alertId`, `sessionId`).
3. **Tab 3: AI CBT Therapy Analytics (`activeTab === "cbt"`):**
   - Summary cards: Total CBT Sessions, Avg Tension Reduction (`emotionBefore - emotionAfter`), Reframe Belief Score (%), Goal Activation Rate (%).
   - "CBT Emotion Improvement Trend": Recharts `AreaChart` of session `emotionBefore` vs `emotionAfter`.
   - "Thinking Styles Frequency": Recharts `BarChart` of cognitive distortions identified during CBT.
   - "14-Day Goal Completion Activity": Daily bar chart of scheduled vs completed micro-goals.
   - "Top Completed Goal Categories" & "Frequently Skipped Goals".
   - CBT Sessions History table with slide-out session inspection modal.
4. **Tab 4: Somatic & Sensory Interventions (`activeTab === "somatic"`):**
   - JPMR Sessions Table (pre/post intensity, duration, delta).
   - Emotion Body Maps list (body regions, intensity, suggested actions).
   - Breathing Sessions Table (protocol, duration, cycles completed, status, source).
   - Sensory Grounding Sessions Table (protocol, duration, steps completed, status, source).
5. **Tab 5: Gamification & Reframes (`activeTab === "gamification"`):**
   - Summary cards: Level & XP, Current Streak (Days), Earned Badges.
   - Guided Cognitive Reframes Log Table (`reframeLogs` records).

### Counselor Scope & Authorization:
- Gated by `requireCounselorOrAdmin` or `assertCanAccessStudent`.
- Counselors can inspect any student enrolled in the hospital/university portal.
- Cross-student leakage is prevented by strict indexed queries filtering by student ID (`studentId` or canonical `users._id`).

### Duplication & Scope Issues in Counselor View:
- **Redundant Representations:**
  - Micro-goals appear in Tab 3 (CBT behavioral activation), Tab 5 (Gamification stats), and in the Clinical Timeline (Tab 2).
  - Somatic interventions (JPMR, Breathing, Grounding) appear both in Tab 4 and in the Clinical Timeline (Tab 2).
- **Raw AI Chat Separation:**
  - In `dashboard/src/pages/AiMonitoring.tsx`, counselors can inspect `aiMonitoringLogs` (risk scores, prompts, responses, flagged keywords).
  - In `dashboard/src/pages/PatientDetail.tsx`, ordinary conversational dialogue from Mitra is **strictly excluded** from the Clinical Timeline.
  - However, in `dashboard/src/pages/Analytics.tsx` and `convex/dashboard.ts` (`getUsersWithAiChats`, `getPatientAiChatHistoryAdmin`), counselors can read raw student Mitra transcripts across `aiCompanionLogs` and `companionMessages`. This remains an unaddressed P0 privacy finding documented in Priority 10 Step 1 (`P0-MITRA-02`).

---

## 7. Clinical vs Behavioral Separation

### Classification Boundary:

#### Category A: Standardized Clinical Assessment Data
- **PHQ-9 (Patient Health Questionnaire - 9 items):** Standard psychometric instrument for depression symptom severity (0–27).
- **GAD-7 (Generalized Anxiety Disorder - 7 items):** Standard psychometric instrument for anxiety symptom severity (0–21).
- **PQ-16 (Prodromal Questionnaire Brief - 16 items):** Standard screener for psychosis prodromal risk (0–16, cutoff $\ge 6$).
- **WSAS (Work and Social Adjustment Scale - 5 items):** Functional impairment measure (0–40). **STATUS: STRUCTURAL ONLY, INACTIVE.**
- **ReQoL-10 (Recovering Quality of Life - 10 items):** Quality of life measure (0–40). **STATUS: STRUCTURAL ONLY, INACTIVE.**

#### Category B: Behavioral, Wellness & Intervention Telemetry
- Daily morning check-ins (`dailyCheckins`)
- Situational emotion ratings (`emotionLogs`)
- Somatosensory emotion localization (`emotionMaps`)
- Daily routine micro-goals (`microGoals`)
- Gamification streaks, badges, points, XP (`streaks`, `badges`, `users.xp`)
- Cognitive reframing exercises (`reframeLogs`)
- CBT dialogue & distortion tracking (`cbtSessions`)
- Somatic relaxation sessions (`jpmrLogs`, `breathingLogs`, `groundingLogs`)
- AI conversational companions (`aiCompanionLogs`)

### Boundary Audit Findings:
1. **Separation is Correct in Core Backend Engines:**
   - In `convex/wellness.ts` (lines 40–42), standardized clinical screening data (`screeningAttempts`, `triages`, `alerts`) is strictly excluded from wellness profile derivation.
   - In `convex/microGoals.ts` (lines 198–200), daily habit recommendations do not read clinical screening scores or triage levels.
   - In `convex/scoring.ts` (lines 287, 354), WSAS and ReQoL-10 are explicitly configured as `pending_approved_content` and are not administered in `app/(auth)/screening.tsx`.
2. **Boundary Contamination in Client Responses & Analytics:**
   - `convex/insights.ts` (`getDailyStats`): Bundles clinical `screenings` and `triages` together with behavioral `dailyCheckins`, `microGoals`, and `jpmrLogs` in the same payload for the student app.
   - `dashboard/src/pages/PatientDetail.tsx` (Tab 1): Tags the standardized clinical assessment chart as "TELEMETRY", conflating formal clinical psychometrics with background behavioral sensor/app logs.
   - `dashboard/src/pages/Analytics.tsx`: Conflates institutional average scores with "Longitudinal depression reduction / improvement".

---

## 8. Longitudinal Data Integrity

1. **Multiple Screening Attempts Coexistence:**
   - Verified by test `LONG-01` in `convex/longitudinal.test.ts`.
   - Repeated screening attempts are stored non-destructively as separate documents in `screeningAttempts`, sorted chronologically. Historical attempts remain immutable.
2. **Completed vs. Abandoned Attempts:**
   - Screenings queries (`getLatest`, `getAll`, `getDailyStats`) filter strictly for `status === "completed"`.
   - `getLatestRawAttempt` in `convex/screening.ts` allows administrative inspection of `in_progress` or `abandoned` attempts without polluting longitudinal trend charts.
3. **Daily Check-ins Multiplicity & Date Collisions:**
   - In `convex/insights.ts` (`getDailyStats` and `getCounselorStudentDailyCheckins`), daily check-ins are deduplicated by `dateStr` (newest record kept per calendar date).
   - In `convex/microGoals.ts` (`submitMorningCheckin`), multiple check-ins for the same `dateStr` are blocked with an explicit error: `"Already checked in today"`.
4. **Deleted Records & Trash:**
   - The system supports administrative soft-deletion in `convex/schema.ts` (`trash` table). Deleted users have their records preserved as JSON strings.
   - Progress queries do not check soft-deleted items, which correctly prevents orphaned records from skewing live dashboards.
5. **Critical Scalability Risk — Unbounded `.collect()` Queries:**
   The entire Progress & Insights architecture is vulnerable to unbounded memory allocation:
   - `convex/insights.ts`: Queries `dailyCheckins.collect()`, `microGoals.collect()`, `jpmrLogs.collect()`, `reframeLogs.collect()`, `screeningAttempts.collect()`, `triages.collect()`.
   - `convex/dashboard.ts`: Unconditionally collects the entire `users`, `triages`, `alerts`, `cbtSessions`, and `screeningAttempts` tables in memory to calculate analytics.
   - `convex/timeline.ts`: Unconditionally collects across 18 tables in parallel.
   As student cohorts log daily check-ins and micro-goals over 6–12 months, these functions will exceed Convex execution memory and timeout limits.

---

## 9. Timezone Audit

Emotify previously established a standard in Priority 7 Phase 5 Step 3C requiring client-provided local date strings (`YYYY-MM-DD` via `getLocalDateString()`). The audit verified adherence across Progress & Insights:

### 1. Correct Local Date Usage:
- `app/(auth)/(tabs)/index.tsx`: Passes `dateStr: getLocalDateString()` to `api.microGoals.getTodayCheckin` and `api.microGoals.getStreak`.
- `convex/microGoals.ts` (`submitMorningCheckin`): Validates and stores client-provided `dateStr` (`YYYY-MM-DD`).
- `dashboard/src/pages/PatientDetail.tsx`: Parses `dateStr` by splitting `[y, m, d]` and constructing a local Date:
  ```ts
  const [y, m, d] = (c.dateStr || "").split("-").map(Number);
  const formattedDate = new Date(y, m - 1, d).toLocaleDateString(...);
  ```
  This avoids UTC off-by-one shifts on the client.

### 2. Concrete Timezone Violations Found in Code:
- **Violation 1: Server-Side UTC Date Construction in `convex/microGoals.ts` (`getTodayGoals`):**
  ```ts
  // convex/microGoals.ts lines 294-296
  const [y, m, d] = args.dateStr.split("-").map(Number);
  startOfDay = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  endOfDay = startOfDay + 24 * 60 * 60 * 1000;
  ```
  *Flaw:* Convex server runs in UTC. `new Date(y, m-1, d, 0, 0, 0, 0)` produces midnight **UTC**. For an Indian student in IST (UTC+5:30), local midnight is 18:30 UTC of the previous day. Goals created between 00:00 and 05:30 IST will have `createdAt < startOfDay` in UTC, disappearing from the student's "Today's Goals" list!
- **Violation 2: UTC Date Fallback via `toISOString().split("T")[0]`:**
  Found in `convex/microGoals.ts` (lines 147, 205, 339, 483, 567, 755, 969) and `convex/cbt.ts` (line 312):
  ```ts
  const todayStr = args.dateStr || new Date().toISOString().split("T")[0];
  ```
  *Flaw:* If `args.dateStr` is omitted, the backend falls back to UTC date splitting. Around midnight local time (e.g. 02:00 AM IST), `toISOString().split("T")[0]` returns yesterday's UTC date, breaking streaks or attributing check-ins to the wrong calendar day.
- **Violation 3: Server-Side UTC Day-Bucketing in `convex/dashboard.ts` (`behaviouralActivationTrends` & `trendData`):**
  ```ts
  // convex/dashboard.ts lines 439-444
  const d = new Date();
  d.setDate(d.getDate() - i);
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  ```
  *Flaw:* Uses the server's current date and UTC midnight to bucket goals and triages over the last 14 days, misaligning timestamps logged by students in non-UTC timezones.

---

## 10. Security & Authorization Audit

Every Progress & Insights backend query was evaluated for authentication, identity scoping, authorization enforcement, and cross-student isolation:

| Query / Mutation | Gating Function | Caller Allowed | Self-Only Scoped | Severity Finding |
| :--- | :--- | :--- | :---: | :---: |
| `insights.getDailyStats` | `assertCanAccessStudent(ctx, targetUserId)` | Student (self), Counselor, Admin | Yes | **PASS (Clean)** |
| `insights.getCounselorStudentDailyCheckins` | `requireCounselorOrAdmin(ctx)`, `assertCanAccessStudent` | Counselor, Admin | N/A (Staff) | **PASS (Clean)** |
| `wellness.getProfile` | `assertCanAccessStudent(ctx, targetUserId)` | Student (self), Counselor, Admin | Yes | **PASS (Clean)** |
| `wellness.updateProfile` | `assertCanAccessStudent(ctx, args.userId)` | Student (self), Counselor, Admin | Yes | **PASS (Clean)** |
| `dashboard.getPatientCbtAnalytics` | `assertCanAccessStudent(ctx, args.userId)` | Student (self), Counselor, Admin | Yes | **PASS (Clean)** |
| `timeline.getStudentClinicalTimeline` | `assertCanAccessStudent(ctx, args.userId)` | Student (self), Counselor, Admin | Yes | **PASS (Clean)** |
| `dashboard.getDashboardOverview` | `getAuthenticatedUser` (role: counselor/admin) | Counselor, Admin | N/A (Staff) | **PASS (Clean)** |
| `dashboard.getEnterpriseAnalytics` | `getAuthenticatedUser` (role: counselor/admin) | Counselor, Admin | N/A (Staff) | **PASS (Clean)** |
| `microGoals.getTodayCheckin` | Context `identity.subject` | Authenticated Student | Yes | **PASS (Clean)** |
| `microGoals.getStreak` | `assertCanAccessStudent(ctx, targetUserId)` | Student (self), Counselor, Admin | Yes | **PASS (Clean)** |
| `microGoals.getWeeklySummary` | Context `identity.subject` (ignores `args.userId`) | Authenticated Student | Yes | **P3 (Minor Bug)** |
| `dashboard.getUsersWithAiChats` | `getAuthenticatedUser` (role: counselor/admin) | Counselor, Admin | No | **P0 (Privacy)** |
| `dashboard.getPatientAiChatHistoryAdmin` | `getAuthenticatedUser` (role: counselor/admin) | Counselor, Admin | No | **P0 (Privacy)** |

### Severity Classifications:
- **P0:** Counselor dashboard endpoints (`getUsersWithAiChats`, `getPatientAiChatHistoryAdmin`) allow staff to view raw conversational dialogue between students and Mitra without consent or clinical escalation triggers. *(Pre-existing finding from Priority 10 Step 1, P0-MITRA-02)*.
- **P1:** None. Core student-facing clinical and insights queries properly enforce `assertCanAccessStudent` and block cross-student inspection.
- **P2:** Unbounded `.collect()` queries across `insights.ts`, `dashboard.ts`, and `timeline.ts` represent a denial-of-service / memory exhaustion risk under production load.
- **P3:** `microGoals.getWeeklySummary` accepts `args.userId` in schema but ignores it in code, always defaulting to `identity.subject`.

---

## 11. Privacy Audit

1. **Mitra Conversational Telemetry Separation:**
   - Ordinary Mitra chat messages in `aiCompanionLogs` and `companionMessages` are **strictly excluded** from the student Insights screen (`insights.tsx`) and the student Clinical Timeline (`timeline.ts`).
   - Verified by test `LONG-08` in `convex/longitudinal.test.ts`.
2. **Clinical Screening Questions & Responses:**
   - Raw question-by-question responses (`screeningAttempts.responses`) are preserved for clinical review in the backend but are **never displayed** in the student Insights tab.
   - The student Insights screen only receives aggregate counts and scores.
3. **Unnecessary Clinical Data Delivery to Student Insights Screen:**
   - In `convex/insights.ts`, `getDailyStats` returns full `screenings` and `triages` arrays to the student mobile app on every visit to the Insights tab, even though `insights.tsx` renders none of this data. This exposes unnecessary clinical risk flags over the wire.
4. **Zero Environmental Surveillance in Grounding:**
   - In `convex/grounding.ts` and `app/(auth)/tools/grounding.tsx`, sensory grounding sessions record only step counters (0–5) and durations. Zero free-text input or environmental descriptions are transmitted or stored.

---

## 12. Metric Trustworthiness

Every metric currently computed or surfaced across Progress & Insights is classified according to its epistemological foundation:

| Metric | Classification | Rationale |
| :--- | :--- | :--- |
| `screeningAttempts.results.phq9.score` | **C. CLINICAL ASSESSMENT RESULT** | Server-scored psychometric total from validated 9-item clinical scale. |
| `screeningAttempts.results.gad7.score` | **C. CLINICAL ASSESSMENT RESULT** | Server-scored psychometric total from validated 7-item clinical scale. |
| `screeningAttempts.results.pq16.score` | **C. CLINICAL ASSESSMENT RESULT** | Server-scored psychometric total from validated 16-item prodromal scale. |
| `triages.level` | **C. CLINICAL ASSESSMENT RESULT** | Deterministic clinical risk classification based on psychometric cutoffs. |
| `dailyCheckins.mood` | **A. DIRECTLY RECORDED** | Exact qualitative mood option chosen by student during check-in. |
| `totalCheckins` | **B. DETERMINISTICALLY DERIVED** | Distinct count of daily check-ins deduplicated by local `dateStr`. |
| `streaks.currentStreak` | **B. DETERMINISTICALLY DERIVED** | Calculated consecutive calendar days using local calendar comparisons. |
| `jpmrLogs.durationSeconds` | **A. DIRECTLY RECORDED** | Active timer duration logged during JPMR intervention. |
| `breathingLogs.cyclesCompleted` | **A. DIRECTLY RECORDED** | Exact count of pacing cycles finished in breathing player. |
| `groundingLogs.stepsCompleted` | **A. DIRECTLY RECORDED** | Exact count of grounding steps completed (1 to 5). |
| `cbtSessions.emotionBefore / After` | **D. BEHAVIORAL/WELLNESS SIGNAL** | Self-reported situational distress rating before/after an in-app thought exercise. |
| `cbtAnalytics.emotionImprovement` | **D. BEHAVIORAL/WELLNESS SIGNAL** | Average situational tension drop during CBT sessions; NOT a clinical cure. |
| `insights.totalCalmPoints` | **E. PRESENTATION-ONLY SUMMARY** | Arbitrary sum of micro-goal point values; currently calculates unearned points. |
| `insights.recentDailyMood (intensity)`| **E. PRESENTATION-ONLY SUMMARY** | Artificial 1–10 mapping of discrete categorical moods, interpolated on Bézier chart. |
| `wellnessProfiles.personality_traits` | **E. PRESENTATION-ONLY SUMMARY** | Rule-based heuristic assignment based on counts of recent logs. |
| `dashboard.avgPhqScore ("Improvement")`| **G. UNKNOWN / INSUFFICIENTLY DEFINED** | Mislabeled arithmetic average of raw scores; completely fails to measure improvement. |
| `dashboard.dau / wau` | **G. UNKNOWN / INSUFFICIENTLY DEFINED** | Hardcoded multiplier calculations (vanity metrics) with zero empirical basis. |
| `screenings` (table) | **F. LEGACY/DEPRECATED** | Legacy flat screening table superseded by `screeningAttempts`. |
| `reframes` (table) | **F. LEGACY/DEPRECATED** | Legacy reframe table superseded by `reframeLogs`. |
| `companionMessages` (table) | **F. LEGACY/DEPRECATED** | Legacy chat table superseded by `aiCompanionLogs`. |

---

## 13. Legacy & Duplicate Sources

### 1. `screeningAttempts` vs. `screenings`
- **Authoritative:** `screeningAttempts` (contains instrument versions, attempt types, item responses, triage links, provenance).
- **Legacy:** `screenings` (flat summary table).
- **Status:** Dual-writes have been discontinued. Readers check `screeningAttempts` first, falling back to `screenings` only if zero attempts exist.

### 2. `reframeLogs` vs. `reframes`
- **Authoritative:** `reframeLogs` (contains `situation_text`, `thought_original`, `thinking_trap_choice`, `guided_answers`, `reframe_text`, `improvement_percentage`, `cbtSessionId`, provenance).
- **Legacy:** `reframes` (flat table).
- **Status:** Dual-writes discontinued. `convex/reframes.ts` directs mutations to `reframeLogs`.

### 3. `aiCompanionLogs` vs. `companionMessages`
- **Authoritative:** `aiCompanionLogs`.
- **Legacy:** `companionMessages`.
- **Status:** Counselor dashboard reconstructs conversations by querying both tables.

### 4. Competing Sources for User "Points"
There are three competing, inconsistent definitions of points:
1. `points` table: Contains `totalPoints: v.number()`. Completely orphaned; no current screens read it.
2. `users.xp`: User experience points updated during gamified completions. Displayed in student profile and home banner.
3. `microGoals.points` sum: Summed on the fly by `convex/insights.ts` as `totalCalmPoints`.
*Impact:* A student's Calm Points in Insights does not match their XP on the Home/Profile screens.

---

## 14. Performance & Scalability

1. **Unbounded In-Memory Aggregations:**
   - `convex/insights.ts` (`getDailyStats`): Performs 6 parallel `.collect()` queries across the student's entire historical dataset.
   - `convex/dashboard.ts` (`getEnterpriseAnalytics`): Loads entire database tables into memory:
     ```ts
     const users = await ctx.db.query("users").collect();
     const sessions = await ctx.db.query("cbtSessions").collect();
     const rawTriages = await ctx.db.query("triages").collect();
     const rawAttempts = await ctx.db.query("screeningAttempts").collect();
     const emotionLogs = await ctx.db.query("emotionLogs").collect();
     ```
     This design will crash or time out once the system hosts thousands of active students.
2. **Missing Composite Index on `dailyCheckins`:**
   - `dailyCheckins` is indexed by `["userId", "dateStr"]` and `["userId"]`.
   - Querying recent check-ins sorted by creation time requires scanning all check-ins for that user. An index on `["userId", "createdAt"]` would optimize retrieval.
3. **Heavy Redundant Payload in Student Insights:**
   - `getDailyStats` returns full historical arrays of `microGoals`, `jpmrLogs`, `reframes`, `screenings`, and `triages` to `app/(auth)/(tabs)/insights.tsx`, which uses none of them. The mobile client only needs the summary numbers.

---

## 15. Risk Register

| ID | Severity | Finding | Evidence | Clinical & Product Impact | Recommended Next Step |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **RISK-11-01** | **P0** | Raw student AI companion dialogue accessible to counselors without consent or risk flags | `convex/dashboard.ts`: `getUsersWithAiChats`, `getPatientAiChatHistoryAdmin` | Violates student trust, confidentiality, and data privacy; risks student self-censorship | Gate raw chat access behind explicit crisis escalation or user consent (Aligned with P10 contract) |
| **RISK-11-02** | **P1** | Dashboard misrepresents raw cross-sectional score averages as "Longitudinal Improvement" | `dashboard/src/pages/Analytics.tsx` lines 27–36: "Avg PHQ-9 Improvement ... Longitudinal depression reduction" | Misleads clinicians and leadership into believing patients are clinically recovering when metric is merely an average | Update dashboard labels to "Institutional Mean PHQ-9/GAD-7" or implement true longitudinal delta calculations |
| **RISK-11-03** | **P1** | Synthetic vanity metrics presented as empirical clinical analytics | `convex/dashboard.ts` lines 854–855: `dau = patients.length * 0.45`, `wau = 0.75` | Fabricated engagement metrics compromise institutional reporting integrity | Replace hardcoded multipliers with true activity telemetry or remove vanity KPIs |
| **RISK-11-04** | **P1** | Calm Points calculation incorrectly sums points for uncompleted / skipped micro-goals | `convex/insights.ts` line 131: `goals.reduce((acc, g) => acc + (g.points \|\| 0), 0)` | Rewards non-completion; displays inaccurate gamification points to students | Add `.filter(g => g.completed)` before calculating `totalCalmPoints` |
| **RISK-11-05** | **P2** | Student Insights chart maps discrete categorical moods to continuous pseudo-clinical line | `app/(auth)/(tabs)/insights.tsx` line 50 & `convex/insights.ts`: `moodToIntensity` | Misleads students into inferring precise clinical intensity; misrepresents non-consecutive days | Replace pseudo-continuous line chart with a discrete daily mood bar/card history that reflects calendar gaps |
| **RISK-11-06** | **P2** | Modern interventions (Breathing & Grounding) completely omitted from Student Insights | `convex/insights.ts`: `getDailyStats` ignores `breathingLogs` and `groundingLogs` | Students receive zero progress credit or relaxation minutes for using Priority 9 tools | Integrate `breathingLogs` and `groundingLogs` into relaxation duration and activity stats |
| **RISK-11-07** | **P2** | Unbounded `.collect()` database queries across insights, dashboard, and clinical timeline | `convex/dashboard.ts`, `convex/insights.ts`, `convex/timeline.ts` | Backend memory exhaustion, slow queries, and timeouts as production data scales | Introduce pagination, `.take()` bounds, and date-range filtering on all longitudinal queries |
| **RISK-11-08** | **P2** | Server-side UTC midnight creates date-boundary errors for local student goal retrieval | `convex/microGoals.ts` lines 294–296: `new Date(y, m-1, d).getTime()` in UTC | Goals logged in early morning hours (e.g. 00:00–05:30 IST) disappear from "Today's Goals" | Anchor daily goal filtering directly to client-supplied local `dateStr` rather than server UTC timestamp |
| **RISK-11-09** | **P3** | Multiple competing representations of user "points" across schema and endpoints | `points.totalPoints` vs `users.xp` vs `microGoals.points` sum | Inconsistent numbers shown between Insights ("Calm Points") and Home/Profile ("XP") | Unify gamification accounting under `users.xp` and deprecate orphaned `points` table |
| **RISK-11-10** | **P3** | Student Insights query sends unnecessary clinical screenings and triages over the network | `convex/insights.ts` lines 288–305: returns `screenings` and `triages` to `insights.tsx` | Unnecessary transmission of sensitive clinical diagnostic records to a purely behavioral screen | Scope `getDailyStats` return payload strictly to the summary metrics rendered by the mobile client |

---

## 15. What Is Already Correct

The following implementations are architecturally sound, robustly tested, and **MUST NOT** be rewritten during future remediation:

1. **Screening Attempts Non-Destructive Storage:**
   - Multiple screening attempts coexist cleanly in `screeningAttempts`.
   - Historical attempts remain immutable with complete instrument versions and item responses.
   - Tested and verified by Vitest suite `convex/longitudinal.test.ts` (`LONG-01`, `LONG-02`, `LONG-03`).
2. **Clinical Scoring & Validation Engine (`convex/clinicalScoring.ts`):**
   - Authoritative, server-side scoring for PHQ-9, GAD-7, and PQ-16 with strict range validation.
   - Preserves clinical item 9 suicide trigger and PQ-16 cutoff ($\ge 6$).
   - Properly holds WSAS and ReQoL-10 in `pending_approved_content` state without inventing unverified clinical text.
3. **Clinical Domain Separation in Wellness Derivations:**
   - `convex/wellness.ts` strictly excludes clinical screening scores and triage tiers from inferring personality traits or wellness habits.
   - `convex/microGoals.ts` strictly decouples routine habit assignment from psychiatric risk tiers.
4. **Counselor Daily Check-in Telemetry View:**
   - `insights.getCounselorStudentDailyCheckins` provides a clean, bounded, non-diagnostic inspection grid in `PatientDetail.tsx` Tab 1.
   - Explicitly labeled as self-reported wellness telemetry without modifying clinical triage state.
5. **Breathing and Sensory Grounding Persistence (Priority 9):**
   - Dedicated `breathingLogs` and `groundingLogs` tables with row-level validation, rate limiting, and provenance.
   - Zero free-text input and zero environmental surveillance data capture.
   - Fully integrated into Counselor `PatientDetail.tsx` Tab 4 and `ClinicalTimelineView.tsx`.
6. **Cross-Student Authorization Gating:**
   - `assertCanAccessStudent` reliably prevents students from accessing other students' records across all endpoints.
   - Tested and verified by Vitest suite `convex/longitudinal.test.ts` (`LONG-05`).

---

## 16. What Is Missing

Supported by direct repository inspection:

1. **Breathing & Grounding in Student Insights:**
   - `convex/insights.ts` has no reference to `breathingLogs` or `groundingLogs`.
   - `app/(auth)/(tabs)/insights.tsx` only reports `stats.jpmrMinutes` under "RELAXATION".
2. **True Longitudinal Delta Calculations for Counselor Dashboard:**
   - `convex/dashboard.ts` lacks a query to compute true change over time ($\Delta \text{PHQ-9} = \text{Score}_{\text{latest}} - \text{Score}_{\text{baseline}}$).
3. **Calendar-Accurate Student Mood Trend Representation:**
   - Student Insights lacks a continuous 7-day calendar representation that correctly visualizes missing check-in days rather than stitching non-consecutive entries together.
4. **Pagination & Date Bounding:**
   - No cursor-based or limit-bounded pagination exists for `dailyCheckins`, `microGoals`, `jpmrLogs`, or `cbtSessions` in `insights.ts` and `dashboard.ts`.

---

## 17. Recommended Priority 11 Implementation Sequence

*Note: In accordance with audit rules, this sequence is a proposed roadmap and is NOT implemented in this step.*

### Step 2: Metric Trustworthiness & Clinical Labeling Remediation
- Correct `dashboard/src/pages/Analytics.tsx` labels from "Avg PHQ-9 Improvement / Reduction" to "Institutional Mean PHQ-9".
- Replace synthetic DAU/WAU formulas with empirical active-user aggregations or remove the vanity panel.
- Fix `convex/insights.ts` line 131 to filter `goals.filter(g => g.completed)` before calculating `totalCalmPoints`.
- Retitle CBT "Recovery Progress Chart" in `PatientDetail.tsx` Tab 3 to "Acute Session Tension Delta" to prevent implying psychiatric recovery from short thought exercises.

### Step 3: Modern Intervention Telemetry Integration
- Update `convex/insights.ts` (`getDailyStats`) to query `breathingLogs` and `groundingLogs`.
- Aggregate total relaxation minutes across JPMR, breathing, and grounding.
- Update `app/(auth)/(tabs)/insights.tsx` to display combined relaxation activity and protocol counts.

### Step 4: Timezone & Calendar-Accurate Trend Normalization
- Refactor `convex/microGoals.ts` (`getTodayGoals`) to filter using local `dateStr` comparisons rather than server-side UTC midnight timestamps.
- Replace `toISOString().split("T")[0]` fallbacks with mandatory client local date parameters.
- Redesign the student Insights mood trend to represent a true 7-day calendar window with explicit empty states for days without check-ins, avoiding artificial Bézier curve smoothing over categorical data.

### Step 5: Payload Minimization & Scalability Bounding
- Scope `getDailyStats` response to exclude unrendered `screenings` and `triages` arrays.
- Introduce indexed date-bounding and `.take(50)` limits on all longitudinal queries in `dashboard.ts`, `insights.ts`, and `timeline.ts`.
- Add index on `dailyCheckins` by `["userId", "createdAt"]`.

---

## 18. Scope Protection

I explicitly confirm that throughout this audit:
- **NO application code was modified.**
- **NO database schema was modified.**
- **NO Convex backend functions were modified.**
- **NO React Native screens or web dashboard pages were redesigned or changed.**
- **NO clinical scoring logic or triage thresholds were altered.**
- **NO questionnaire content was modified.**
- **WSAS and ReQoL-10 remain strictly INACTIVE (structural pending approved content only).**
- **NO Mitra AI prompts or Priority 10 behaviors were touched.**
- **NO work on Priority 11 Step 2 or later was initiated.**

---

## 19. Validation

Because this is a read-only audit, all validation steps were purely observational and non-destructive:

- **Vitest Regression Suite:**
  - Command: `npx vitest run`
  - Result: **18 test files passed (18/18)**
  - Total Tests: **356 passed (356/356)**
  - Duration: 7.14s
- **TypeScript Static Verification:**
  - Command: `npx tsc --noEmit`
  - Result: **Clean (0 errors, exit code 0)**
- **Dashboard Production Build:**
  - Command: `npm run build` (in `dashboard/`)
  - Toolchain: Vite v8.0.13 + tsc -b
  - Result: **Clean build in 744ms (0 errors, exit code 0)**
  - Output Bundle: `dist/index.html` (0.66 kB), `dist/assets/index-DtVgz1y3.css` (12.37 kB), `dist/assets/index-C7xZmjT7.js` (902.53 kB)
- **Repository State:**
  - Clean working directory. Zero modified files.
