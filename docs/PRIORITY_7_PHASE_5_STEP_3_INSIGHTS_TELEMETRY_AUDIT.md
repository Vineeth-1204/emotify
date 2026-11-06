# Priority 7 Phase 5 — Step 3: Insights / Telemetry Normalization Audit Report

**Date:** September 28, 2026  
**Status:** Audit Completed — Strict Read-Only Analysis (Zero Code/Schema/Logic Changes)  
**Deliverables:**
- `PRIORITY_7_PHASE_5_STEP_3_INSIGHTS_TELEMETRY_AUDIT.md` (Workspace root)
- `reports/PRIORITY_7_PHASE_5_STEP_3_INSIGHTS_TELEMETRY_AUDIT.md` (Mirror repository)

---

## 1. Executive Summary

This audit evaluates the current telemetry and insights architecture of Emotify across student-facing and counselor-facing surfaces. The primary focus is assessing whether daily emotional data (`dailyCheckins`), episodic emotion data (`emotionLogs`), somatic data (`emotionMaps`), clinical screening data (`screeningAttempts`), intervention logs (`microGoals`, `jpmrLogs`, `reframeLogs`, `cbtSessions`), and longitudinal summaries are queried and represented from their authoritative sources of truth.

### Key Audit Findings:
1. **Critical Domain Disconnect (P1-INSIGHTS-01):** `convex/insights.ts:getDailyStats` queries `emotionLogs` to compute `totalCheckins` and mood trend data (`stats.emotionLogs`). However, in Priority 7 Phase 2, student daily check-ins were properly normalized to write strictly to `dailyCheckins` (eliminating shadow writes to `emotionLogs`). Consequently, `emotionLogs` currently has **zero active writers** across the entire client application. As a result, students who diligently check in every morning see "0 Check-ins" and an empty mood trend graph in their mobile Insights tab (`app/(auth)/(tabs)/insights.tsx`).
2. **Unbounded Full-History Retrieval (P2-INSIGHTS-02):** Although named `getDailyStats`, `insights.ts:getDailyStats` performs unbounded `.collect()` queries across six separate tables (`microGoals`, `jpmrLogs`, `reframeLogs`, `emotionLogs`, `screeningAttempts`, `triages`) without any time boundary or result limit, returning complete historical records of CBT thoughts, clinical screening scores, and triage classifications to the client on every visit to the Insights tab.
3. **Data Export Schema Inconsistency (P2-INSIGHTS-03):** `app/(auth)/(tabs)/profile.tsx` consumes `getDailyStats` to generate a CSV export expecting `wsas_total`, `reqol10_total`, and `phq9_item9_score`. However, `getDailyStats` only maps `phq9_total`, `gad7_total`, and `pq16_total` from completed `screeningAttempts`, resulting in blank/undefined values for secondary instruments in the student CSV export.
4. **Timezone Discrepancies in Derived Analytics (P2-INSIGHTS-04):** `convex/wellness.ts:updateProfile` evaluates "morning person" vs "evening person" energy patterns using `new Date(log.createdAt).getHours()`. In server UTC execution, morning hours in India Standard Time (07:00–11:00 IST = 01:30–05:30 UTC) are misclassified, biasing the pattern to "Evening person". Furthermore, `app/index.tsx` checks daily landing video playback using raw `new Date().toISOString().split("T")[0]`, causing early-morning launches (00:00–05:30 IST) to evaluate against the previous calendar date.
5. **Counselor Visibility Gap (P2-INSIGHTS-05):** In the Counselor Dashboard (`PatientDetail.tsx`), counselors have dedicated tabs for Screenings, CBT, Somatic & JPMR (`emotionMaps`, `jpmrLogs`), and Gamification, but **zero dedicated views for `dailyCheckins`**. The only mechanism for a counselor to inspect daily check-ins is by toggling the optional "monitoring" telemetry category in the Clinical Timeline view.
6. **Authorization Preservation (VERIFIED INTACT):** The P0 security hardening implemented in Priority 7 Phase 1 (`assertCanAccessStudent(ctx, targetUserId)`) remains strictly intact in `convex/insights.ts:getDailyStats`. Unauthorized cross-student requests are rejected.

---

## 2. Files Inspected

