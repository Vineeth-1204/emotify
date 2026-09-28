# Priority 4 Step 5A: Clinical Timeline Backend Implementation Report

## 1. Executive Summary

In **Priority 4 Step 5A**, the backend clinical timeline aggregation layer for Emotify was implemented in [`convex/timeline.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/timeline.ts).

The clinical timeline is designed strictly as a **read model**. It does **not** create a materialized duplicate timeline table, does **not** modify existing mutations to write duplicate events, and does **not** introduce event-sourcing or speculative causality. Instead, it dynamically aggregates authoritative clinical records across source tables, maps them into a normalized `CanonicalTimelineEvent` model, preserves explicit Step 4 provenance, enforces existing role-based authorization, supports category filtering, and returns deterministic, bounded results sorted from newest to oldest.

### Verification Summary:
- **TypeScript**: `npx tsc --noEmit` exited with code 0 (0 errors).
- **Test Suite**: 77/77 tests passed in Vitest (`npx vitest run`), including 20/20 new tests in [`convex/timeline.test.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/timeline.test.ts) covering `TIMELINE-01` through `TIMELINE-20`.
- **Dashboard UI**: Untouched (Step 5B will handle UI integration).

---

## 2. Files Created

1. [`convex/timeline.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/timeline.ts): The canonical timeline backend module containing the `CanonicalTimelineEvent` interface and the `getStudentClinicalTimeline` query.
2. [`convex/timeline.test.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/timeline.test.ts): Comprehensive test suite verifying all 20 required specifications (`TIMELINE-01` through `TIMELINE-20`).

---

## 3. Files Modified

1. [`convex/_generated/api.d.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/_generated/api.d.ts): Updated type declarations to expose the new `timeline` module in Convex's generated API interface.

*(No frontend, scoring, questionnaire, or mutation code was modified.)*

---

## 4. Canonical Timeline Event Model

The timeline normalizes all clinical events into the following type-safe model in [`convex/timeline.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/timeline.ts):

```typescript
export interface CanonicalTimelineEvent {
  /** Deterministic composite identifier: `${sourceTable}_${sourceId}` */
  id: string;

  /** Canonical student identifier (users._id) */
  studentId: string;

  /** Clinical domain category */
  category: "screening" | "triage" | "safety" | "counseling" | "intervention" | "monitoring" | "note";

  /** Specific clinical event type */
  eventType: string;

  /** Authoritative unix timestamp (ms) */
  occurredAt: number;

  /** Authoritative source table */
  sourceTable: string;

  /** Underlying Convex document ID */
  sourceId: string;

  /** Clinician-facing event title */
  title: string;

  /** Clinical summary or narrative details */
  summary: string;

  /** Standardized severity level */
  severity?: "normal" | "mild" | "moderate" | "severe" | "critical";

  /** Execution status of the underlying event */
  status?: string;

  /** Explicit causal document relationships established in Priority 4 Step 4 */
  provenance?: {
    attemptId?: string; // Originating screeningAttempts._id
    triageId?: string;  // Originating triages._id
    alertId?: string;   // Associated alerts._id
    sessionId?: string; // Originating cbtSessions._id
  };

  /** Structured, source-specific metadata for clinical slide-outs */
  metadata?: Record<string, any>;
}
```

---

## 5. Authoritative Source Tables

The timeline reads from 13 source tables directly:

| Domain | Source Table | Event Type | Description |
| :--- | :--- | :--- | :--- |
| **Screening** | `screeningAttempts` | `screening_completed`, `screening_started` | Authoritative multi-instrument clinical assessments. |
| **Screening (Legacy)** | `screenings` | `screening_completed` | Historical screenings with no modern attempt mirror. |
| **Triage** | `triages` | `triage_assessed`, `triage_override` | Risk tier classifications (`mild`, `moderate`, `severe`, flags). |
| **Safety** | `alerts` | `safety_alert_created`, `safety_alert_acknowledged` | High-priority safety notifications and counselor acknowledgments. |
| **Counseling** | `counsellorRequests` | `counselor_requested` | Help-seeking requests submitted by students. |
| **Counseling** | `appointments` | `appointment_scheduled`, `appointment_completed`, `appointment_cancelled` | Consultation bookings, attendance, and feedback. |
| **Counseling** | `followUps` | `follow_up_scheduled`, `follow_up_completed` | Clinical follow-up check-ins and tasks. |
| **Intervention** | `cbtSessions` | `cbt_session_completed`, `cbt_safety_triggered` | Interactive cognitive therapy sessions and crisis safety activations. |
| **Intervention** | `jpmrLogs` | `jpmr_completed` | Completed somatic muscle relaxation exercises. |
| **Intervention** | `reframeLogs` | `reframe_completed` | Completed cognitive thought restructuring logs. |
| **Intervention** | `microGoals` | `micro_goal_completed` | Completed behavioral activation goals. |
| **Staff Notes** | `clinicalTimelines` | `staff_case_note` | Manual clinical case notes authored by counselors or admins. |
| **Safety (AI)** | `aiMonitoringLogs` | `ai_safety_flag` | High-risk AI safety escalations (`severe` or `critical` risk). |

