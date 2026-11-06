# PRIORITY 7 — PHASE 5 — STEP 3D
## COUNSELOR DAILY CHECK-IN VISIBILITY AUDIT REPORT

**Status:** AUDIT COMPLETE — AWAITING REVIEW & PRODUCT/CLINICAL DECISIONS  
**Author:** Antigravity Agent  
**Date:** September 28, 2026  
**Scope:** Priority 7 Phase 5 Step 3D Audit ONLY (Zero code/schema/UI changes)  

---

### 1. Executive Summary

This audit assesses how student daily check-in data (`dailyCheckins`) is currently exposed to counselors within the Emotify Clinical Dashboard, evaluates its alignment with the canonical clinical domain architecture, and analyzes safe implementation options for longitudinal counselor visibility.

**Key Findings:**
1. **Domain Model Boundary:** In accordance with the canonical architecture established in Priority 7 Phase 5 Steps 3A–3C, `dailyCheckins` represents daily calendar mood/wellness state, distinct from episodic situational emotion logs (`emotionLogs`), somatic observations (`emotionMaps`), clinical screening attempts (`screeningAttempts`), and triage decisions (`triages`).
2. **Current Counselor Visibility Status:** Daily check-ins are **completely absent** from the main tabs, headers, and summary cards of the Counselor Patient Detail view (`dashboard/src/pages/PatientDetail.tsx`). They are queryable **only through the Clinical Timeline view (`ClinicalTimelineView.tsx`) when the counselor explicitly selects the "Monitoring" pill filter**. Under the default "All" timeline filter, daily check-ins are intentionally suppressed to prevent high-frequency telemetry from obscuring formal clinical events.
3. **Authorization & Identity Resolution:** The backend authorization model (`convex/authz.ts:assertCanAccessStudent`) already permits counselors and administrators to query student telemetry. Dual-identifier resolution (`users._id` and `clerkId`) is properly established.
4. **Caseload Limitation:** There is currently **no counselor caseload assignment mapping** in the data model. Any counselor or administrator can view any student's clinical file.
5. **Clinical Principle:** Daily check-ins are self-reported diurnal wellness telemetry. They must not be conflated with clinical screening tools (PHQ-9, GAD-7, PQ-16), must not automatically generate triage escalations or clinical alerts, and must be clearly labeled as non-diagnostic self-reports.

---

### 2. Current Counselor Visibility Matrix

| Data Domain | Student Mobile Experience | Counselor Dashboard Experience | Admin Dashboard Experience | Current Dashboard UI Location | Authoritative Backend Source |
|:---|:---|:---|:---|:---|:---|
| **`dailyCheckins`** | Yes (Home check-in card, Micro-goals check-in status, Insights 7-day trend) | Partial (**Only** inside Clinical Timeline under "Monitoring" pill; absent from main detail tabs) | Partial (Same as counselor) | `ClinicalTimelineView` ("Monitoring" tab only); absent from Patient Header and Assessments | `dailyCheckins` table (`by_userId`, `by_userId_and_dateStr`) |
| **`emotionLogs`** | Yes (Situational emotion logging, episodic journal) | Partial (Only inside Clinical Timeline under "Monitoring" pill; legacy fallback in stats) | Partial (Same as counselor) | `ClinicalTimelineView` ("Monitoring" tab only) | `emotionLogs` table (`by_userId`) |
| **`emotionMaps`** | Yes (Somatic body mapping screen) | Yes (Direct tab in PatientDetail + Timeline under "Monitoring") | Yes (Same as counselor) | PatientDetail -> "Somatic & JPMR" tab & `ClinicalTimelineView` ("Monitoring") | `emotionMaps` table (`by_userId`, `by_createdAt`) |
| **`screeningAttempts`** | Yes (Baseline, Reassessment, Retest screens) | Yes (Header stats, score trend chart, full historical table, Timeline "Screening" & "All") | Yes (Same as counselor) | PatientDetail -> "Clinical Assessments" tab & `ClinicalTimelineView` ("Screening" & "All") | `screeningAttempts` table (`by_userId`, `by_status`, `by_startedAt`) |
| **`triages`** | Yes (Home screen care level badge and safety guidance) | Yes (PatientDetail header badge, Clinical Timeline "Triage" & "All") | Yes (Same as counselor) | PatientDetail Header badge & `ClinicalTimelineView` ("Triage" & "All") | `triages` table (`by_userId`, `by_attemptId`) |
| **`alerts`** | Yes (Active safety alert banner, emergency hotlines) | Yes (Top red alert banner with Acknowledge action, Clinical Timeline "Safety" & "All") | Yes (Same as counselor) | PatientDetail Top Banner & `ClinicalTimelineView` ("Safety" & "All") | `alerts` table (`by_userId`, `by_status`, `by_attemptId`, `by_triageId`) |
| **`appointments`** | Yes (Booking screen, upcoming appointments) | Yes (Clinical Timeline "Counseling" & "All", Counselor appointments page) | Yes (Same as counselor) | `ClinicalTimelineView` ("Counseling" & "All") & Appointments page | `appointments` table (`by_userId`, `by_startTime`) |
| **`followUps`** | Yes (Recovery plan follow-ups) | Yes (Clinical Timeline "Counseling" & "All") | Yes (Same as counselor) | `ClinicalTimelineView` ("Counseling" & "All") | `followUps` table (`by_userId`) |