### Backend Functions & Schemas:
- `convex/insights.ts` (Lines 1–197: `getDailyStats`)
- `convex/wellness.ts` (Lines 1–137: `getProfile`, `updateProfile`)
- `convex/emotionLogs.ts` (Lines 1–60: `create`, `getRecent`)
- `convex/emotionMaps.ts` (Lines 1–85: `create`, `getRecentLogs`)
- `convex/microGoals.ts` (Lines 330–370: `getDailyCheckin`; Lines 555–605: `recordDailyCheckin`; Lines 144–160, 478–495, 740–765: Streak logic)
- `convex/schema.ts` (Table definitions: `dailyCheckins`, `emotionLogs`, `emotionMaps`, `wellnessProfiles`, `reframeLogs`, `jpmrLogs`, `microGoals`, `screeningAttempts`, `triages`)
- `convex/timeline.ts` (Lines 125–243, 737–797: Longitudinal aggregation of `dailyCheckins`, `emotionLogs`, and `emotionMaps`)
- `convex/dashboard.ts` (Lines 506–570: `getPatientCbtAnalytics`)
- `convex/reinforcement.ts` (Lines 1–88: `generatePositiveMessage`)

### Mobile App (Student Surface):
- `app/(auth)/(tabs)/insights.tsx` (Lines 1–250: Main student insights screen)
- `app/(auth)/(tabs)/index.tsx` (Lines 237, 287, 429, 439, 492–560: Daily check-in submission and mood binding)
- `app/(auth)/(tabs)/profile.tsx` (Lines 32, 219–250: CSV data export)
- `app/index.tsx` (Lines 41, 63, 86: Video replay date checks)
- `context/MoodThemeContext.tsx` (Lines 18–42: Active emotion theme resolution)
- `utils/date.ts` (Lines 1–49: Client-local calendar date normalization)

### Counselor Dashboard:
- `dashboard/src/pages/PatientDetail.tsx` (Tabs: screenings, timeline, cbt, somatic, gamification)
- `dashboard/src/components/ClinicalTimelineView.tsx` (Timeline view and monitoring filter)

---

## 3. Insights API Inventory

`convex/insights.ts` exposes a single query:

### `api.insights.getDailyStats`
- **Arguments:** `{ userId: v.optional(v.string()) }`
- **Authentication:** Enforces `ctx.auth.getUserIdentity()`. Throws `"Unauthenticated: Must be logged in to view insights."` if missing.
- **Authorization:** Invokes `assertCanAccessStudent(ctx, targetUserId)`. Students can query only their own stats; counselors/admins can query authorized students.
- **Identity Resolution:** Resolves `targetUserId` against `users` table via `ctx.db.get` or `by_clerkId` index. Constructs `searchUserIds` containing canonical `users._id` and `clerkId`.
- **Tables Read:**
  1. `microGoals` (`by_userId`): Collects all goals; computes `totalCalmPoints` and `completedGoalsCount`.
  2. `jpmrLogs` (`by_userId`): Collects all logs; computes `jpmrMinutes` and `avgJpmrDrop`.
  3. `reframeLogs` (`by_user`): Collects all logs; maps situation, thoughts, traps; computes `avgReframeDrop`. Falls back to legacy `reframes` table if empty.
  4. `emotionLogs` (`by_userId`): Collects all logs; computes `totalCheckins = emotionLogs.length`.
  5. `screeningAttempts` (`by_userId`): Collects all attempts; filters `status === "completed"`; maps PHQ-9, GAD-7, PQ-16 scores. Falls back to legacy `screenings` table if empty.
  6. `triages` (`by_userId`): Collects all triages.
- **Return Type:**
  ```typescript
  {
    totalCalmPoints: number,
    completedGoalsCount: number,
    jpmrMinutes: number,
    avgJpmrDrop: string,
    reframesCount: number,
    avgReframeDrop: string,
    totalCheckins: number,
    emotionLogs: any[],
    microGoals: any[],
    jpmrLogs: any[],
    reframes: any[],
    screenings: any[],
    triages: any[]
  }
  ```

---

## 4. Caller → Query → Source Table Matrix