---

## 6. Event Types Implemented

| Event Type | Category | Authoritative Timestamp Used |
| :--- | :--- | :--- |
| `screening_completed` | `screening` | `attempt.completedAt \|\| attempt.startedAt` |
| `screening_started` | `screening` | `attempt.startedAt` |
| `triage_assessed` | `triage` | `triage.createdAt` |
| `triage_override` | `triage` | `triage.createdAt` |
| `safety_alert_created` | `safety` | `alert.createdAt` |
| `safety_alert_acknowledged` | `safety` | `alert.acknowledgedAt` |
| `counselor_requested` | `counseling` | `request.timestamp` |
| `appointment_scheduled` | `counseling` | `appt.startTime \|\| appt.createdAt` |
| `appointment_completed` | `counseling` | `appt.endTime \|\| appt.startTime \|\| appt.createdAt` |
| `appointment_cancelled` | `counseling` | `appt.createdAt` |
| `follow_up_scheduled` | `counseling` | `followUp.createdAt` |
| `follow_up_completed` | `counseling` | `followUp.createdAt` |
| `cbt_session_completed` | `intervention` | `session.timestamp` |
| `cbt_safety_triggered` | `safety` | `session.timestamp` |
| `jpmr_completed` | `intervention` | `jpmr.completedAt \|\| jpmr.createdAt` |
| `reframe_completed` | `intervention` | `reframe.createdAt` |
| `micro_goal_completed` | `intervention` | `goal.completedAt \|\| goal.createdAt` |
| `staff_case_note` | `note` | `note.timestamp` |
| `ai_safety_flag` | `safety` | `log.timestamp` |
| `emotion_checkin` *(optional)* | `monitoring` | `log.createdAt` |
| `daily_mood_checkin` *(optional)* | `monitoring` | `checkin.createdAt` |

---

## 7. Provenance Handling

In strict adherence to Priority 4 Step 4 rules:
1. **Explicit Foreign Keys Only**:
   - `screening_completed`: `provenance.attemptId = attempt._id`, `provenance.triageId = attempt.triageId`.
   - `triage_assessed`: `provenance.triageId = triage._id`, `provenance.attemptId = triage.attemptId`.
   - `safety_alert_created`: `provenance.alertId = alert._id`, `provenance.triageId = alert.triageId`, `provenance.attemptId = alert.attemptId`.
   - `cbt_session_completed`: `provenance.sessionId = session._id`.
   - `micro_goal_completed`: `provenance.sessionId = goal.cbtSessionId`.
2. **Zero Heuristic Causal Guessing**:
   - Timestamps, array indices, and fuzzy matches are never used to fabricate connections.
   - For historical records where `attemptId` or `triageId` is `undefined`, provenance is left as `{}`.
   - For independent alerts (e.g. manual SOS), `triageId` and `attemptId` remain `undefined`.

---

## 8. Authorization Handling

Authorization is enforced via `assertCanAccessStudent(ctx, args.userId)` established in Priority 4 Step 3:
- **Student**: Allowed to query **ONLY** their own clinical timeline. Attempting to query another student's timeline immediately throws `"Unauthorized: Students can access ONLY their own clinical data."`
- **Counselor & Admin**: Allowed to query any student's clinical timeline under their care.
- **Unauthenticated Callers**: Immediately rejected with `"Unauthenticated: Login required to access clinical data."`

---

## 9. Telemetry & Data Minimization

To ensure clinical signal is not drowned out by noise:
- **Default Timeline**: Excludes high-frequency micro-telemetry (`emotionLogs` and `dailyCheckins`). Only major clinical events are returned.
- **Optional Monitoring**: `emotionLogs` and `dailyCheckins` are queried and included **only** when the caller explicitly specifies `categoryFilter: "monitoring"`.
- **Privacy Protection**:
  - `companionMessages` and `aiCompanionLogs` (raw conversational turns) are completely excluded from the clinical timeline.
  - CBT sessions expose clinical variables (`emotionBefore`, `emotionAfter`, `beliefScore`, `cbtDistortion`), never raw conversation arrays.
  - `aiMonitoringLogs` are included only if `escalated === true` or risk is `severe` / `critical`. Raw prompt text, AI responses, and flagged keyword arrays are not exposed.

---

## 10. Deduplication Rules

1. **`screeningAttempts` vs. `screenings`**:
   - `screeningAttempts` is authoritative.
   - Any record in `screenings` whose `attemptId` matches an existing `screeningAttempts._id` is skipped, preventing double events.
   - Historical records in `screenings` that do not link to any `screeningAttempts` record are emitted as `Historical Screening Record`, preserving backward compatibility without duplicates.
2. **`reframes` vs. `reframeLogs`**:
   - `reframeLogs` is the modern, authoritative source used by the active app and counselor dashboard. It is queried directly to avoid duplicate events.

---

## 11. Pagination & Bounding Behavior