---

### 3. DailyCheckins Data Contract

- **Schema Definition (`convex/schema.ts`):**
  ```typescript
  dailyCheckins: defineTable({
    userId: v.string(),
    dateStr: v.string(), // Local calendar date "YYYY-MM-DD"
    mood: v.string(),    // Self-reported mood token
    createdAt: v.number(), // UTC epoch timestamp
  })
    .index("by_userId_and_dateStr", ["userId", "dateStr"])
    .index("by_userId", ["userId"])
  ```
- **Field Semantics:**
  - `userId`: Identifier of the student. May be canonical `users._id` or legacy `clerkId`.
  - `dateStr`: Authoritative local calendar date string (`YYYY-MM-DD`). Preserved across client and backend boundaries without UTC shifting (normalized in Step 3C).
  - `mood`: Self-reported emotional descriptor (e.g., `"calm"`, `"good"`, `"great"`, `"low"`, `"sad"`, `"heavy"`, `"worried"`, `"anxious"`).
  - `createdAt`: Deterministic UTC epoch millisecond timestamp representing insertion time.
  - **No `intensity` field:** The underlying table does not store an intensity number. An integer scale (3–8) is derived purely for UI visualization in `convex/insights.ts` via `moodToIntensity()`.
- **Uniqueness & Write Constraint:**
  - Index `by_userId_and_dateStr` guarantees fast lookup.
  - `convex/microGoals.ts:submitMorningCheckin` verifies if a check-in exists for `(userId, dateStr)`. It rejects duplicate entries unless `allowUpdate: true` is explicitly passed.
- **Identity Resolution:**
  - Queries in `convex/insights.ts` and `convex/timeline.ts` assemble `searchUserIds = new Set([canonicalUserId, targetUserId, user?.clerkId])` to retrieve documents across both canonical and legacy identifiers, followed by deduplication on `dateStr`.

---

### 4. Current Patient Detail Experience

Inspection of `dashboard/src/pages/PatientDetail.tsx` reveals:
1. **Direct Visibility:** Daily check-ins do **not** appear anywhere in the primary PatientDetail view.
2. **Tab Distribution:**
   - `screenings`: Displays PHQ-9, GAD-7, and PQ-16 score trends and test history. Zero daily mood telemetry.
   - `timeline`: Embeds `ClinicalTimelineView`. Suppressed by default (see Section 5).
   - `cbt`: Displays AI CBT sessions, tension reduction, thinking styles, and behavioral activation micro-goals. Zero daily mood telemetry.
   - `somatic`: Displays JPMR logs and Emotion Body Maps (`emotionMaps`). Zero daily mood telemetry.
   - `gamification`: Displays Level, XP, streaks, badges, and cognitive reframe logs. Zero daily mood telemetry.
3. **Counselor Limitation:** To see how a student has felt on a day-to-day basis, a counselor must switch to the "Clinical Timeline" tab and explicitly select the "Monitoring" pill. The counselor cannot view a 7-day or 14-day daily mood progression alongside clinical data.
4. **Clinical Labeling:** Where clinical assessments appear, labels are appropriately formal ("Clinical Score Trends", "PHQ-9 (Depression)", "GAD-7 (Anxiety)"). Telemetry labels in `ClinicalTimelineView` use non-diagnostic terms ("Daily Mood Check-in").