| Caller Location | Query Invoked | Data Fields Consumed | Intended Clinical / Telemetry Domain | Authoritative Source Queried by Backend | Disconnect / Finding |
|---|---|---|---|---|---|
| `app/(auth)/(tabs)/insights.tsx:21` | `api.insights.getDailyStats` | `totalCalmPoints`, `completedGoalsCount`, `totalCheckins`, `reframesCount`, `jpmrMinutes`, `emotionLogs` | Student Wellness Summary & 7-Day Mood Trend | `microGoals`, `jpmrLogs`, `reframeLogs`, `emotionLogs` | **Disconnect:** `totalCheckins` and `emotionLogs` are read from `emotionLogs` instead of `dailyCheckins`. Shows 0 check-ins for active students. |
| `app/(auth)/(tabs)/profile.tsx:32` | `api.insights.getDailyStats` | `screenings` (in `handleExportData`) | Student Data Export (CSV) | `screeningAttempts` (completed) / `screenings` | **Data Incompleteness:** CSV expects `wsas_total`, `reqol10_total`, `phq9_item9_score`, but `getDailyStats` drops them during projection. |
| `convex/priority7.test.ts:110-141` | `api.insights.getDailyStats` | Return object defined, `jpmrMinutes`, `completedGoalsCount` | Authorization & Access Verification | Same as above | Verified: P0 security tests pass. Functional telemetry correctness is untested. |
| `app/(auth)/(tabs)/index.tsx:287` | `api.emotionLogs.getRecent` | `recentEmotions[0].emotion` | Home Avatar State & Mood Badge | `emotionLogs` | **Empty Stream:** No writes occur to `emotionLogs`; returns empty array unless legacy data exists. |
| `context/MoodThemeContext.tsx:22` | `api.emotionLogs.getRecent` | `recentEmotions[0].emotion` | App-wide Emotion Theme Colors | `emotionLogs` | **Empty Stream:** Fails to adopt current daily check-in mood from `dailyCheckins`. Defaults to neutral theme. |
| `convex/wellness.ts:57` | Internal read in `updateProfile` | `emotionLogs` intensity and timestamp | Wellness Profile (Mood Pattern & Energy Pattern) | `emotionLogs` | **Stale / Missing Data:** Defaults to "Mostly calm and stable" and "Evening person" because `emotionLogs` has no entries. |
| `convex/reinforcement.ts:18` | Internal read in `generatePositiveMessage` | `emotionLogs` pre/post intensity | Positive Reinforcement Messaging | `emotionLogs` | **Inactive Trigger:** Emotional improvement message is never triggered from `dailyCheckins`. |
| `dashboard/src/pages/PatientDetail.tsx:66` | `api.dashboard.getPatientCbtAnalytics` | `emotionMaps`, `jpmrLogs`, `reframeLogs`, `microGoals` | Counselor Patient Detail (Somatic & CBT Tabs) | `emotionMaps`, `jpmrLogs`, `reframeLogs`, `cbtSessions` | Correctly reads `emotionMaps` and `jpmrLogs`. Does not query `dailyCheckins`. |
| `dashboard/src/components/ClinicalTimelineView.tsx` | `api.timeline.getStudentClinicalTimeline` | Unified timeline event stream | Comprehensive Clinical History | All clinical & telemetry tables (when `categoryFilter === "monitoring"`) | Correctly includes `dailyCheckins`, `emotionLogs`, and `emotionMaps` under the "monitoring" filter. |

---

## 5. DailyCheckins Audit

### Intended Meaning
Daily calendar mood/state check-in representing the student's primary self-reported baseline for a given calendar date.

### Current Implementation State:
- **Write Path:** In `app/(auth)/(tabs)/index.tsx:506` and `index.tsx:554`, check-in actions invoke `api.microGoals.recordDailyCheckin` with `{ mood: dailyMood, dateStr: getLocalDateString() }`.
- **Persistence:** Correctly inserts/updates in `dailyCheckins` with unique composite index `by_userId_and_dateStr`.
- **Read Path (Student Home):** `api.microGoals.getDailyCheckin` queries `dailyCheckins` for `todayStr`, successfully indicating whether the user checked in today.
- **Read Path (Insights Tab):** **Completely bypassed.** `convex/insights.ts:getDailyStats` does not read `dailyCheckins`.
- **Read Path (Counselor Dashboard):** Completely missing from `PatientDetail.tsx` overview and tabs; visible only in `ClinicalTimelineView` under the "monitoring" filter.

---

## 6. EmotionLogs Audit

### Intended Meaning
Episodic, contextual, or event-driven emotion observations (e.g., pre/post intensity changes during specific psychological exercises or acute emotional episodes).

