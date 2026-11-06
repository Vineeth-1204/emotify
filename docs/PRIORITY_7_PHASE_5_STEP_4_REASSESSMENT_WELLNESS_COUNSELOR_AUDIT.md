# PRIORITY 7 — PHASE 5 — STEP 4: REASSESSMENT, WELLNESS LONGITUDINAL ARCHITECTURE, AND COUNSELOR LONGITUDINAL-REVIEW AUDIT

**Status:** AUDIT & DESIGN COMPLETE — ZERO CODE MODIFICATIONS  
**Date:** September 28, 2026  
**Auditor & System Architect:** Antigravity AI Pair Programmer  
**Current Repository Baseline:** 206 / 206 passing tests across 12 test suites, clean TypeScript, clean dashboard build.

---

## 1. Executive Summary

This audit constitutes **Priority 7 Phase 5 Step 4**, examining the remaining architecture for:
1. **Clinical Reassessment:** Baseline vs reassessment vs force-retest mechanics, cadence triggers, abandoned/incomplete attempts, follow-up scheduling, and reminder gaps.
2. **Wellness Longitudinal Architecture:** Boundaries between daily check-ins, episodic emotion logs, somatic body maps, CBT records, and specifically the generation, staleness, and clinical-inference risks of `wellnessProfiles`.
3. **Counselor Longitudinal Review:** What clinicians can currently inspect in the dashboard (`PatientDetail`, `ClinicalTimelineView`), how clinical data vs wellness telemetry vs derived analytics vs raw AI dialogue are separated, and the open policy risks surrounding historical risk representation.

### Key Audit Findings at a Glance:
- **Reassessment Storage is Production-Ready; Scheduling & Ingestion are Dead Code:** `screeningAttempts` authoritatively stores item responses, scores, triage results, and provenance with deterministic server-side `attemptType` classification (`baseline`, `reassessment`, `force_retest`). Incomplete and abandoned attempts are safely isolated from clinical history. However, `convex/followUps.ts:scheduleFollowUp` writes `dueDate` timestamps (2, 7, 14, 30 days) into `followUps` that **no background cron, notification queue, or UI screen ever monitors or consumes**. Furthermore, students have **no UI path** to initiate a voluntary reassessment once onboarding is complete.
- **`wellnessProfiles` Has Architectural & Diagnostic Flaws:** The `wellnessProfiles` table is generated statically via `convex/wellness.ts:updateProfile`, reads arbitrarily truncated (`.take(10)`) records, completely ignores authoritative `dailyCheckins` and `emotionMaps`, becomes immediately stale, and **improperly infers personality traits and wellness labels from clinical PHQ-9 and GAD-7 scores** (e.g. `PHQ-9 > 15 -> "Needs gentle support"`, `GAD-7 > 10 -> "Sensitive to stress"`).
- **Counselor Visibility Has Strong Core Segregation but Open Risk Display Gaps:** Following Steps 2B and 3D, counselors have immediate top-level visibility into **Active Safety Alerts** (`alerts.getPending`) and a dedicated non-diagnostic **Daily Wellness Check-ins** panel (past 14 days telemetry). Standardized clinical screening scores (PHQ-9, GAD-7, PQ-16) remain isolated in their own card. However, **historical severe clinical risk remains visually masked in the header banner**: if a student with past acute suicidality or psychosis subsequently scores "mild" or is unblocked via `force_retest`, the main header renders a green "MILD" badge, hiding historical severity from the initial glance.
- **Strict Domain Separation Exists in Backend and Timeline:** Clinical screening, clinical triage, safety alerts, non-diagnostic wellness check-ins, episodic emotions, and somatic body maps are stored in separate, specialized tables. The clinical timeline (`convex/timeline.ts`) strictly enforces category boundaries and completely excludes raw AI companion dialogue (`companionMessages`, `aiCompanionLogs`).

---

## 2. Files and Tables Audited