---

### 5. Timeline Integration Analysis

Inspection of `convex/timeline.ts` and `dashboard/src/components/ClinicalTimelineView.tsx` shows:
- **Filtering Mechanism:**
  - `timeline.ts` sets `isMonitoringRequested = args.categoryFilter === "monitoring"`.
  - When the counselor loads the timeline with the default `"all"` filter (`categoryFilterArg = undefined`), `isMonitoringRequested` evaluates to `false`.
  - Consequently, `dailyCheckins`, `emotionLogs`, and `emotionMaps` are **completely excluded from query execution** in the default timeline view.
- **Rationale:**
  - This was an intentional design decision during Priority 4 Step 5: high-frequency daily check-ins (up to 365 events/year) must not crowd out critical safety alerts, screening score changes, and triage records.
- **Event Representation (under "Monitoring" filter):**
  - Category: `"monitoring"`
  - Event Type: `"daily_mood_checkin"`
  - Title: `Daily Mood: ${dc.mood}`
  - Summary: `Daily calendar mood check-in for ${dc.dateStr}.`
  - Metadata: `{ dateStr: dc.dateStr, mood: dc.mood }`
  - Occurred At: `dc.createdAt`
- **Distinction from Episodic Logs:**
  - `dailyCheckins` are represented as `"daily_mood_checkin"` with `sourceTable: "dailyCheckins"`.
  - `emotionLogs` are represented as `"emotion_log"` with `sourceTable: "emotionLogs"`.
  - They are cleanly distinguished at the event level.

---

### 6. Counselor Authorization Analysis