### Current Implementation State:
- **Write Path:** Mutation `api.emotionLogs.create` exists in `convex/emotionLogs.ts:6`. In `app/(auth)/(tabs)/index.tsx:237`, `const createLog = useMutation(api.emotionLogs.create)` is defined, but **it is never called**.
- **Persistence:** The `emotionLogs` table contains legacy records from earlier phases, but receives zero new writes during normal user workflows.
- **Read Path:**
  - `insights.ts:getDailyStats` queries `emotionLogs` and misrepresents `emotionLogs.length` as `totalCheckins`.
  - `insights.tsx` plots `stats.emotionLogs` as the "Mood Trend" chart.
  - `wellness.ts:updateProfile` relies on `emotionLogs` for mood patterns.
  - `reinforcement.ts` relies on `emotionLogs` for emotional improvement messages.
  - `MoodThemeContext.tsx` queries `api.emotionLogs.getRecent` to determine theme colors.

---

## 7. EmotionMaps Audit

### Intended Meaning
Somatic / body-focused observations capturing anatomical regions of tension/distress, body ratings (intensity per region), and suggested somatic coping actions.

### Current Implementation State:
- **Write Path:** Written exclusively by `app/(auth)/tools/emotion-map.tsx:170` via `api.emotionMaps.create`. Validates region intensities (1–10) and average intensity.
- **Persistence:** Stored in `emotionMaps` with `by_userId` and `by_createdAt` indexes.
- **Read Path (Student):** `api.emotionMaps.getRecentLogs` queries `emotionMaps` with `assertCanAccessStudent`.
- **Read Path (Counselor):** `dashboard.ts:getPatientCbtAnalytics` queries `emotionMaps` and supplies data to `PatientDetail.tsx` (rendered under the "Somatic & JPMR" tab).
- **Read Path (Timeline):** `timeline.ts` maps `emotionMaps` to event type `emotion_map` under `category: "monitoring"`.
- **Read Path (Insights):** `convex/insights.ts` does **not** read or summarize `emotionMaps`. Somatic tracking is currently isolated to the specific tool screen and counselor view.

---

## 8. Screening / Clinical Data Audit

### Intended Meaning
Authoritative psychometric clinical screening attempts (`screeningAttempts`), resulting clinical severity evaluations (`triages`), and operational crisis alerts (`alerts`).

### Current Implementation State in Insights:
- **Authoritative Table Selection:** `insights.ts:getDailyStats` reads `screeningAttempts` with `status === "completed"`, correctly ignoring abandoned or in-progress attempts.
- **Legacy Fallback:** If `completedAttempts.length === 0`, it queries legacy `screenings`.
- **Risk of Legacy Data Omission:** If a patient has 10 historical records in legacy `screenings` and completes 1 new attempt in `screeningAttempts`, `getDailyStats` returns only the single new attempt because `if (completedAttempts.length > 0)` bypasses legacy queries completely.
- **Clinical Exposure in Telemetry Payload:** `getDailyStats` includes raw `screenings` (with total scores) and raw `triages` (with clinical triage levels and reasons) in the payload returned to the student Insights tab, even though `insights.tsx` does not display screenings or triages.
- **CSV Data Truncation:** In `profile.tsx:handleExportData`, the CSV export formats columns:
  `UserID,PHQ9,GAD7,PQ16,WSAS,ReQoL10,Item9,Date`
  However, `getDailyStats` projects only:
  ```typescript
  {
    _id: a._id,
    userId: a.userId,
    phq9_total: a.results?.phq9?.score ?? 0,
    gad7_total: a.results?.gad7?.score ?? 0,
    pq16_total: a.results?.pq16?.score ?? 0,
    createdAt: a.completedAt || a.startedAt,
  }
  ```
  `wsas_total`, `reqol10_total`, and `phq9_item9_score` are omitted, resulting in missing data in student exports.

---

## 9. Timezone / Date Semantics Audit

### Client vs. Server Timezone Handling:
1. **Normalization Progress:** Priority 7 Phase 2 introduced `utils/date.ts` providing `getLocalDateString()` for student daily check-ins on mobile.
2. **Remaining Server UTC Date Inconsistencies:**
   - **`convex/microGoals.ts:getStreak`:** Computes `todayStr` and `yesterdayStr` using server UTC:
     ```typescript
     const todayStr = new Date().toISOString().split("T")[0];
     const yesterdayStr = yesterday.toISOString().split("T")[0];
     ```
     **Failure Scenario:** A student in India (IST = UTC+05:30) completes a daily check-in at 01:00 AM IST on Tuesday, September 29. The client submits `dateStr: "2026-09-29"`. However, on the server, the UTC time is 19:30 UTC on Monday, September 28. If the streak query executes, `todayStr` is calculated as `"2026-09-28"`. The check-in appears to be in the future relative to server UTC, causing streak calculations to misalign or freeze.
   - **`convex/wellness.ts:updateProfile` (Energy Pattern):**
     ```typescript
     const morningLogs = emotionLogs.filter(log => {
       const hour = new Date(log.createdAt).getHours();
       return hour >= 5 && hour < 12;
     }).length;
     ```
     **Failure Scenario:** `getHours()` runs in UTC. A student logging emotions at 08:00 AM IST creates a record at 02:30 AM UTC (`hour = 2`). Because `2 < 5`, this morning log is never categorized as morning, permanently skewing the profile to "Evening person".
   - **`app/index.tsx` (Video Splash Guard):**
     Uses `const todayStr = new Date().toISOString().split('T')[0];` directly on the device. Between 00:00 and 05:29 IST, this evaluates to the previous calendar date, causing the introduction video to replay repeatedly.