### Backend Source Modules
- [`convex/screening.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/screening.ts): Screening attempt submission, scoring, `attemptType` determination, historical retrieval, abandoned filtering.
- [`convex/triage.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/triage.ts): Clinical triage logic, `triggerScreeningTest`, `unblockPatient`, and alert creation.
- [`convex/followUps.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/followUps.ts): Follow-up creation, completion, and triage-based interval scheduling.
- [`convex/wellness.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/wellness.ts): `wellnessProfiles` generation and query logic.
- [`convex/insights.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/insights.ts): Telemetry queries (`getDailyStats`, `getCounselorStudentDailyCheckins`).
- [`convex/alerts.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/alerts.ts): Alert creation, pending retrieval, acknowledgment, and resolution.
- [`convex/timeline.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/timeline.ts): Longitudinal multi-table clinical aggregation and category filtering.
- [`convex/authz.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/authz.ts): Role authorization and student access assertions.
- [`convex/crons.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/crons.ts): Scheduled jobs.

### Client Applications
- [`dashboard/src/pages/PatientDetail.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/pages/PatientDetail.tsx): Counselor patient view (screenings, timeline, CBT, somatic, gamification, active alert banner, daily check-in panel).
- [`dashboard/src/components/ClinicalTimelineView.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/components/ClinicalTimelineView.tsx): Longitudinal timeline component.
- [`app/(auth)/screening.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/screening.tsx): Student screening submission flow and follow-up triggering.
- [`app/(auth)/(tabs)/_layout.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/(tabs)/_layout.tsx): Gating on screening completion and `force_retest` routing.
- [`app/(auth)/(tabs)/index.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/(tabs)/index.tsx): Student home dashboard and onboarding banners.
- [`app/(auth)/(tabs)/profile.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/(tabs)/profile.tsx): Student profile and wellness identity display.

### Database Tables Audited
`screeningAttempts`, `screenings` (legacy mirror), `triages`, `alerts`, `followUps`, `dailyCheckins`, `emotionLogs`, `emotionMaps`, `wellnessProfiles`, `microGoals`, `reframeLogs`, `jpmrLogs`, `cbtSessions`, `counsellorRequests`, `appointments`, `clinicalTimelines`, `companionMessages`, `aiCompanionLogs`.

---

## 3. Reassessment Architecture Audit

### A. What reassessment mechanisms currently exist?
1. **Server-Side Submission Engine:** `convex/screening.ts:submitScreeningAttempt` accepts validated item-level responses for PHQ-9, GAD-7, and PQ-16, computes authoritative scores, assigns clinical triage, checks longitudinal score deltas (`> 5 pts` escalation), writes an immutable `screeningAttempts` record, links `triageId`, and conditionally triggers safety alerts.
2. **Server-Side Classification:** `convex/screening.ts` automatically assigns `attemptType`:
   - `"force_retest"`: If the student's latest prior triage was `"force_retest"`.
   - `"reassessment"`: If the student has at least one prior completed screening attempt.
   - `"baseline"`: If this is the student's first completed screening attempt.
3. **Staff Triggers:**
   - `convex/triage.ts:triggerScreeningTest({ userId })`: Inserts a triage row with `level: "force_retest"`.
   - `convex/triage.ts:unblockPatient({ userId, action: "force_retest" })`: Inserts a triage row with `level: "force_retest"`, resolves pending alerts, and logs an audit record.
4. **Student App Gating:**
   - In `app/(auth)/(tabs)/_layout.tsx`, if `latestTriage?.level === "force_retest"`, the student is automatically navigated to `/(auth)/screening` and blocked from accessing regular tabs until the screening is completed.

### B. Which are baseline vs reassessment vs force_retest?
- **Baseline:** The initial screening completed during onboarding (`attemptType: "baseline"`). Sets `users.screeningComplete: true`.
- **Reassessment:** Any subsequent completed screening attempt submitted under normal conditions (`attemptType: "reassessment"`).
- **Force Retest:** An administrative override triggered by a counselor or admin (`attemptType: "force_retest"`). Replaces a blocked/severe state or requires a mandatory re-test before app navigation is restored.

### C. Is student-initiated reassessment possible?
- **Backend:** YES. `api.screening.submitScreeningAttempt` accepts submissions from any authenticated student for their own identity at any time.
- **User Interface:** **NO.** Once a student completes baseline screening, `isScreeningComplete` becomes `true`. The onboarding card in `app/(auth)/(tabs)/index.tsx` is permanently replaced by the Wellbeing Companion. There is **no button, link, or menu item** anywhere in the student mobile application (home, profile, settings, or tools) that allows a student to voluntarily initiate a re-screening.

### D. Is counselor-initiated reassessment possible?
- **YES.** In `dashboard/src/pages/PatientDetail.tsx`, a counselor can click:
  1. `"Request Screening Test"` -> calls `api.triage.triggerScreeningTest({ userId })`.
  2. `"Unblock Patient"` -> select `"Force Re-Screening"` -> calls `api.triage.unblockPatient({ userId, action: "force_retest" })`.
  Both set `triages.level = "force_retest"`, causing the mobile app to block tabs and force the student to complete a new screening.

### E. Is automated reassessment scheduled?
- **NO.** There are **no scheduled Convex cron jobs, no background workflows, and no automated timers** that transition a student into a reassessment state or notify them that a reassessment is due.
- `convex/crons.ts` contains only a single daily cleanup job: `clearExpiredSessions`.

### F. Are the existing 2/7/14/30-day follow-up dates actually consumed anywhere?
- **NO. They are completely unconsumed.**
  - When a screening is submitted in `app/(auth)/screening.tsx`, it calls `api.followUps.scheduleFollowUp({ userId, level })`.
  - `convex/followUps.ts:scheduleFollowUp` calculates:
    - Mild: `dueDate = now + 30 days`
    - Moderate: `dueDate = now + 7 days`
    - Severe / Suicide / Psychosis: `dueDate = now + 2 days`
    - Default: `dueDate = now + 14 days`
  - It inserts a row into `followUps` with `type: "screening_review"`.
  - **No cron job reads `followUps`.**
  - **No push notification evaluates `followUps.dueDate`.**
  - **The counselor dashboard (`PatientDetail.tsx`, `Sessions.tsx`) never queries `followUps`.**
  - The only places `followUps` appears are in `convex/followUps.ts:getPending` (unused by any UI) and `convex/timeline.ts` (as a historical timeline event under category `"counseling"`).

### G. Are there any notification or reminder paths?
- **None for reassessment.** There is no push notification service, SMS trigger, email dispatch, or in-app reminder modal configured for upcoming or overdue reassessments.

### H. Can an incomplete or abandoned attempt interfere with the latest completed screening?
- **NO.** In Priority 7 Phase 4, `convex/screening.ts:getLatest` and `getLatestAttempt` were hardened to strictly filter:
  `.filter((q) => q.eq(q.field("status"), "completed"))`.
- Incomplete (`"in_progress"`) and abandoned (`"abandoned"`) records in `screeningAttempts` are completely ignored by `getLatest`, `getAll`, `insights.ts:getDailyStats`, and the clinical timeline. They can only be retrieved via `getLatestRawAttempt` for potential draft resume inspection.

### I. Is reassessment history preserved correctly?
- **YES.** `screeningAttempts` is an append-only store. Each new attempt is assigned an immutable document ID, UTC completion timestamp, instrument version maps, and validated scores. Calling `api.screening.getAll` returns all completed attempts sorted in descending chronological order.

### J. Are reassessment attempts connected to triage, alerts, and provenance correctly?
- **YES for screening attempts, triages, and alerts:**
  - `screeningAttempts.triageId` points to the generated `triages` row.
  - `triages.attemptId` is patched with the generated `screeningAttempts` ID (bidirectional link).
  - Any generated alert carries both `alerts.attemptId` and `alerts.triageId`.
- **GAP for follow-ups:**
  - `followUps.scheduleFollowUp` does **not** accept or record `attemptId` or `triageId`. Rows written by `scheduleFollowUp` have `attemptId: undefined` and `triageId: undefined`.

### K. What parts are production-ready?
1. Authoritative scoring of PHQ-9, GAD-7, and PQ-16 (`clinicalScoring.ts`).
2. Server-side validation and storage of item-level responses in `screeningAttempts`.
3. Deterministic classification of `attemptType` (`baseline`, `reassessment`, `force_retest`).
4. Isolation of abandoned/in-progress attempts from clinical queries.
5. Bidirectional provenance between `screeningAttempts` and `triages`.
6. Counselor manual trigger (`triggerScreeningTest`) and mobile app gating on `force_retest`.

### L. What parts require clinical policy approval before implementation?
1. **Reassessment Cadence:** Does clinical policy mandate fixed intervals (e.g. 14 days for moderate, 30 days for mild, 2 days for severe), or should reassessment be strictly counselor-ordered?
2. **Voluntary Student Reassessment:** Should students be allowed to self-trigger a reassessment anytime, or should there be a minimum cooldown (e.g. 7 or 14 days) to prevent assessment fatigue and statistical noise?
3. **Automated Escalation via Reassessment:** If a reassessment score escalates by >5 points or triggers suicide item 9, should it automatically generate an active safety alert (as currently coded) or initiate automated triage reassignment?
4. **App Access Gating During Routine Reassessment:** Should routine scheduled reassessments block app access (like `force_retest`), or should they act as non-blocking soft reminders?

---

## 4. Wellness Longitudinal Architecture Audit

### Domain Boundaries and Responsibilities
The system maintains five distinct longitudinal data domains:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      AUTHORITATIVE CLINICAL DOMAIN                     │
│  - screeningAttempts : Validated PHQ-9 / GAD-7 / PQ-16 scores           │
│  - triages           : Institutional clinical care level assignments   │
│  - alerts            : Operational safety incident lifecycle           │
└────────────────────────────────────────────────────────────────────────┘
                               ▲
                       DO NOT MERGE OR INFER
                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   NON-DIAGNOSTIC WELLNESS TELEMETRY                    │
│  - dailyCheckins     : Student local-calendar self-reported mood token  │
│  - emotionLogs       : Episodic, situational emotional events          │
│  - emotionMaps       : Somatic body regions and sensation intensities  │
└────────────────────────────────────────────────────────────────────────┘
                               ▲
                       DO NOT CONFUSE WITH
                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   THERAPEUTIC INTERVENTION DOMAIN                      │
│  - cbtSessions       : Structured cognitive restructuring sessions     │
│  - reframeLogs       : Cognitive reframe logs with belief deltas       │
│  - jpmrLogs          : Somatic relaxation sessions with tension deltas │
│  - microGoals        : Behavioral activation habits and goals          │
└────────────────────────────────────────────────────────────────────────┘
```

### Deep Dive: `wellnessProfiles` Audit
`convex/wellness.ts` defines `getProfile` and `updateProfile`.

1. **How it is generated:**
   - Generated exclusively on-demand when a client invokes `api.wellness.updateProfile({ userId, timezoneOffsetMinutes })`.
   - Called in two places in the mobile app:
     - `app/(auth)/(tabs)/index.tsx:307` (in a `useEffect` on tab mount)
     - `app/(auth)/(tabs)/profile.tsx:207` (in an export / refresh handler)
   - It is never generated or updated by backend mutations or crons.
2. **Source tables read during generation:**
   - Reads top 5 `screeningAttempts` (filters `completed`, falls back to legacy `screenings`).
   - Reads top 10 `emotionLogs`.
   - Reads top 10 `microGoals`.
   - Reads top 10 `jpmrLogs`.
   - **Critical Omissions:**
     - Completely ignores `dailyCheckins` (authoritative daily mood).
     - Completely ignores `emotionMaps` (somatic tracking).
     - Completely ignores `cbtSessions` and `reframeLogs`.
3. **Time window used:**
   - **No time window is applied.** It performs `.take(10)` or `.take(5)` on `by_userId` ordered descending. If a student has not logged an emotion in 8 months, it evaluates 8-month-old logs as their current "mood pattern".
4. **Staleness:**
   - It writes a static row into `wellnessProfiles`. It remains completely frozen and stale until the student happens to mount `index.tsx` or `profile.tsx` with network connectivity.
5. **Clinical Inference Risks (CRITICAL DEFECT):**
   - Lines 97–104 of `convex/wellness.ts` directly use standardized clinical assessment scores to assign informal personality traits and wellness labels:
     - `GAD-7 > 10` -> adds personality trait `"Sensitive to stress"`
     - `PHQ-9 > 15` -> adds personality trait `"Needs gentle support"`
     - `PHQ-9 > 10` -> adds wellness goal `"Gentle recovery"`
     - `PHQ-9 > 5`  -> adds wellness goal `"Improve mood"`
     - `GAD-7 > 5`  -> adds wellness goal `"Build daily habits"`
   - **Clinical Policy Issue:** Standardized depression and anxiety screening instruments (PHQ-9 and GAD-7) measure state symptom severity over the preceding 2-week period. They must **never** be used to label a patient's enduring "personality traits" or assign subjective personality archetypes.
6. **Active UI Dependencies:**
   - Mobile app: `app/(auth)/(tabs)/profile.tsx:291-330` renders a "Wellness Identity" card showing `personality_traits`, `mood_pattern`, `energy_pattern`, and `wellness_goals`.
   - Dashboard: **ZERO.** The counselor dashboard does not query or display `wellnessProfiles`.
7. **Architectural Recommendation:**
   - `wellnessProfiles` should **not** be expanded.
   - Clinical inferences (PHQ-9 / GAD-7 -> personality trait) must be removed.
   - Long-term, if a wellness summary is desired for students, it should be computed dynamically from non-diagnostic telemetry (`dailyCheckins`, `microGoals`, `jpmrLogs`) over a bounded window (e.g. past 14 or 30 days) rather than stored as a stale row.

---

## 5. Counselor Longitudinal Review Audit

### What a Counselor Can Currently Inspect Across Time

| Patient Dimension | Counselor Visibility in `PatientDetail.tsx` | Data Freshness & Source Table | Visual Separation / Framing |
|---|---|---|---|
| **Current Clinical State** | Latest triage level badge (`mild`, `moderate`, `severe`, `suicide_flag`, `psychosis_flag`), top clinical score banner | Real-time (`triages.getLatestByUserId`, `screening.getAll`) | Clinical banner at top. Displays PHQ-9, GAD-7, and PQ-16 scores. |
| **Historical Clinical Assessments** | Historical chart (Area chart of PHQ-9, GAD-7, PQ-16) and tabular history list | Real-time (`screening.getAll` reading `screeningAttempts`) | Dedicated "Historical Screening Tests" table with scores and Item 9 suicide flags. |
| **Historical Triage** | In Tab 2 ("Clinical Timeline") under "Triage" category | Real-time (`timeline.getStudentClinicalTimeline`) | Displays historical triage decisions with timestamps and severity badges. |
| **Active Safety Alerts** | Top red banner above patient profile with item-level provenance and Acknowledge button | Real-time (`alerts.getPending`) | Operational banner (Step 2B), clearly separated from clinical triage badge. |
| **Resolved Alerts** | In Tab 2 ("Clinical Timeline") under "Safety" category | Real-time (`timeline.getStudentClinicalTimeline`) | Shows resolved alerts with original trigger type, resolution status, and timestamps. |
| **Daily Wellness Telemetry** | Dedicated "Daily Wellness Check-ins" panel beneath screening tests | Real-time (`insights.getCounselorStudentDailyCheckins`) | Clearly framed as "Student-reported wellness telemetry — non-diagnostic (Past 14 days)". Neutral pill badges. |
| **Episodic Emotions** | In Tab 2 ("Clinical Timeline") under "Monitoring" filter only | Real-time (`timeline.getStudentClinicalTimeline`) | Suppressed from default timeline view to prevent alert fatigue. |
| **Somatic Body Maps** | In Tab "Somatic" (body regions, sensations, intensities) and Timeline Monitoring | Real-time (`dashboard.getPatientCbtAnalytics`, `timeline.ts`) | Shows body regions, average intensity (1–10), and suggested actions. |
| **CBT Interventions** | In Tab "CBT": session count, tension reduction, thinking traps frequency, goal activation rate | Real-time (`dashboard.getPatientCbtAnalytics`) | Aggregated analytics with structured session history table and transcript modal. |
| **JPMR Interventions** | In Tab "Somatic": relaxation sessions table with pre/post intensity and duration | Real-time (`dashboard.getPatientCbtAnalytics`) | Shows pre/post tension scores and relaxation duration. |
| **Micro-Goals & Activation** | In Tab "CBT": 14-day goal completion chart, top completed categories, frequently skipped goals | Real-time (`dashboard.getPatientCbtAnalytics`) | Displays behavioral activation metrics. |
| **Follow-Ups** | **NOT VISIBLE** in `PatientDetail.tsx`. Only visible as raw timeline events in Tab 2. | Real-time (`timeline.ts`) | No dedicated follow-up review interface exists in dashboard. |
| **Appointments** | In global `Sessions.tsx` page and `ClinicalTimelineView` | Real-time (`appointments` queries) | Not listed directly in `PatientDetail.tsx` profile tabs. |
| **Raw AI Companion Dialogue** | **STRICTLY EXCLUDED.** | N/A (`TIMELINE-16`) | Raw chat messages are hidden. Only structured CBT reframing dialogues are visible in the transcript modal. |

### Separation of the Four Information Classes:
1. **Authoritative Clinical Data:** Screenings, triages, and safety alerts are clearly framed with formal score thresholds and clinical tags.
2. **Non-Diagnostic Wellness Telemetry:** Daily check-ins, emotion logs, and somatic body maps are tagged with `TELEMETRY` badges and soft pastel tones, explicitly disclaiming diagnostic intent.
3. **Derived Analytics:** CBT recovery trends, thinking trap distributions, and micro-goal completion rates are labeled as behavioral activation summaries.
4. **Raw AI Dialogue:** Completely protected and excluded from counselor view.

---

## 6. Current vs Historical Risk Audit

### Status Following Step 2B
- **What Counselor Sees for Current Risk:**
  - The patient header badge renders `{latestTriage?.level}` (e.g. `mild`, `moderate`, `severe`, `suicide_flag`, `psychosis_flag`).
  - Colors are: Red for severe/suicide/psychosis, Orange for moderate, Green for mild.
- **What Historical Risk Remains Visible:**
  - Visible in the "Historical Screening Tests" table below the fold.
  - Visible in the "Clinical Timeline" tab under "Screening" or "Safety".
  - **NOT visible in the primary patient header.**
- **How Active Alerts are Represented:**
  - Prominent red banner directly above the patient header bar (implemented in Step 2B).
  - Displays alert count, type (`suicide`, `psychosis`, etc.), creation time, and provenance IDs.
  - Includes an inline `"Acknowledge Alert"` button.
- **Whether Resolved Alerts Remain Discoverable:**
  - Yes, but **only** by navigating to Tab 2 ("Clinical Timeline") and filtering for Safety events. Resolved alerts do not appear in the top banner or header card.
- **Can a Previous Severe / Suicide / Psychosis Flag be Hidden by a Later Mild Assessment?**
  - **YES (THE CRITICAL VISIBILITY DEFECT):**
    - If Patient X had `PHQ-9 Item 9 = 3` and `suicide_flag` triage on Day 1, and on Day 14 completes a reassessment scoring `PHQ-9 = 2`, `latestTriage?.level` becomes `"mild"`.
    - The top header card renders a calming green border and a green `"MILD"` badge.
    - A clinician opening Patient X's record receives zero immediate visual indication that Patient X experienced acute suicidality two weeks prior.
- **Force Retest / Unblock Policy Concerns:**
  - When a counselor clicks `"Unblock Patient"` -> `"Switch to Mild"` or `"Switch to Moderate"`, `unblockPatient` inserts a new row in `triages` with `level: "mild"` or `"moderate"` and resolves all pending alerts.
  - This immediately flips the header badge to green or orange and removes the alert banner, effectively clearing the patient's visible crisis status without requiring a confirmatory reassessment.
  - If `"Force Re-Screening"` is selected, the patient is locked into `force_retest` until they complete a new screening. Once completed, the new score immediately dictates the header badge color.

### Explicit Semantic Definitions

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CURRENT ASSESSMENT                              │
│  Derived strictly from the SINGLE MOST RECENT completed screening      │
│  attempt. Represents current symptom self-report.                      │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                     HISTORICAL CLINICAL RISK                           │
│  The lifetime or epoch-peak risk documented for the patient.           │
│  (e.g. Any historical suicideFlag: true or severe score).              │
│  Enduring clinical vulnerability that never silently resets to zero.   │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                       ACTIVE SAFETY STATUS                             │
│  Open, unacknowledged or pending operational crisis incidents          │
│  requiring immediate clinician attention (alerts.status === "pending"). │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                   HISTORICAL / RESOLVED SAFETY EVENTS                  │
│  Closed safety incidents that were clinically reviewed, acknowledged,   │
│  and resolved (alerts.status === "resolved"). Preserved in audit trail. │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Provenance Audit

| Relationship | Type in Schema | Storage Mechanism | Status | Provenance Gap / Risk |
|---|---|---|---|---|
| `screeningAttempts` <-> `triages` | Bidirectional foreign-key IDs | `attempt.triageId` + `triage.attemptId` | **VERIFIED** | None. Fully linked in `submitScreeningAttempt`. |
| `screeningAttempts` -> `alerts` | Explicit foreign-key ID | `alert.attemptId` | **VERIFIED** | Populated whenever alert is triggered by screening. |
| `triages` -> `alerts` | Explicit foreign-key ID | `alert.triageId` | **VERIFIED** | Populated whenever alert is triggered by triage. |
| `screeningAttempts` -> `followUps` | Optional foreign-key ID in schema | Not written | **MISSING** | `scheduleFollowUp` does not accept or write `attemptId`. |
| `triages` -> `followUps` | Optional foreign-key ID in schema | Not written | **MISSING** | `scheduleFollowUp` does not accept or write `triageId`. |
| `screeningAttempts` -> `appointments` | Optional foreign-key ID in schema | Not written | **INFERRED** | Booked appointments rarely link to originating screening. |
| `screeningAttempts` -> `cbtSessions` | Optional foreign-key ID in schema | Not written | **INFERRED** | CBT sessions triggered by screening do not store `attemptId`. |
| `screeningAttempts` -> `jpmrLogs` | Optional foreign-key ID in schema | Not written | **INFERRED** | Grounding JPMR sessions do not store `attemptId`. |
| `screeningAttempts` -> `reframeLogs` | Optional foreign-key ID in schema | Not written | **INFERRED** | Reframe exercises do not store `attemptId`. |
| `cbtSessions` -> `microGoals` | Explicit string ID | `microGoal.cbtSessionId` | **VERIFIED** | Micro-goals created in CBT sessions store session ID. |
| Independent Alert (Manual SOS) | No causal screening attempt | `attemptId: undefined` | **VERIFIED** | Correctly avoids fabricated provenance (`PROV-07`). |

---

## 8. Authorization and Privacy Audit

### Evaluation Across User Roles

1. **Student Isolation:**
   - Evaluated by `assertCanAccessStudent(ctx, targetUserId)` across all endpoints in `screening.ts`, `triage.ts`, `alerts.ts`, `insights.ts`, and `timeline.ts`.
   - Students can only query records where `targetUserId` matches their authenticated `_id` or `clerkId`.
   - Cross-student data requests are rejected with `Unauthorized: Students can access ONLY their own clinical data.` (Verified by `AUTH-01`, `TIMELINE-04`, `COUNSELOR-CHECKIN-03`).
2. **Counselor & Admin Authorization:**
   - Evaluated by `requireCounselorOrAdmin(ctx)` in administrative endpoints (`unblockPatient`, `triggerScreeningTest`, `getCounselorStudentDailyCheckins`).
   - Rejects unauthenticated callers with `UNAUTHORIZED` and student callers with `FORBIDDEN` / `Unauthorized: Counselor or Admin access required.`
3. **Telemetry Endpoints:**
   - `api.insights.getCounselorStudentDailyCheckins` strictly enforces `requireCounselorOrAdmin(ctx)` AND `assertCanAccessStudent(ctx, targetUserId)`.
   - `api.insights.getDailyStats` is restricted to student self-access.
4. **Raw AI Dialogue Privacy:**
   - `companionMessages` and `aiCompanionLogs` are completely inaccessible to counselors in the dashboard.
   - The clinical timeline explicitly excludes these tables (`TIMELINE-16`).
   - Counselors only have access to structured CBT thought-record transcripts explicitly saved in `cbtSessions`.

---

## 9. Data Integrity and Performance Audit

1. **Compound Index Gaps:**
   - `screeningAttempts`: Indexed by `by_userId`. Lacks compound index `by_userId_and_status`. Queries filtering for `status === "completed"` must scan all user attempts.
   - `alerts`: Indexed by `by_userId` and `by_status` separately. Lacks compound index `by_userId_and_status`. `getPending` queries all user alerts and filters in memory.
   - `followUps`: Indexed by `by_userId`. Lacks compound index `by_userId_and_completed`.
2. **Unbounded Queries vs Bounded Windows:**
   - `screening.getAll`: Unbounded `.collect()` across all user screening attempts. Acceptable for clinical audit history, but should be monitored if users generate hundreds of attempts.
   - `insights.getCounselorStudentDailyCheckins`: Correctly bounded (defaults to 14 days, capped at 90 days).
   - `timeline.getStudentClinicalTimeline`: Scans 16 tables across all user IDs in memory. While deduplicated and filtered, high-volume telemetry tables (`emotionLogs`, `dailyCheckins`, `emotionMaps`) are only queried when `categoryFilter === "monitoring"` (implemented in Priority 4 Step 5B to prevent query explosion).
3. **Stale Derived Data:**
   - `wellnessProfiles` is a static derived row that becomes stale immediately after creation.
4. **Timezone & Date Boundaries:**
   - `dailyCheckins.dateStr` is client-local (`YYYY-MM-DD`), verified across UTC midnight boundaries in Step 3C and Step 3D.
   - `wellnessProfiles.energy_pattern` attempts to guess morning vs evening activity from UTC timestamps unless client offset is provided.

---

## 10. Production Readiness Matrix

| Functional Area | Current Implementation State | Production Ready? | Readiness Classification | Detailed Justification & Gaps |
|---|---|---|---|---|
| **Daily Check-ins (Backend & Storage)** | Normalized in `dailyCheckins`, deduplicated by local `dateStr`, dual identity resolution | **YES** | **READY** | Step 3A & 3C complete. Fully tested across timezones. |
| **Student Daily Check-in UI** | Interactive mood pills in Student Insights and Home | **YES** | **READY** | Step 3B complete. Clean telemetry rendering. |
| **Counselor Daily Check-in Visibility** | Dedicated panel in `PatientDetail.tsx`, 14-day window, non-diagnostic | **YES** | **READY** | Step 3D complete. Clean empty states, zero clinical inference. |
| **Episodic Emotion Logs** | Stored in `emotionLogs`, separated from daily check-ins | **YES** | **READY** | Domain separation verified (`INSIGHT-3A-08`). |
| **Somatic Body Maps** | Stored in `emotionMaps`, 1–10 validation, timeline monitoring filter | **YES** | **READY** | Integrated into timeline and PatientDetail Somatic tab. |
| **Wellness Profile (`wellnessProfiles`)** | Static row, infers personality traits from PHQ/GAD scores, stale | **NO** | **BLOCKED** | Diagnostic inference defect; omits check-ins; stale. Needs redesign. |
| **Baseline Clinical Screening** | Authoritative scoring (PHQ-9, GAD-7, PQ-16), storage in `screeningAttempts` | **YES** | **READY** | Rigorous server-side scoring, validation, and attempt logging. |
| **Reassessment Storage & History** | Append-only in `screeningAttempts`, `attemptType` server-assigned | **YES** | **READY** | Preserves all historical attempts non-destructively. |
| **Reassessment Scheduling & Crons** | `followUps.scheduleFollowUp` writes `dueDate`, but no cron or queue consumes it | **NO** | **PARTIAL / DORMANT** | Dead code. Follow-up due dates are ignored by system. |
| **Student-Initiated Reassessment** | Mutation exists; zero UI entry points or navigation links in student app | **NO** | **BLOCKED** | Blocked on product policy (cooldown rules, UI placement). |
| **Counselor Force Retest** | `triggerScreeningTest` & `unblockPatient`, app gating on `force_retest` | **YES** | **READY** | Administrative overrides function and block mobile tabs cleanly. |
| **Triage History & Provenance** | Immutable `triages` rows, bidirectional links to `screeningAttempts` | **YES** | **READY** | Provenance verified (`PROV-01` to `PROV-07`). |
| **Active Safety Alerts Visibility** | Prominent red banner in `PatientDetail.tsx` with Acknowledge action | **YES** | **READY** | Step 2B complete. Real-time alert surfacing verified. |
| **Historical Risk Visibility (Header)** | Header badge reflects strictly latest triage; masks past severe episodes | **NO** | **BLOCKED** | Step 2C blocked on clinical policy (dual indicator vs badge design). |
| **Counselor Longitudinal Review** | `ClinicalTimelineView` + PatientDetail tabs (Screenings, CBT, Somatic) | **YES** | **READY** | Complete timeline aggregation across 16 tables with category filters. |
| **Intervention Tracking** | Structured `cbtSessions`, `jpmrLogs`, `reframeLogs`, `microGoals` | **YES** | **READY** | Detailed metrics, pre/post tension scores, goal completion rates. |
| **Raw AI Companion Privacy** | Companion chat messages strictly excluded from timeline & counselor view | **YES** | **READY** | Verified by `TIMELINE-16` and access gates. |
| **Role Authorization** | `assertCanAccessStudent` and `requireCounselorOrAdmin` across all endpoints | **YES** | **READY** | Verified across all test suites (unauthenticated, student, counselor, admin). |

---

## 11. Clinical and Product Dependencies

The following issues **cannot safely be resolved by engineering alone** and require formal institutional or clinical policy decisions:

1. **Historical Risk Representation in Counselor Header (Step 2C Dependency):**
   - *Question:* When a student with historical severe suicidality or psychosis scores "mild" on a subsequent reassessment, how should their header be displayed?
   - *Options:*
     - A: Dual badge: `Current: MILD` alongside `Historical: HIGH RISK (Past Suicidality)`.
     - B: Persistent warning banner: Header displays `Current: MILD`, with an amber banner noting "Patient has prior high-risk clinical events on record".
     - C: Split header: Left side shows Current Assessment; right side shows Lifetime Peak Severity.
2. **Risk Decay / Resolution Semantics:**
   - *Question:* Does historical severe risk ever "decay" or expire after a prolonged period of clinical stability (e.g. 6 months or 1 year of mild screenings), or is it permanent for the duration of the student's institutional record?
3. **Reassessment Cadence and Prompts:**
   - *Question:* Should the system enforce an automated reassessment cadence?
     - Severe / Suicide: Every 2 days?
     - Moderate: Every 7 or 14 days?
     - Mild: Every 30 or 60 days?
   - *Question:* Should an automated prompt be a soft in-app reminder card or a hard navigation block?
4. **Voluntary Student Reassessment Policy:**
   - *Question:* Should students be permitted to re-take the clinical screening at will?
   - If yes, what is the minimum required cooldown between attempts (e.g. 7 days or 14 days) to prevent test over-administration?
5. **Persistent Low Mood -> Reassessment Trigger:**
   - *Question:* If a student logs consecutive days of "low" or "sad" in `dailyCheckins` (e.g. 7 consecutive days), should the app prompt them to take a formal PHQ-9 reassessment?
   - *Boundary:* The prompt must remain an invitation; daily mood must never automatically alter clinical score or triage level.
6. **Wellness Profile Remediation:**
   - *Question:* Should the `wellnessProfiles` table be deprecated and removed, or refactored into a purely non-diagnostic student self-reflection tool with all clinical PHQ/GAD inferences stripped?

---

## 12. Recommended Implementation Sequence

Following the completion of this Step 4 Audit, the remaining work should be sequenced into focused, low-risk substeps:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 5A: Follow-Up Provenance & Dead Code Cleanup                       │
│ - Pass attemptId & triageId into followUps.scheduleFollowUp             │
│ - Connect follow-up records causally to originating screening attempt   │
│ - Safe to implement immediately (Zero clinical policy dependency)       │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 5B: Wellness Profile De-biasing & Remediation                      │
│ - Remove PHQ-9 & GAD-7 clinical score inferences from wellnessProfiles │
│ - Decouple clinical assessment from personality trait generation        │
│ - Safe to implement immediately (Protects clinical validity)            │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 5C: Student Voluntary Reassessment UI & Cooldown Gate              │
│ - Add "Retake Screening" entry point in Student Profile                 │
│ - Enforce cooldown gate (e.g. 14 days since last completed attempt)     │
│ - Requires Product approval on cooldown window                          │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 5D: Dual Indicator / Historical Risk Representation (Step 2C)      │
│ - Implement agreed Dual Indicator (Current Assessment + Lifetime Peak)  │
│ - Requires Clinical Policy approval on visual design and wording        │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 5E: Automated Follow-Up & Reassessment Scheduling Engine           │
│ - Implement background cron or polling trigger for due follow-ups       │
│ - In-app reminder notification cards for pending reassessments          │
│ - Requires Clinical Policy approval on cadence intervals                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Test Gaps

Prior to implementing any subsequent steps, the following test gaps should be noted for future coverage:
1. **Follow-up Provenance:** Verify that `followUps` records carry causal `attemptId` and `triageId`.
2. **Reassessment Cooldown Gate:** Verify that a student cannot submit more than one voluntary screening attempt within the approved cooldown window.
3. **Dual Indicator Query:** Verify that a student with an older severe screening and a newer mild screening returns both `currentLevel: "mild"` and `historicalPeak: "severe"` / `hasPastSuicideFlag: true`.
4. **Wellness Profile Clinical Decoupling:** Verify that `updateProfile` generates personality traits without reading PHQ-9 or GAD-7 scores.

---

## 14. Explicit Scope Exclusions

In accordance with strict project constraints, the following were **NOT** performed and remain forbidden until authorized:
- Did NOT implement Step 2C (Dual Indicator / Historical Risk).
- Did NOT modify `convex/screening.ts`, `triage.ts`, or `wellness.ts`.
- Did NOT modify `dashboard/src/pages/PatientDetail.tsx`.
- Did NOT add counselor caseload architecture.
- Did NOT modify clinical scoring formulas or triage level rules.
- Did NOT activate automated cron schedules for reassessments.
- Did NOT begin Priority 8 or Priority 9.

---

## 15. Final Readiness Assessment

- **Priority 7 Phase 5 Step 4 Audit is COMPLETE.**
- The system architecture for reassessment storage, role authorization, active alert visibility, non-diagnostic telemetry separation, and counselor longitudinal timeline review is solid, robust, and verified with 206 passing tests.
- Reassessment scheduling, voluntary student re-screening, wellness profile clinical inferences, and historical risk representation in the header represent the final remaining items of Priority 7, clearly mapped with explicit clinical and product policy dependencies.

**STOPPING POINT REACHED — AUDIT ONLY. DO NOT IMPLEMENT CODE OR BEGIN NEXT STEP.**
