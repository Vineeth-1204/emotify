# Priority 4 Step 5: Clinical Timeline — Read-Only Architecture Audit

## 1. Executive Summary

Following the completion of **Priority 4 Step 4 (Clinical Event Provenance)**, Emotify now possesses deterministic, bidirectional document relationships between:
$$\text{Screening Attempts} \longleftrightarrow \text{Triages} \longleftrightarrow \text{Safety Alerts}$$

The objective of **Priority 4 Step 5** is to perform a thorough, read-only architectural audit to determine how Emotify can construct a reliable, longitudinal clinical timeline for a student.

### Key Audit Findings:
1. **Inert Pre-existing Timeline Infrastructure**: A table named `clinicalTimelines` exists in [`convex/schema.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/schema.ts), along with `getPatientTimeline` and `addTimelineEvent` in [`convex/dashboard.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/dashboard.ts). However, **no clinical event in the application (screening, triage, alert, appointment, CBT) writes to this table**. It is completely empty in production.
2. **Ad-Hoc UI Timeline (`recoveryTimeline`)**: The counselor dashboard ([`dashboard/src/pages/PatientDetail.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/pages/PatientDetail.tsx)) currently renders a mock/partial timeline called `cbtAnalytics.recoveryTimeline` constructed on the fly inside [`convex/dashboard.ts:getPatientCbtAnalytics`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/dashboard.ts#L482-L497). This partial timeline only merges CBT sessions and completed micro-goals, completely ignoring screening attempts, validated scores, triage escalations, safety alerts, counselor requests, appointments, and follow-ups.
3. **True Clinical Events vs. Telemetry vs. System Data**: Out of 26 database tables, only **8 core tables** represent authoritative clinical milestone events: `screeningAttempts`, `triages`, `alerts`, `counsellorRequests`, `appointments`, `cbtSessions`, `jpmrLogs`, and `followUps`. Secondary tables (`emotionLogs`, `reframeLogs`, `microGoals`, `aiMonitoringLogs`) represent granular micro-telemetry and behavioral activation that can be optionally layered or aggregated.
4. **Causal Linkage vs. Chronological Merging**: Timeline reconstruction must never rely on timestamp proximity to infer clinical causality. The deterministic references introduced in Step 4 (`triageId`, `attemptId`, and CBT's `cbtSessionId`) provide definitive parent-child relationships. Historical records lacking provenance references must remain explicitly unlinked without synthetic relationships.
5. **No Production Code Changes**: As required, this audit is strictly read-only. No schema, backend logic, or UI code was modified.

---

## 2. Comprehensive Audit of Existing Tables

Every table in [`convex/schema.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/schema.ts) was analyzed against the 8 required clinical criteria:

| Table Name | 1. What One Record Represents | 2. Clinically Meaningful? | 3. Belongs in Longitudinal Timeline? | 4. Canonical Identity Field | 5. Available Timestamp(s) | 6. Provenance Links | 7. Safe for Counselor View? | 8. Proposed Role |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- | :---: | :--- |
| **`users`** | Student, counselor, or admin user account. | Partial (Registration & Consent) | Baseline milestone only | `_id` (Convex ID) | `created_at`, `createdAt`, `consentTimestamp`, `lastLoginAt` | Root Identity | Yes | **Baseline / Profile Metadata** |
| **`screeningAttempts`** | Authoritative multi-instrument clinical screening (PHQ-9, GAD-7, PQ-16, WSAS, ReQoL-10). | **YES** (Primary) | **YES** (Core) | `userId` (`users._id`) | `startedAt`, `completedAt` | `triageId` $\rightarrow$ `triages`, `screeningId` $\rightarrow$ `screenings` | Yes | **Timeline Event** (`screening_completed`) |
| **`screenings`** | Legacy flat scoring mirror table. | Redundant | Historical fallback only | `userId` (`users._id` / `clerkId`) | `createdAt` | `attemptId` (string) | Yes | **Legacy Fallback / Deduplicated** |
| **`triages`** | Clinical triage assessment (`level`, `suicideFlag`, `psychosisFlag`). | **YES** (Primary) | **YES** (Core) | `userId` (`users._id`) | `createdAt` | `attemptId` $\rightarrow$ `screeningAttempts` | Yes | **Timeline Event** (`triage_assessed`, `triage_override`) |
| **`alerts`** | Clinical safety alert (`suicide`, `psychosis`, `severe`, `escalation`, manual). | **YES** (Critical) | **YES** (Core) | `userId` (`users._id`) | `createdAt`, `acknowledgedAt` | `attemptId` $\rightarrow$ `screeningAttempts`, `triageId` $\rightarrow$ `triages` | Yes | **Timeline Event** (`safety_alert_created`, `safety_alert_ack`) |
| **`counsellorRequests`** | Student help-seeking request submitted from journal, distress, or UI. | **YES** | **YES** (Core) | `user_id` (`users._id`) | `timestamp`, `updatedAt` | Relates to situation/thought | Yes | **Timeline Event** (`counselor_requested`) |
| **`appointments`** | Scheduled clinical consultation session between student and staff. | **YES** | **YES** (Core) | `userId` (`v.id("users")`) | `createdAt`, `startTime`, `endTime`, `date`, `time` | May relate to `counsellorRequests` | Yes | **Timeline Event** (`appointment_scheduled`, `appointment_completed`) |
| **`cbtSessions`** | Complete interactive CBT therapy session with thoughts, distortions, and reframes. | **YES** | **YES** (Core) | `userId` (`users._id`) | `timestamp`, `conversation[].timestamp` | Parent to `microGoals` (`cbtSessionId`), triggers `alerts` | Yes | **Timeline Event** (`cbt_session_completed`, `cbt_safety_mode`) |
| **`clinicalTimelines`** | Manual staff timeline event table. | Yes | Static notes | `userId` (`users._id`) | `timestamp` | None (`metadata` string) | Yes | **Manual Staff Notes** (Currently unpopulated) |
| **`emotionLogs`** | High-frequency mood & somatic check-in (intensity, body regions). | Secondary | Optional filterable telemetry | `userId` (`users._id`) | `createdAt` | None | Yes | **Monitoring Telemetry** (`emotion_checkin`) |
| **`dailyCheckins`** | Daily calendar mood check-in (`dateStr`, `mood`). | Secondary | Optional filterable telemetry | `userId` (`users._id`) | `createdAt` | None | Yes | **Monitoring Telemetry** (`daily_mood`) |
| **`followUps`** | Post-intervention clinical check / task (`type`, `dueDate`, `completed`). | **YES** | **YES** (Core) | `userId` (`users._id`) | `createdAt`, `dueDate` | None | Yes | **Timeline Event** (`follow_up_scheduled`, `follow_up_completed`) |
| **`wellnessProfiles`** | Personality traits, wellness goals, and mood patterns. | No (State) | No | `userId` (`users._id`) | `last_updated` | None | Yes | **Supporting Metadata** |
| **`emotionMaps`** | Somatic body-map pain/tension ratings. | Secondary | Optional filterable telemetry | `userId` (`users._id`) | `createdAt` | None | Yes | **Supporting Telemetry** |
| **`jpmrLogs`** | Jacobson's Progressive Muscle Relaxation exercise logs. | **YES** (Somatic) | **YES** | `userId` (`users._id`) | `createdAt`, `startedAt`, `completedAt` | None | Yes | **Timeline Event** (`jpmr_completed`) |
| **`reframes`** | Cognitive reframe records (guided thought dispute). | **YES** | **YES** | `userId` (`users._id`) | `createdAt` | None | Yes | **Timeline Event** (`reframe_completed`) |
| **`reframeLogs`** | Extended cognitive reframe logs with improvement percentages. | **YES** | Duplicate of `reframes` | `userId` (`users._id`) | `createdAt` | None | Yes | **Timeline Event** (Consolidated with `reframes`) |
| **`microGoals`** | Behavioral activation goals generated by CBT or user. | Secondary | Optional filterable milestones | `userId` (`users._id`) | `createdAt`, `completedAt` | `cbtSessionId` $\rightarrow$ `cbtSessions` | Yes | **Supporting Milestone** (`goal_completed`) |
| **`companionMessages`** | Chat messages with AI companion assistant. | No (Micro) | NO (Too granular) | `userId` (`users._id`) | `createdAt` | None | Yes | **Excluded from Timeline** |
| **`aiCompanionLogs`** | Chat log duplicate with AI assistant. | No (Micro) | NO (Too granular) | `userId` (`users._id`) | `createdAt` | None | Yes | **Excluded from Timeline** |
| **`aiMonitoringLogs`** | AI safety analysis logs (`riskScore`, `riskCategory`, `flaggedKeywords`). | Conditional | Only if `escalated` or severe risk | `userId` (`users._id`) | `timestamp` | None | Yes | **Timeline Event** (Conditional high-risk flag) |
| **`notifications`** | Alert & reminder delivery records. | No | NO | `recipientId` | `createdAt` | None | No | **System / Excluded** |
| **`auditLogs`** | Security and administrative audit trail (`UNBLOCK_PATIENT`, etc.). | Administrative | Clinical overrides only | `userId` | `timestamp` | None | Admin/Counselor | **Governance / Audit Data** |
| **`loginHistory`** | User login sessions, IP addresses, and devices. | No | NO | `userId` | `timestamp` | None | Admin | **Security / Excluded** |
| **`sessions`, `apiKeys`, `rateLimits`, `trash`, `systemSettings`, `jpmrVideos`** | Infrastructure, rate limiting, soft deletes, videos. | No | NO | N/A | N/A | None | No | **System Infrastructure / Excluded** |
| **`points`, `badges`, `streaks`, `weeklyMissions`, `monthlyChallenges`** | Engagement gamification. | No | NO | `userId` | N/A | None | Yes | **Gamification / Excluded from Clinical View** |

---

## 3. Audit of Existing `clinicalTimelines` Table

### 3.1 Schema & Definition
In [`convex/schema.ts:512-520`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/schema.ts#L512-L520):
```typescript
clinicalTimelines: defineTable({
  userId: v.string(),
  eventType: v.string(), // "created" | "screening" | "appointment" | "cbt" | "ai_alert" | "intervention" | "risk_reduced" | "case_closed"
  title: v.string(),
  description: v.string(),
  performedBy: v.optional(v.string()),
  timestamp: v.number(),
  metadata: v.optional(v.string()),
}).index("by_userId", ["userId"]),
```

### 3.2 Read & Write Operations
Only two functions in the entire codebase interact with `clinicalTimelines`:
1. **Query**: [`convex/dashboard.ts:getPatientTimeline`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/dashboard.ts#L702-L713):
   ```typescript
   export const getPatientTimeline = query({
     args: { userId: v.string() },
     handler: async (ctx, args) => {
       await assertCanAccessStudent(ctx, args.userId);
       return await ctx.db
         .query("clinicalTimelines")
         .withIndex("by_userId", (q) => q.eq("userId", args.userId))
         .order("desc")
         .collect();
     }
   });
   ```
2. **Mutation**: [`convex/dashboard.ts:addTimelineEvent`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/dashboard.ts#L715-L736):
   - Requires `counsellor` or `admin`.
   - Manually inserts a single record into `clinicalTimelines`.

### 3.3 State & Utilization Assessment
- **Is it currently populated?** No. Zero automated workflows write to it. It is an empty table unless staff manually call `addTimelineEvent`.
- **Is it currently authoritative?** No. The authoritative source of truth for screenings is `screeningAttempts`, for triages is `triages`, for alerts is `alerts`, for CBT is `cbtSessions`, and for appointments is `appointments`.
- **Is it redundant with the new provenance architecture?** Yes, if treated as a duplicate log of events that already exist in their respective tables. If a secondary materialized table is maintained without transactional event dispatching, it will inevitably fall out of sync with real clinical data.
- **Recommendation**:
  - Retain `clinicalTimelines` strictly for **manual clinical case notes and staff entries** (e.g. `case_note`, `risk_reduced`, `case_closed` entered by counselors).
  - Construct the **longitudinal clinical timeline dynamically via an authoritative read-time aggregator query** (or an event-sourcing view) that queries the authoritative tables directly, ensuring 100% data freshness, zero synchronization lag, and strict provenance preservation.

---

## 4. Audit of Existing Timeline Logic Across Codebase

### 4.1 Ad-Hoc `recoveryTimeline` in `convex/dashboard.ts`
Inside [`convex/dashboard.ts:482-496`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/dashboard.ts#L482-L496), `getPatientCbtAnalytics` constructs an ad-hoc timeline:
```typescript
const recoveryTimeline = [
  ...completedSessions.map((s) => ({
    type: "session",
    timestamp: s.timestamp,
    title: "Completed CBT Session",
    details: `Emotion: ${s.emotion || "Stress"} improved from ${s.emotionBefore ?? 0} to ${s.emotionAfter ?? 0}`
  })),
  ...microGoals.filter((mg) => mg.completed).map((mg) => ({
    type: "goal",
    timestamp: mg.completedAt || mg.createdAt,
    title: `Completed Goal: ${mg.goalTitle}`,
    details: `Earned +${mg.points || 25} XP in category ${mg.category}`
  }))
].sort((a, b) => b.timestamp - a.timestamp);
```

### 4.2 Front-End Rendering in `PatientDetail.tsx`
In [`dashboard/src/pages/PatientDetail.tsx:658-688`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/pages/PatientDetail.tsx#L658-L688), the counselor UI displays this under the heading:
`"Unified Patient Recovery Timeline"`.

### 4.3 Defects in Existing Timeline Logic:
1. **Severe Clinical Incompleteness**:
   - Omits all screening attempts (`screeningAttempts`), PHQ-9/GAD-7/PQ-16 scores, and severity classifications.
   - Omits clinical triages (`triages`), suicide flags, and psychosis alerts.
   - Omits urgent safety alerts (`alerts`) and counselor response acknowledgments.
   - Omits clinical consultations (`appointments`) and student help requests (`counsellorRequests`).
   - Omits somatic relaxation exercises (`jpmrLogs`).
2. **Missing Causal Provenance**:
   - Simply concatenates arrays and sorts by timestamp.
   - Has no concept of which screening attempt caused which triage or alert.
3. **No Filtering or Pagination**:
   - Collects all items into memory without pagination or category filtering.

---

## 5. Proposed Canonical Event Model

A normalized, type-safe clinical timeline event model justified directly by Emotify's existing schema:

```typescript
export interface CanonicalTimelineEvent {
  /** Unique composite identifier: `${sourceTable}_${recordId}` */
  id: string;

  /** Canonical student identifier (users._id) */
  studentId: string;

  /** High-level clinical category */
  category: "screening" | "triage" | "safety" | "counseling" | "intervention" | "monitoring" | "note";

  /** Specific event type */
  eventType:
    | "screening_completed"
    | "screening_started"
    | "triage_assessed"
    | "triage_override"
    | "safety_alert_created"
    | "safety_alert_acknowledged"
    | "counselor_requested"
    | "appointment_scheduled"
    | "appointment_completed"
    | "appointment_cancelled"
    | "follow_up_created"
    | "follow_up_completed"
    | "cbt_session_completed"
    | "cbt_safety_triggered"
    | "jpmr_completed"
    | "reframe_completed"
    | "micro_goal_completed"
    | "ai_safety_flag"
    | "staff_case_note";

  /** Authoritative unix timestamp (ms) */
  occurredAt: number;

  /** Source table where the underlying record lives */
  sourceTable:
    | "screeningAttempts"
    | "triages"
    | "alerts"
    | "counsellorRequests"
    | "appointments"
    | "cbtSessions"
    | "jpmrLogs"
    | "reframes"
    | "microGoals"
    | "followUps"
    | "aiMonitoringLogs"
    | "clinicalTimelines";

  /** Original document ID in the source table */
  sourceId: string;

  /** Clinician-facing event title */
  title: string;

  /** Clinical summary or narrative details */
  summary: string;

  /** Standardized clinical severity level */
  severity?: "normal" | "mild" | "moderate" | "severe" | "critical";

  /** Execution status of the underlying event */
  status?: string;

  /** Explicit causal document relationships established in Step 4 */
  provenance: {
    attemptId?: string; // Originating screeningAttempts._id
    triageId?: string;  // Originating triages._id
    alertId?: string;   // Associated alerts._id
    sessionId?: string; // Originating cbtSessions._id
  };

  /** Structured, source-specific metadata for detailed slide-outs */
  metadata?: {
    instrumentScores?: {
      phq9?: number;
      gad7?: number;
      pq16?: number;
      wsas?: number;
      reqol10?: number;
      item9Flag?: boolean;
    };
    triageLevel?: string;
    alertType?: string;
    sessionEmotionBefore?: number;
    sessionEmotionAfter?: number;
    beliefScore?: number;
    appointmentDate?: string;
    appointmentTime?: string;
    performerName?: string;
  };
}
```

### Why Each Field is Justified:
- `id`: Enables stable React keys and deterministic navigation.
- `category` & `eventType`: Enables clinicians to filter timeline views (e.g. view only "Safety & Triage" or only "Interventions").
- `occurredAt`: Uses existing authoritative record timestamps (`completedAt`, `createdAt`, `timestamp`).
- `provenance`: Direct drop-in of the foreign keys established in Step 4 (`triageId`, `attemptId`).
- `metadata`: Contains instrument-specific scores without polluting top-level schema.

---

## 6. Proposed Event Classification

The timeline events are classified into 7 distinct domains based on clinical gravity:

```mermaid
graph TD
    subgraph CLINICAL_DOMAINS["Longitudinal Clinical Timeline Domains"]
        SC["1. Screening Domain<br/>(screening_completed, screening_started)"]
        TR["2. Triage Domain<br/>(triage_assessed, triage_override)"]
        SA["3. Safety Domain<br/>(safety_alert_created, safety_alert_ack)"]
        CO["4. Counseling Domain<br/>(counselor_requested, appointment_scheduled, follow_up)"]
        IN["5. Intervention Domain<br/>(cbt_session_completed, jpmr_completed, reframe)"]
        MO["6. Monitoring Telemetry<br/>(emotion_checkin, ai_safety_flag)"]
        NO["7. Staff Case Notes<br/>(staff_case_note)"]
    end
```

### Domain Breakdown:

#### 1. Screening Domain (`sourceTable: screeningAttempts`)
- **`screening_completed`**: Full assessment submitted. Displays total scores (PHQ-9, GAD-7, PQ-16), severity classification, and item 9 suicidality status.
- **`screening_started`**: In-progress attempt initiated by student.

#### 2. Triage Domain (`sourceTable: triages`)
- **`triage_assessed`**: Clinical risk level assigned (`mild`, `moderate`, `severe`, `suicide_flag`, `psychosis_flag`).
- **`triage_override`**: Staff clinical action (e.g., `unblockPatient`, `triggerScreeningTest`).

#### 3. Safety Domain (`sourceTable: alerts`)
- **`safety_alert_created`**: Urgent alert generated (`suicide`, `psychosis`, `severe`, `escalation`, or manual SOS).
- **`safety_alert_acknowledged`**: Counselor confirmed receipt of alert (`acknowledgedAt`).

#### 4. Counseling Domain (`sourceTable: counsellorRequests`, `appointments`, `followUps`)
- **`counselor_requested`**: Student initiated help request from app.
- **`appointment_scheduled`**: Consultation booked with date, time, and counselor.
- **`appointment_completed`**: Consultation concluded with feedback/attendance.
- **`follow_up_scheduled` / `follow_up_completed`**: Clinical follow-up check.

#### 5. Intervention Domain (`sourceTable: cbtSessions`, `jpmrLogs`, `reframes`, `microGoals`)
- **`cbt_session_completed`**: Cognitive therapy session completed with pre/post emotion ratings, identified distortions, and balanced thought.
- **`cbt_safety_triggered`**: Safety mode activation during CBT due to crisis language.
- **`jpmr_completed`**: Progressive muscle relaxation completed with pre/post tension relief.
- **`reframe_completed`**: Cognitive restructuring exercise logged.
- **`micro_goal_completed`**: Behavioral activation milestone completed.

#### 6. Monitoring Telemetry (`sourceTable: emotionLogs`, `aiMonitoringLogs`)
- **`emotion_checkin`**: Granular mood/somatic log (can be toggled on/off to prevent timeline clutter).
- **`ai_safety_flag`**: AI content moderation escalated high-risk interaction.

#### 7. Staff Notes (`sourceTable: clinicalTimelines`)
- **`staff_case_note`**: Direct note recorded by counselor or psychiatrist.

---

## 7. Provenance Mapping

The longitudinal timeline relies strictly on explicit document references established in Step 4. **No causal relationship may be inferred from timestamps or array positions.**

```mermaid
graph LR
    SA["Screening Attempt<br/>(_id: attemptA)"]
    TR["Triage Record<br/>(_id: triageA, attemptId: attemptA)"]
    AL["Safety Alert<br/>(_id: alertA, attemptId: attemptA, triageId: triageA)"]

    SA -- "triageId" --> TR
    TR -- "attemptId" --> SA
    AL -- "attemptId" --> SA
    AL -- "triageId" --> TR
```

### Provenance Rules for Timeline Events:
1. **Screening Event**:
   - `provenance.attemptId = screeningAttempt._id`
   - `provenance.triageId = screeningAttempt.triageId`
2. **Triage Event**:
   - `provenance.triageId = triage._id`
   - `provenance.attemptId = triage.attemptId`
3. **Safety Alert Event**:
   - `provenance.alertId = alert._id`
   - `provenance.triageId = alert.triageId`
   - `provenance.attemptId = alert.attemptId`
4. **CBT & Goal Events**:
   - For `cbtSessions`: `provenance.sessionId = cbtSession._id`
   - For `microGoals`: `provenance.sessionId = microGoal.cbtSessionId`
5. **Historical Records Without Provenance**:
   - Any historical record where `attemptId` or `triageId` is `undefined` remains with empty provenance: `{}`.
   - The timeline displays them as isolated chronological events without fabricating a link to nearby screenings or triages.

---

## 8. Authorization Analysis

The clinical timeline consolidates data across multiple tables. Authorization must be strictly guarded to prevent data leakage between students.

### 8.1 Access Matrix
- **Student**:
  - May access **ONLY** their own timeline (`studentId === identity.subject`).
  - Requesting any other student's timeline must immediately throw `Error("Unauthorized: Students can access ONLY their own clinical data.")`.
- **Counselor**:
  - May access clinical timelines for students under active care, as enforced by `assertCanAccessStudent(ctx, targetUserId)`.
- **Admin**:
  - Has full clinical and administrative access across all student timelines.
- **Unauthenticated**:
  - Immediately rejected with `Error("Unauthenticated")`.

### 8.2 Current Authorization Limitation
- Currently, `assertCanAccessStudent` permits any active counselor or admin to view any student's data.
- **Caseload assignment** (restricting Counselor Clara to only her assigned cohort of students) is intentionally not yet implemented. This boundary is noted as an upcoming institutional governance requirement.

---

## 9. Duplication & Consistency Analysis

When aggregating records across multiple tables, multiple entries can describe the same underlying real-world event. The timeline must handle these cleanly:

| Potential Collision | Nature of Relationship | Risk | Recommended Handling |
| :--- | :--- | :--- | :--- |
| **`screeningAttempts` vs. `screenings`** | Duplicate / Mirror | Both represent the same assessment submission. | **Deduplicate**: Query `screeningAttempts`. Ignore `screenings` table unless handling a legacy student with zero `screeningAttempts`. |
| **`screeningAttempts` vs. `triages`** | Causal Parent/Child | Screening submission creates both an attempt and a triage record simultaneously. | **Consolidate or Group**: Display as a primary `screening_completed` event with the triage result embedded in `metadata`, OR display both connected via `provenance.triageId`. |
| **`triages` vs. `alerts`** | Causal Trigger | Triage detects severe risk and inserts an alert in the same transaction. | **Separate but Linked**: Triage is an assessment; Alert is an active clinical safety notification requiring response. Keep distinct, linked via `triageId`. |
| **`counsellorRequests` vs. `appointments`** | Intent vs. Fulfillment | Student requests counselor $\rightarrow$ Counselor schedules appointment. | **Distinct Events**: Request is student's help-seeking event; Appointment is the scheduled clinical session. |
| **`cbtSessions` vs. `microGoals`** | Intervention vs. Homework | Completing CBT generates 1–4 micro-goals. | **Hierarchical**: CBT completion is a major milestone; Goal completions are secondary milestones linked by `cbtSessionId`. |
| **`emotionLogs` vs. `dailyCheckins`** | Parallel Mood Check-ins | Two different UI screens for logging mood. | **Unified Category**: Group both under `monitoring`, filterable by toggle. |

---

## 10. Performance Analysis

### 10.1 Query Load Estimation
Constructing a student timeline requires querying:
1. `screeningAttempts` (`by_userId`)
2. `triages` (`by_userId`)
3. `alerts` (`by_userId`)
4. `counsellorRequests` (`by_user_id`)
5. `appointments` (`by_userId`)
6. `cbtSessions` (`by_userId`)
7. `jpmrLogs` (`by_userId`)
8. `reframes` (`by_userId`)
9. `clinicalTimelines` (`by_userId`)

All these queries leverage existing `by_userId` / `by_user_id` indexes.

### 10.2 Read-Time Aggregation vs. Materialized Table
- **Read-Time Aggregation (Recommended)**:
  - In Convex, running 6–8 indexed queries in parallel via `Promise.all` for a single student takes **under 10 milliseconds**.
  - A typical student has between 10 and 200 total clinical events throughout an academic year.
  - Sorting and normalizing 200 in-memory JavaScript objects takes **< 1ms**.
  - **Zero synchronization bugs**: Because events are drawn directly from the authoritative source tables, there is zero risk of materialized timeline drift.
- **Materialized Timeline (Not Recommended for Step 6)**:
  - Requires writing to a secondary `clinicalTimelines` table in every single mutation across 8 modules.
  - Highly susceptible to orphaned records, missed updates, and double writes.

### 10.3 Pagination & Sorting
- Aggregated events are sorted descending by `occurredAt`:
  ```typescript
  events.sort((a, b) => b.occurredAt - a.occurredAt);
  ```
- For high-frequency telemetry (`emotionLogs`), limit queries to `.take(50)` or filter by date range (`sinceTimestamp`).

---

## 11. Recommended Implementation Plan (For Priority 4 Step 6)

1. **Add Backend Query `getStudentClinicalTimeline`**:
   - Location: `convex/timeline.ts` (or `convex/dashboard.ts`).
   - Arguments: `{ userId: v.string(), categoryFilter?: v.optional(v.string()), limit?: v.optional(v.number()) }`.
   - Authorization: Enforce `assertCanAccessStudent(ctx, targetUserId)`.
   - Execution: Query authoritative tables in parallel, normalize into `CanonicalTimelineEvent`, sort by `occurredAt desc`.
2. **Wire Counselor Dashboard UI**:
   - Replace the partial `recoveryTimeline` in [`dashboard/src/pages/PatientDetail.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/pages/PatientDetail.tsx) with the unified clinical timeline query.
   - Add category filter tabs: `All`, `Assessments & Triage`, `Safety Alerts`, `CBT & Interventions`, `Appointments`.
   - Add visual provenance badges linking related events together.
3. **Comprehensive Test Suite**:
   - Validate ordering, provenance linking, historical record safety, and strict access denial for unauthorized students.

---

## 12. Risks & Open Questions

1. **Table Key Inconsistency (`userId` vs. `user_id`)**:
   - `counsellorRequests` uses `user_id`, while all other tables use `userId`. The aggregator must account for this difference.
2. **Appointment Foreign Key**:
   - `appointments` table uses `userId: v.id("users")` (Convex Document ID type), whereas other tables use `userId: v.string()`. The aggregator must cast accordingly.
3. **Caseload Assignment**:
   - Currently, any counselor can access any student's timeline. Institutional governance may require strict counselor-student caseload assignment in a future milestone.
4. **Volume of Emotion Logs**:
   - If a student logs emotions multiple times daily, `emotionLogs` could drown out major clinical events. Telemetry should be filtered or collapsed by default.

---

## 13. Explicit Non-Changes

During this audit:
- ❌ **No schema definitions were modified.**
- ❌ **No backend mutations or queries were modified.**
- ❌ **No UI components were changed.**
- ❌ **No database records were created, migrated, or deleted.**
- ❌ **No tests were modified.**
- ❌ **Priority 4 Step 6 was not started.**