---

## 10. Authorization & Privacy Audit

### Evaluation of `convex/insights.ts:getDailyStats`:
- [x] **Authentication:** Checked via `ctx.auth.getUserIdentity()`. Unauthenticated access strictly denied.
- [x] **Authorization:** Enforced via `assertCanAccessStudent(ctx, targetUserId)`.
  - Student caller requesting another student's ID: Denied with `Forbidden`.
  - Student caller requesting own ID or omitted ID: Allowed.
  - Counselor/admin requesting authorized student ID: Allowed.
- [x] **Identifier Compatibility:** Correctly constructs `searchUserIds` using both `users._id` and `clerkId`.
- [!] **Overexposure of Clinical Data:** While authorized, `getDailyStats` returns complete historical `triages`, `screenings`, and `reframeLogs` to a general student "daily stats" endpoint.

---

## 11. Data Integrity Audit

1. **Missing Data vs. Genuine Zero:** In `app/(auth)/(tabs)/insights.tsx`, `stats.totalCheckins` displays `0` because it reads `emotionLogs`. This is an artifact of table disconnection, not a genuine zero check-in count.
2. **Unbounded Historical Reads:** `getDailyStats` does not paginate or filter by date range. Every call retrieves the entire historical lifetime of goals, JPMR sessions, reframes, emotion logs, and screenings.
3. **Double Counting Protection:** Deduplication using `Set<string>` on document `_id` is implemented across all multi-id queries in `insights.ts`.
4. **Idempotent Check-in Submission:** In `convex/microGoals.ts:recordDailyCheckin`, queries on `by_userId_and_dateStr` prevent duplicate check-in records for the same calendar date.

---

## 12. Performance & Production Readiness Audit

| Table Queried in `getDailyStats` | Index Used | Scan Type | Bounded / Limit | Risk at Production Scale (1,000+ records) |
|---|---|---|---|---|
| `microGoals` | `by_userId` | Index lookup + Full scan of user results | **Unbounded** (`.collect()`) | High: Memory overhead as goals accumulate. |
| `jpmrLogs` | `by_userId` | Index lookup + Full scan of user results | **Unbounded** (`.collect()`) | Moderate: Steady linear growth. |
| `reframeLogs` | `by_user` | Index lookup + Full scan of user results | **Unbounded** (`.collect()`) | High: Text-heavy situational records loaded into memory. |
| `emotionLogs` | `by_userId` | Index lookup + Full scan of user results | **Unbounded** (`.collect()`) | High: Unnecessary query since table has no active writes. |
| `screeningAttempts` | `by_userId` | Index lookup + Full scan of user results | **Unbounded** (`.collect()`) | Low–Moderate: Periodic screenings (10–30 records/year). |
| `triages` | `by_userId` | Index lookup + Full scan of user results | **Unbounded** (`.collect()`) | Low–Moderate: Proportional to screenings. |

**Verdict:** `getDailyStats` is not production-ready for long-term active users due to unbounded `.collect()` queries across six tables on a high-frequency UI tab.

---

## 13. Counselor Visibility Audit

1. **Daily Check-ins:**
   - **Status:** **Invisible** in primary Counselor Patient Detail tabs (`screenings`, `cbt`, `somatic`, `gamification`).
   - **Workaround:** Only visible if the counselor navigates to the "Clinical Timeline" tab and explicitly selects the "Monitoring Telemetry" filter.
2. **Episodic Emotion Logs:**
   - **Status:** Queryable in `dashboard.ts:getPatientCbtAnalytics`, but the table has no incoming writes.
3. **Somatic Emotion Maps:**
   - **Status:** **Fully Visible** in `PatientDetail.tsx` under the "🧘 Somatic & JPMR" tab (`cbtAnalytics.emotionMaps`).