- **Guard Function:** `assertCanAccessStudent(ctx, targetUserId)` in `convex/authz.ts`.
- **Authorization Rules:**
  1. Unauthenticated callers are rejected with `"Unauthenticated: Login required"`.
  2. Students can access **only** their own data (`targetUserId === callerId` or matches student's canonical `_id`/`clerkId`). Cross-student access is rejected with `"Unauthorized: Students can access ONLY their own clinical data"`.
  3. Counselors (`role === "counsellor"`) and Administrators (`role === "admin"`) are granted access to any student's data.
- **Security Assessment:**
  - The authorization logic is robust, centralized, and covered by 12 comprehensive unit tests in `convex/authz.test.ts` and `convex/priority7.test.ts`.
  - Any new endpoint or query introduced for counselor check-in visibility must route through `assertCanAccessStudent(ctx, targetUserId)`.

---

### 7. Caseload Scope Limitation

- **Current State:**
  - The dashboard displays a static label (`Assigned Counsellor: Priyanka R.`) in `PatientDetail.tsx:395`, but this is hardcoded in the frontend.
  - The database schema (`convex/schema.ts`) has **no caseload assignment table** and no `assignedCounselorId` field on `users`.
  - `assertCanAccessStudent` allows any counselor to view any student.
- **Boundary Constraint:**
  - In accordance with the prompt guidelines, **no counselor caseload assignment architecture will be created in Step 3D**.
  - This remains an acknowledged institutional-level architecture limitation for a future phase.

---

### 8. Product / Clinical Options (Without Ranking)

The following four implementation options represent different ways to expose daily check-ins to counselors:

#### Option A: Dedicated Daily Mood Telemetry Card / Sub-Panel in PatientDetail
- **Description:** Add a dedicated card within the "Clinical Assessments" tab or "Somatic & JPMR" tab displaying the student's recent daily check-ins (e.g., 14-day history) with mood tokens and dates.
- **Data Required:** `recentDailyMood` or `dailyCheckins` (bounded to last 14–30 days).
- **Implementation Complexity:** Low.
- **Privacy Considerations:** Displays self-reported daily telemetry directly upon viewing the tab.
- **Clinical Risk:** Must feature a prominent disclaimer: *"Self-Reported Diurnal Telemetry — Non-Diagnostic"*. Counselors must not infer clinical depression or crisis from isolated low mood tokens.
- **Effect on Timeline:** Zero impact on `ClinicalTimelineView`.
- **Test Requirements:** Counselor authorization, chronological ordering, empty-state rendering.

#### Option B: Recent Daily-Checkin Summary Strip in PatientDetail Header
- **Description:** Add a compact daily check-in indicator in the top Stats Strip of PatientDetail (e.g., `Latest Daily Mood: Calm (Sep 28)` alongside `Latest PHQ-9`).
- **Data Required:** Latest daily check-in document.
- **Implementation Complexity:** Low.
- **Privacy Considerations:** High visibility immediately upon opening any patient's file.
- **Clinical Risk:** Moderate risk of anchoring bias: placing subjective daily mood directly next to standardized clinical screening scores (PHQ-9, GAD-7) could lead clinicians to conflate self-reported mood with diagnostic severity.
- **Effect on Timeline:** Zero impact.
- **Test Requirements:** Null handling for students who have never checked in.

#### Option C: Enhanced Clinical Timeline Filter Indicator (Status Quo with Enhanced Discoverability)
- **Description:** Retain daily check-ins exclusively inside `ClinicalTimelineView`, but add an indicator badge to the "Monitoring" pill showing the count of recent monitoring events, or a sub-filter specifically for "Daily Mood Check-ins".
- **Data Required:** Existing `getStudentClinicalTimeline` query.
- **Implementation Complexity:** Minimal.
- **Privacy Considerations:** Lowest surface area; counselors view daily check-ins only when intentionally inspecting monitoring telemetry.
- **Clinical Risk:** Lowest risk; maintains strict separation between clinical assessment instruments and informal telemetry.
- **Effect on Timeline:** Enhances existing timeline UI without altering data flow.
- **Test Requirements:** UI regression tests for timeline category counts.

#### Option D: Dedicated Longitudinal Mood Trend Visualization Component
- **Description:** Build a dedicated 14-day or 30-day discrete mood trend chart or calendar heatmap in PatientDetail showing daily check-in consistency and mood fluctuations over time.
- **Data Required:** Bounded 30-day daily check-in array.
- **Implementation Complexity:** High. Requires new chart/grid component, handling skipped days, leap years, and responsive layout.
- **Privacy Considerations:** High density of personal wellness habits exposed.
- **Clinical Risk:** Visual downward trends may cause alarm or premature clinical interventions without standardized screening evidence.
- **Effect on Timeline:** Zero impact.
- **Test Requirements:** Date boundary handling, missing date gap tests, mobile responsiveness.

---

### 9. Data Volume Analysis

- **Generation Rate:** Maximum 1 check-in per student per calendar day (enforced by `by_userId_and_dateStr`).
- **Volume Projections:**
  - 30 days: 30 records (~3 KB payload)
  - 1 academic year: ~250–365 records (~25–35 KB payload)
  - 4-year degree: ~1,000–1,460 records (~100–140 KB payload)
- **Backend Query Performance:**
  - Querying `dailyCheckins.withIndex("by_userId")` for a single student returns a maximum of a few hundred documents even after years of continuous usage.
  - However, loading unlimited lifetime check-ins into a client-side chart is unnecessary for clinical review.
  - **Lesson from Step 3A/3B:** The query must distinguish between:
    - *Aggregate metrics* (e.g., `totalCheckins` count), which must reflect true lifetime participation without arbitrary truncation.
    - *UI rendering datasets* (e.g., recent 14-day or 30-day daily check-ins), which should be bounded to a clinically meaningful window.

---

### 10. Required Product & Clinical Decisions

Before implementing Step 3D, the following decisions must be explicitly resolved by product and clinical stakeholders:

1. **Presentation Location:** Should daily check-ins have a dedicated visual presence on the main PatientDetail view (e.g., Option A or B), or should counselors access them solely through the Clinical Timeline (Option C)?
2. **Clinical Framing & Disclaimers:** What exact clinical terminology should label daily mood entries in the counselor interface (e.g., *"Patient Self-Reported Wellness Check-In — Non-Diagnostic"*)?
3. **Time Horizon for Review:** What lookback window is clinically appropriate for counselor inspection? (7 days, 14 days, 30 days, or full semester?)
4. **Policy on Sustained Low Mood Telemetry:** If a student logs low/sad/anxious moods for consecutive days, should this remain passive background telemetry, or should product policy define a non-emergency review recommendation? *(Note: Current policy strictly mandates that only standardized screening scores and explicit emergency triggers generate alerts.)*
5. **Future Caseload Policy:** Is an explicit counselor-patient assignment model planned for a future milestone, or does institution-wide counselor access remain the intended model?

---

### 11. Recommended Implementation Boundary

#### READY TO IMPLEMENT (Upon Stakeholder Approval):
- Backend query `api.insights.getCounselorStudentTelemetry` or leveraging `api.insights.getDailyStats` with counselor authorization to fetch bounded recent daily check-ins.
- Non-diagnostic presentation of daily check-ins in PatientDetail clearly distinguished from clinical assessments.
- Unit and integration tests covering counselor access and data separation.

#### BLOCKED BY PRODUCT/CLINICAL DECISION:
- Adding daily check-in widgets to the top Patient Header (Option B) pending decision on diagnostic conflation risk.
- Any automated alert or triage trigger derived from daily check-ins.
- Historical data retention or purge rules.

#### STRICTLY OUT OF SCOPE:
- Counselor caseload assignment architecture.
- Redesigning `ClinicalTimelineView` or `timeline.ts`.
- Clinical screening scoring or triage algorithms.
- Priority 8 (CBT interventions) and Priority 9 (multimedia therapy).

---

### 12. Test Matrix for Future Implementation

When implementation is authorized, the following test suite will be required:

| Test ID | Test Scenario | Expected Outcome |
|:---|:---|:---|
| `COUNSELOR-CHECKIN-01` | Counselor queries authorized student's daily check-ins | Returns student's check-ins with correct `dateStr` and `mood` |
| `COUNSELOR-CHECKIN-02` | Admin queries student's daily check-ins | Returns check-in data with administrative authorization |
| `COUNSELOR-CHECKIN-03` | Student attempts to query another student's check-ins | Throws `Unauthorized: Students can access ONLY their own clinical data` |
| `COUNSELOR-CHECKIN-04` | Unauthenticated caller queries check-ins | Throws `Unauthenticated: Login required` |
| `COUNSELOR-CHECKIN-05` | Student has check-ins under both `users._id` and `clerkId` | Queries resolve both identities and deduplicate by `dateStr` |
| `COUNSELOR-CHECKIN-06` | Daily check-ins span month/year and UTC midnight boundaries | Local `dateStr` is preserved without timezone shift |
| `COUNSELOR-CHECKIN-07` | Student has both `dailyCheckins` and `emotionLogs` | System clearly distinguishes daily mood from episodic emotion logs |
| `COUNSELOR-CHECKIN-08` | Student has 0 daily check-ins | Returns clean empty state without runtime error |
| `COUNSELOR-CHECKIN-09` | Daily check-in does not trigger clinical triage or alert | `triages` and `alerts` tables remain unmodified after check-in |
| `COUNSELOR-CHECKIN-10` | Timeline default view ("all") | Daily check-ins remain suppressed; visible only under "monitoring" |

---

### 13. Production Readiness Assessment

- **Current Architecture Health:** Excellent. Steps 3A, 3B, and 3C established clean boundaries between daily mood and episodic telemetry, corrected UI telemetry consumption, and normalized timezone semantics. All 195 repository tests are passing.
- **Readiness for Step 3D Implementation:** The backend is fully prepared to serve counselor-facing daily check-in queries securely. Implementation can proceed immediately once product/clinical stakeholders select the preferred UI presentation option (Section 8) and confirm the clinical framing decisions (Section 10).

---

### 14. Dependencies and Blockers

- **Blocker:** Stakeholder selection between Option A (Dedicated sub-panel), Option B (Header strip), Option C (Timeline enhancement), or Option D (Trend visualization).
- **Blocker:** Written clinical approval on labeling self-reported telemetry as non-diagnostic.
- **Dependency:** Preserving zero regression on existing 195 vitest tests and TypeScript zero-error build.

---

### Audit Conclusion
**NO CODE CHANGES WERE PERFORMED.**  
Priority 7 Phase 5 Step 3D is in AUDIT COMPLETE state. Awaiting stakeholder direction before implementation.