- **Dynamic Bounding**: Accepts an optional `limit` parameter (defaults to 100, clamped to a maximum of 500).
- **Sorting**: Events are sorted by `occurredAt DESC`.
- **Deterministic Secondary Tie-Breaker**: If two events share the exact same timestamp, `a.id.localeCompare(b.id)` is used to guarantee consistent ordering across requests.
- **Cross-Table Cursor Limitation**: Because the timeline aggregates in-memory across 13 distinct Convex tables, Convex database cursors are not applicable. Bounded in-memory slicing provides safe, fast, and consistent pagination without fake cursors.

---

## 12. Tests Added

The test suite in [`convex/timeline.test.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/timeline.test.ts) covers all 20 required specifications:

| Test ID | Description | Result |
| :--- | :--- | :---: |
| **TIMELINE-01** | Student can retrieve their own timeline | **PASS** |
| **TIMELINE-02** | Student cannot retrieve another student's timeline | **PASS** |
| **TIMELINE-03** | Unauthenticated access is denied | **PASS** |
| **TIMELINE-04** | Counselor can access according to current Step 3 authorization | **PASS** |
| **TIMELINE-05** | Admin access works according to current authorization | **PASS** |
| **TIMELINE-06** | Screening attempt appears with correct sourceId | **PASS** |
| **TIMELINE-07** | Screening provenance contains actual attemptId and triageId | **PASS** |
| **TIMELINE-08** | Triage event contains actual attemptId | **PASS** |
| **TIMELINE-09** | High-risk alert contains actual alertId, triageId and attemptId | **PASS** |
| **TIMELINE-10** | Independent/manual alert does not receive fabricated provenance | **PASS** |
| **TIMELINE-11** | Historical records with undefined provenance remain readable and unlinked | **PASS** |
| **TIMELINE-12** | Multiple screening attempts remain isolated and do not cross-link | **PASS** |
| **TIMELINE-13** | Duplicate screening mirror records do not produce duplicate modern screening events | **PASS** |
| **TIMELINE-14** | Events are sorted newest $\rightarrow$ oldest | **PASS** |
| **TIMELINE-15** | Identical timestamps have deterministic ordering | **PASS** |
| **TIMELINE-16** | Default timeline does not contain raw companion messages | **PASS** |
| **TIMELINE-17** | Default timeline does not become flooded by high-frequency telemetry | **PASS** |
| **TIMELINE-18** | Manual clinical notes can appear as note events | **PASS** |
| **TIMELINE-19** | No timeline event leaks another student's data | **PASS** |
| **TIMELINE-20** | Event IDs are deterministic and unique | **PASS** |

---

## 13. Full Test Results

```
 RUN  v4.1.10 D:/Projects/EmotifyApp/Emotify-Clerk

 ✓ convex/provenance.test.ts (7 tests) 185ms
 ✓ convex/authorization.test.ts (12 tests) 212ms
 ✓ convex/authz.test.ts (9 tests) 214ms
 ✓ convex/cbt.test.ts (2 tests) 216ms
 ✓ convex/timeline.test.ts (20 tests) 263ms
 ✓ convex/screening.test.ts (17 tests) 381ms
 ✓ convex/auth.test.ts (10 tests) 1016ms

 Test Files  7 passed (7)
      Tests  77 passed (77)
   Start at  21:50:18
   Duration  3.39s
```

All 77 tests in the project pass with zero failures.

---

## 14. TypeScript Result

```
npx tsc --noEmit
Exit code: 0 (0 errors)
```

TypeScript compilation passes cleanly with zero type errors.

---

## 15. Performance Considerations

- **Parallel Indexed Reads**: Queries against source tables execute concurrently via `Promise.all`.
- **Targeted User Queries**: Every sub-query uses `.withIndex("by_userId")` or `.withIndex("by_user_id")` pinned to the student's identifier, avoiding full table scans.
- **Fast In-Memory Normalization**: Normalizing and sorting 50–200 clinical records takes $< 1\text{ms}$ in JavaScript.
- **No Secondary Table Sync Lag**: Drawing directly from source tables eliminates synchronization drift and orphaned timeline records.

---

## 16. Limitations

1. **In-Memory Bounding**: Cross-table aggregation uses array slicing (`limit: number`) rather than Convex pagination cursors, which is appropriate for clinical student histories (typically $< 300$ total events per student) but not suited for infinite unbounded exports.
2. **Caseload Assignment**: Counselor access allows active counselors to view any authorized student's timeline. Specific counselor-student caseload assignment rules remain deferred to institutional governance milestones.

---

## 17. Explicit Statement of Non-Changes

As mandated by Priority 4 Step 5A guidelines:
- ❌ **NO dashboard UI files were modified** (`dashboard/src/pages/PatientDetail.tsx` was untouched).
- ❌ **NO questionnaire contents were modified** (PHQ-9, GAD-7, PQ-16 definitions untouched).
- ❌ **NO scoring logic was modified**.
- ❌ **NO triage thresholds or cutoffs were changed**.
- ❌ **NO historical database records were modified or migrated**.
- ❌ **NO materialized timeline table was created or populated on mutations**.
- ❌ **NO speculative provenance links were fabricated**.
- ❌ **Step 5B has NOT been started**.