4. **Clinical Screenings & Triage:**
   - **Status:** **Fully Visible** in `PatientDetail.tsx` under the "Screening History" tab.
5. **Safety Alerts:**
   - **Status:** **Fully Visible** via the active safety alert banner implemented in Step 2B.

---

## 14. Test Coverage Audit

### Existing Test Coverage (`convex/priority7.test.ts`):
- `SEC-01`: `insights.getDailyStats` rejects unauthenticated call. (PASSING)
- `SEC-02`: Student A cannot access Student B stats via `getDailyStats`. (PASSING)
- `SEC-03`: Student A can query their own stats via `getDailyStats`. (PASSING)
- `SEC-04`: Authorized Counselor and Admin can access student stats via `getDailyStats`. (PASSING)

### Missing Test Coverage (Audit Findings):
- [ ] No test asserting that `dailyCheckins` data appears in `getDailyStats`.
- [ ] No test asserting that `totalCheckins` counts `dailyCheckins` records.
- [ ] No test verifying date-range bounded queries for weekly/monthly insights.
- [ ] No test verifying student CSV data export fidelity against secondary screening instruments.
- [ ] No test verifying IST timezone boundaries across midnight for streak and check-in evaluation.

---

## 15. Clinical Boundary Audit

1. **Telemetry vs. Clinical Boundary Violation in `wellness.ts`:**
   In `convex/wellness.ts:updateProfile`, clinical screening scores are converted into non-clinical personality traits:
   - `latestScreening?.gad7_total > 10` → `"Sensitive to stress"`
   - `latestScreening?.phq9_total > 15` → `"Needs gentle support"`
   - `latestScreening?.phq9_total > 10` → `"Gentle recovery"`
   *Clinical Concern:* Informally converting validated psychometric instrument scores into permanent user-facing personality labels creates clinical ambiguity without diagnostic or clinician validation.
2. **Separation of Clinical Data in `insights.ts`:**
   `getDailyStats` bundles clinical triage decisions and screening attempt records into a non-clinical gamified telemetry endpoint.

---

## 16. Grouped Findings (P0 / P1 / P2 / P3)

### Priority 1: High Operational & Functional Impact

#### `P1-INSIGHTS-01`: `insights.ts:getDailyStats` Reads Disconnected `emotionLogs` Table
- **Severity:** P1
- **File / Function:** `convex/insights.ts:getDailyStats` (Lines 120–133) & `app/(auth)/(tabs)/insights.tsx` (Lines 34, 139)
- **Current Behavior:** `getDailyStats` computes `totalCheckins = emotionLogs.length` and returns `emotionLogs` for the student mood trend chart. Because daily check-ins write strictly to `dailyCheckins`, `emotionLogs` is empty.
- **Expected Behavior:** `getDailyStats` should query `dailyCheckins` for daily check-in counts, streaks, and mood trends, preserving `emotionLogs` solely for episodic emotion telemetry.
- **Evidence:** `convex/insights.ts:132` (`const totalCheckins = emotionLogs.length;`), `app/(auth)/(tabs)/index.tsx:496` (writes only to `dailyCheckins`).
- **Impact:** Student insights screen displays 0 check-ins and an empty mood graph for active students.
- **Dependency:** None.
- **Implementation Status:** Identified in audit. DO NOT IMPLEMENT YET.

---

### Priority 2: Performance, Timezone, and Data Fidelity

#### `P2-INSIGHTS-02`: Unbounded Full-Table Scans on User History in `getDailyStats`
- **Severity:** P2
- **File / Function:** `convex/insights.ts:getDailyStats` (Lines 37–179)
- **Current Behavior:** Executes `.collect()` on `microGoals`, `jpmrLogs`, `reframeLogs`, `emotionLogs`, `screeningAttempts`, and `triages` without date boundaries or pagination.
- **Expected Behavior:** Queries should be bounded by time ranges (e.g., past 7 days, past 30 days) or paginated.
- **Evidence:** `convex/insights.ts` lines 39, 55, 77, 122, 137, 170.
- **Impact:** Memory bloat, slow query response times, and unnecessary database bandwidth as user accounts age.
- **Dependency:** P1-INSIGHTS-01.
- **Implementation Status:** Identified in audit. DO NOT IMPLEMENT YET.

#### `P2-INSIGHTS-03`: Truncation of Secondary Screening Instruments in Student CSV Export
- **Severity:** P2
- **File / Function:** `convex/insights.ts:getDailyStats` (Lines 150–157) & `app/(auth)/(tabs)/profile.tsx` (Lines 227–229)
- **Current Behavior:** `profile.tsx` exports CSV with columns for `WSAS`, `ReQoL10`, and `Item9`, but `getDailyStats` maps only `phq9_total`, `gad7_total`, and `pq16_total`.
- **Expected Behavior:** Projected screening attempts should include all instrument totals present in `attempt.results`.
- **Evidence:** `convex/insights.ts:153–155`.
- **Impact:** Exported CSV has blank values for secondary clinical scales.
- **Dependency:** None.
- **Implementation Status:** Identified in audit. DO NOT IMPLEMENT YET.

#### `P2-INSIGHTS-04`: Server UTC Timezone Evaluation in Analytics & Splash Guard
- **Severity:** P2
- **File / Function:** `convex/wellness.ts:updateProfile` (Line 107), `convex/microGoals.ts:getStreak` (Lines 144, 478), `app/index.tsx` (Lines 41, 63, 86)
- **Current Behavior:** Uses `new Date().toISOString().split("T")[0]` and `getHours()` in UTC, causing date boundary shifts between 00:00 and 05:30 IST.
- **Expected Behavior:** Date strings and hour categorizations should account for the user's local timezone offset or use `getLocalDateString()`.
- **Evidence:** `convex/wellness.ts:107`, `convex/microGoals.ts:144`, `app/index.tsx:41`.
- **Impact:** Misclassified energy patterns ("Evening person"), possible streak miscalculations for early-morning check-ins in India.
- **Dependency:** `utils/date.ts`.
- **Implementation Status:** Identified in audit. DO NOT IMPLEMENT YET.

#### `P2-INSIGHTS-05`: Absence of Dedicated Daily Check-in Telemetry in Counselor View
- **Severity:** P2
- **File / Function:** `dashboard/src/pages/PatientDetail.tsx`
- **Current Behavior:** No tab or section displays the patient's daily check-in consistency or calendar mood history.
- **Expected Behavior:** Counselors should have clear visibility into daily check-in adherence without needing to filter through granular monitoring logs in the timeline.
- **Evidence:** `dashboard/src/pages/PatientDetail.tsx` (Lines 53–54).
- **Impact:** Counselors lack a quick view of student day-to-day mood stability.
- **Dependency:** Counselor UI design approval.
- **Implementation Status:** Identified in audit. DO NOT IMPLEMENT YET.

---

### Priority 3: Code Cleanliness & Maintenance

#### `P3-INSIGHTS-06`: Unused `createLog` Mutation in Student Home
- **Severity:** P3
- **File / Function:** `app/(auth)/(tabs)/index.tsx:237`
- **Current Behavior:** Imports `const createLog = useMutation(api.emotionLogs.create);` but never calls it.
- **Expected Behavior:** Dead mutation reference should be removed to avoid confusion.
- **Evidence:** `app/(auth)/(tabs)/index.tsx:237`.
- **Impact:** Dead code.
- **Dependency:** None.
- **Implementation Status:** Identified in audit. DO NOT IMPLEMENT YET.

---

## 17. Concrete Evidence Summary Table

| Finding ID | Source File | Line Number(s) | Concrete Code Snippet |
|---|---|---|---|
| `P1-INSIGHTS-01` | `convex/insights.ts` | 132 | `const totalCheckins = emotionLogs.length;` |
| `P1-INSIGHTS-01` | `app/(auth)/(tabs)/insights.tsx` | 34 | `const rawEmotions = [...stats.emotionLogs].sort(...).slice(-7);` |
| `P2-INSIGHTS-02` | `convex/insights.ts` | 39, 55, 77, 122, 137, 170 | `ctx.db.query("...").withIndex(...).collect()` (unbounded) |
| `P2-INSIGHTS-03` | `convex/insights.ts` | 150–157 | Omission of `wsas`, `reqol10`, `item9` in attempt mapping |
| `P2-INSIGHTS-04` | `convex/wellness.ts` | 107 | `const hour = new Date(log.createdAt).getHours();` (server UTC) |
| `P2-INSIGHTS-04` | `app/index.tsx` | 41, 63, 86 | `new Date().toISOString().split('T')[0];` (client UTC fallback) |
| `P2-INSIGHTS-05` | `dashboard/src/pages/PatientDetail.tsx` | 53–54 | Tabs limited to `screenings`, `timeline`, `cbt`, `somatic`, `gamification` |
| `P3-INSIGHTS-06` | `app/(auth)/(tabs)/index.tsx` | 237 | `const createLog = useMutation(api.emotionLogs.create);` (unused) |

---

## 18. Dependencies

- **Domain Integrity:** Requires preserving the clean three-domain separation established in Priority 7 Phase 2:
  - `dailyCheckins` = daily calendar baseline state
  - `emotionLogs` = episodic / situational emotional events
  - `emotionMaps` = somatic / anatomical body observations
- **Authorization Invariants:** Any modification to `insights.ts` must maintain `assertCanAccessStudent(ctx, targetUserId)` and reject unauthenticated or cross-student access.
- **Date Invariant:** Any date filtering must align with `utils/date.ts` local calendar strings.

---

## 19. Proposed Implementation Sequence (For Future Phase)

When implementation is authorized, the recommended execution sequence is:

1. **Step 3A — Telemetry Query Normalization (`convex/insights.ts`):**
   - Update `insights.ts:getDailyStats` to query `dailyCheckins` using `by_userId` index for the past 7–30 days.
   - Map `totalCheckins` to `dailyCheckins.length`.
   - Provide a normalized 7-day mood history derived from `dailyCheckins`.
   - Maintain `emotionLogs` in the payload for episodic tracking.
   - Include complete instrument scores (`wsas`, `reqol10`, `item9`) in screening projections.
2. **Step 3B — Student Insights UI Alignment (`app/(auth)/(tabs)/insights.tsx`):**
   - Update `insights.tsx` to plot daily mood check-ins on the Mood Trend chart.
   - Ensure "Check-ins" stat card reflects actual `dailyCheckins`.
3. **Step 3C — Timezone Normalization (`convex/wellness.ts` & `app/index.tsx`):**
   - Update `app/index.tsx` to use `getLocalDateString()`.
   - Correct UTC hour calculations in `wellness.ts` or accept user client offset.
4. **Step 3D — Counselor Daily Check-in Visibility (Dashboard):**
   - Add a lightweight daily check-in calendar / mood summary card in `PatientDetail.tsx`.

---

## 20. Explicit "DO NOT IMPLEMENT YET" Section

The following items are strictly out of scope for this audit step and **MUST NOT BE IMPLEMENTED** until explicitly directed:

- [x] **DO NOT modify `convex/insights.ts`.**
- [x] **DO NOT modify `convex/wellness.ts`.**
- [x] **DO NOT modify `app/(auth)/(tabs)/insights.tsx` or `index.tsx`.**
- [x] **DO NOT modify `dashboard/src/pages/PatientDetail.tsx`.**
- [x] **DO NOT create materialized insight tables or caching schemas.**
- [x] **DO NOT alter screening thresholds, scoring rules, or triage levels.**
- [x] **DO NOT invent mood-to-risk inference rules.**
- [x] **DO NOT modify `unblockPatient`.**
- [x] **DO NOT begin Step 2C (historical-risk indicators).**
- [x] **DO NOT begin Priority 8 or 9.**

---

## 21. Final Readiness Matrix

| Area | Current Audit Status | Implementation Readiness | Prerequisite / Blocker |
|---|---|---|---|
| Domain Boundary Verification | Complete | Ready for implementation | Review of this audit report |
| `insights.ts` Authorization | Verified Secure (P0 intact) | Stable | None |
| Daily Check-in Disconnect | Root cause identified | Ready for Step 3A | Review of this audit report |
| Unbounded Queries | Root cause identified | Ready for Step 3A | Define time-window policy (e.g. 30 days) |
| CSV Screening Data Truncation | Root cause identified | Ready for Step 3A | None |
| Timezone Inconsistencies | Root cause identified | Ready for Step 3C | None |
| Counselor Check-in Visibility | Identified | Pending clinical/UI review | Product approval on UI location |
| Historical Risk (Step 2C) | Paused | Blocked | Awaiting clinical policy on decay/retention |

---

## 22. Baseline Verification Results

Prior to authoring this audit report, baseline test verification was executed with zero code modifications:

- **Command:** `npx vitest run`
- **Result:**
  - **12 test files passed (12/12)**
  - **167 tests passed (167/167)**
  - **Duration:** 9.08s
- **TypeScript Check:** `npx tsc --noEmit` exited with Code 0.
- **Counselor Dashboard Build:** `npm run build --prefix dashboard` exited with Code 0.

---

**AUDIT COMPLETE — STRICT STOP CONDITION OBSERVED.**  
No code or schema modifications were performed. Awaiting review and instructions.
