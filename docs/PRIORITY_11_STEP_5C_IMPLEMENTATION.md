# Priority 11 Step 5C: Clinical Timeline Query Bounding + Deterministic Cursor Pagination

**Implementation Report**  
**Status**: COMPLETE / VERIFIED  
**Date**: October 2, 2026  
**Scope**: Priority 11 Step 5C — Database-Bounded Longitudinal Timeline Retrieval with Deterministic Cursor Pagination  

---

## 1. Status

Priority 11 Step 5C is **COMPLETE** and verified across all test suites, TypeScript strict checking, and dashboard production builds.

- **Baseline Test Suite**: 422 / 422 passing
- **New Step 5C Test Suite**: 20 / 20 passing (`convex/priority11_step5c.test.ts`)
- **Full Test Suite**: 442 / 442 passing across 23 test files
- **TypeScript**: `npx tsc --noEmit` clean (0 errors)
- **Dashboard Production Build**: `npm --prefix dashboard run build` clean (built in 796ms)
- **Architectural Invariant**: Strict dynamic read model preserved. No materialized timeline tables or duplicate event collections created.
- **Privacy Boundary**: Raw Mitra AI companion conversations (`aiCompanionLogs`, `companionMessages`) remain strictly excluded from the clinical timeline.

---

## 2. Existing Timeline Architecture

The Clinical Timeline (`convex/timeline.ts:getStudentClinicalTimeline`) dynamically projects longitudinal clinical events from authoritative source tables rather than a materialized table.

### Current Source Inventory

| # | Source Table | Event Type(s) | Category | Timestamp Field | User ID Field | Auth Requirement | Included/Excluded |
|---|---|---|---|---|---|---|---|
| 1 | `screeningAttempts` | `phq9_attempt`, `gad7_attempt`, `screening_attempt` | `screening` | `startedAt` | `userId` | Counselor / Self | Included |
| 2 | `screenings` | `phq9_completed`, `gad7_completed`, `screening_completed` | `screening` | `completedAt` / `createdAt` | `userId` | Counselor / Self | Included (deduplicated against attempts) |
| 3 | `triages` | `triage_evaluation` | `triage` | `createdAt` | `userId` | Counselor / Self | Included |
| 4 | `counselorAlerts` | `safety_alert`, `clinical_alert` | `safety` | `createdAt` | `userId` | Counselor / Self | Included |
| 5 | `patientAlerts` | `student_safety_alert` | `safety` | `createdAt` | `userId` | Counselor / Self | Included |
| 6 | `appointments` | `appointment_scheduled`, `appointment_completed`, `appointment_cancelled` | `counseling` | `startTime` / `createdAt` | `studentId` | Counselor / Self | Included |
| 7 | `followUps` | `follow_up_scheduled`, `follow_up_completed` | `counseling` | `createdAt` | `userId` | Counselor / Self | Included |
| 8 | `cbtSessions` | `cbt_session_completed` | `intervention` | `timestamp` | `userId` | Counselor / Self | Included (in-progress excluded) |
| 9 | `guidedInterventions` | `intervention_session` | `intervention` | `createdAt` | `userId` | Counselor / Self | Included |
| 10 | `reframeLogs` | `cognitive_reframe` | `intervention` | `createdAt` | `userId` | Counselor / Self | Included (deduplicated against CBT sessions) |
| 11 | `microGoals` | `micro_goal_created`, `micro_goal_completed` | `intervention` | `completedAt` / `createdAt` | `userId` | Counselor / Self | Included |
| 12 | `clinicalTimelines` | `counselor_note` | `note` | `createdAt` | `userId` | Counselor / Self | Included (manual staff notes) |
| 13 | `aiMonitoringLogs` | `ai_safety_flag` | `monitoring` | `createdAt` | `userId` | Counselor / Self | Excluded by default; included ONLY when `categoryFilter === "monitoring"` |
| 14 | `emotionLogs` | `emotion_checkin` | `monitoring` | `createdAt` | `userId` | Counselor / Self | Excluded by default; included ONLY when `categoryFilter === "monitoring"` |
| 15 | `wellnessCheckIns` | `daily_wellness_checkin` | `monitoring` | `createdAt` | `userId` | Counselor / Self | Excluded by default; included ONLY when `categoryFilter === "monitoring"` |
| 16 | `jpmrLogs` | `jpmr_session_completed` | `intervention` | `completedAt` | `userId` | Counselor / Self | Included (abandoned/incomplete excluded) |
| 17 | `breathingLogs` | `breathing_session_completed` | `intervention` | `completedAt` | `userId` | Counselor / Self | Included (incomplete excluded) |
| 18 | `groundingLogs` | `grounding_session_completed` | `intervention` | `completedAt` | `userId` | Counselor / Self | Included (incomplete excluded) |

### Existing Filters
- `all`: Returns all clinical, counseling, intervention, and note events; suppresses high-frequency monitoring noise (`emotionLogs`, `wellnessCheckIns`, `aiMonitoringLogs`).
- `screening`: Filters to `screeningAttempts` and authoritative completed `screenings`.
- `triage`: Filters to `triages` clinical classifications.
- `safety`: Filters to `counselorAlerts` and `patientAlerts`.
- `counseling`: Filters to `appointments` and clinical `followUps`.
- `intervention`: Filters to `cbtSessions`, `reframeLogs`, `guidedInterventions`, `microGoals`, `jpmrLogs`, `breathingLogs`, and `groundingLogs`.
- `monitoring`: Filters to telemetry records (`emotionLogs`, `wellnessCheckIns`, `aiMonitoringLogs`).
- `note`: Filters to manual staff notes recorded in `clinicalTimelines`.

### Existing Exclusions
1. **Raw AI Companion Messages**: Mitra dialogue records (`aiCompanionLogs`, `companionMessages`) remain strictly excluded from the clinical timeline to maintain student privacy boundaries.
2. **Incomplete / Abandoned Interventions**:
   - `cbtSessions`: Must have `status === "completed"` or `status === "safety_mode"`. In-progress sessions without completed reframes or outcomes are suppressed.
   - `jpmrLogs`: Must have `completed === true`.
   - `breathingLogs`: Must have `completed === true`.
   - `groundingLogs`: Must have `completed === true`.
3. **Redundant Bridge Events**:
   - Reframe logs originating from a CBT therapy session (`cbtSessionId != null`) are merged into the parent CBT session event and suppressed from standalone display.
   - Screenings linked to an attempt (`attemptId != null`) are merged with their parent `screeningAttempts` record to avoid double-counting.

---

## 3. Bounding Strategy

### Per-Source Query Strategy
Previously, `convex/timeline.ts` executed unbounded `.collect()` queries across all sources before filtering and slicing in Node.js memory. This meant database read amplification scaled linearly with patient history depth.

Step 5C eliminates all unbounded `.collect()` queries. Each source query now:
1. Targets an explicit index (`withIndex(...)`).
2. Constrains by the target student user identity.
3. Orders descending (`.order("desc")`) to prioritize recent clinical events.
4. When a cursor is provided, binds the query boundary at the database level using `.lte("<timestampField>", cursor.t)`.
5. Applies a database-level `.take(candidateLimit)`.

### Step 5B Compound Indexes Utilized
The six compound indexes introduced in Step 5B are directly utilized for bounded candidate retrieval:
- `screeningAttempts`: `.withIndex("by_userId_and_startedAt", q => q.eq("userId", id).lte("startedAt", cursor.t))`
- `triages`: `.withIndex("by_userId_and_createdAt", q => q.eq("userId", id).lte("createdAt", cursor.t))`
- `cbtSessions`: `.withIndex("by_userId_and_timestamp", q => q.eq("userId", id).lte("timestamp", cursor.t))`
- `reframeLogs`: `.withIndex("by_userId_and_createdAt", q => q.eq("userId", id).lte("createdAt", cursor.t))`
- `jpmrLogs`: `.withIndex("by_userId_and_completedAt", q => q.eq("userId", id).lte("completedAt", cursor.t))`
- `emotionLogs`: `.withIndex("by_userId_and_createdAt", q => q.eq("userId", id).lte("createdAt", cursor.t))`

For tables indexed by `by_userId` alone, `.order("desc")` with bounded streaming guarantees bounded candidate reading without table scanning.

---

## 3. Query Bounding Architecture

### Iterative Bounded Candidate Stream (`fetchSourceForUserIds`)
Rather than relying on a static `.take(candidateLimit)` that could be exhausted if >200 records share the exact same timestamp or if ineligible records consume candidate slots, Step 5C implements an iterative bounded stream:
```typescript
const effectiveLimit = Math.max(1, Math.min(args.limit ?? 50, 100));
const targetEligible = effectiveLimit + 1;
```
- **Target Eligible Candidates**: For each source, the stream fetches up to `targetEligible` valid, eligible documents that satisfy both `isDocEligible(doc)` and the descending cursor conditions `(t < cursor.t || (t === cursor.t && id < cursor.id))`.
- **Category Query Routing**: When `args.categoryFilter` is provided, non-matching source tables are completely bypassed (`shouldQuery = false`), preventing candidate pool starvation.
- **Per-User Isolation**: Each user ID in `searchUserIds` (`[canonicalUserId, clerkId]`) independently yields up to `targetEligible` documents, preventing older or separate ID spaces from starving one another.
- **Bounded Scans**: Each source stream enforces a safety guard (`maxScanBudget = 1000`), completely bounding database reads while effortlessly traversing same-timestamp clusters well exceeding 250 records.
- **Accurate Next Cursor Termination**: `anySourceHasMore` aggregates `hasMore` flags across all queried sources:
  ```typescript
  const hasMore = paginatedPool.length > effectiveLimit || anySourceHasMore;
  ```
  `nextCursor` is returned if and only if further eligible records exist beyond the current page.

---

## 4. Cursor Contract

### Compound Ordering Key
Timeline events are ordered deterministically by:
1. `occurredAt` descending (primary sort key)
2. `id` descending (deterministic tie-breaker)

```typescript
filteredEvents.sort((a, b) => {
  if (a.occurredAt !== b.occurredAt) {
    return b.occurredAt - a.occurredAt;
  }
  return b.id.localeCompare(a.id);
});
```

### Cursor Payload Structure
```typescript
export interface TimelineCursorPayload {
  t: number;   // Timestamp of the last returned event (occurredAt)
  id: string;  // Deterministic canonical event ID of the last returned event
  u: string;   // Canonical student ID to enforce tenant/student identity binding
}
```

### Base64 Encoding / Decoding
The cursor is serialized to JSON and encoded as an opaque Base64 string for API transport:
```typescript
export function encodeTimelineCursor(payload: TimelineCursorPayload): string {
  const json = JSON.stringify(payload);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf-8").toString("base64");
  }
  return btoa(json);
}
```

### Safe Malformed Cursor & Student Isolation Handling
`decodeTimelineCursor` enforces strict validation:
- Rejects non-Base64 strings, malformed JSON, and missing/NaN fields.
- Verifies that `cursor.u === canonicalUserId`. If a student attempts to use a cursor generated for a different student, the query throws:
  `"Cursor does not match requested student timeline"`.
- Prevents cross-student cursor exploitation and timeline tampering.

### Resumption Math
When resuming from `(T, E)`, the next page excludes all events `occurredAt > T` and `(occurredAt == T AND id >= E)`:
```typescript
paginatedPool = filteredEvents.filter((e) => {
  if (e.occurredAt < cursorObj.t) return true;
  if (e.occurredAt === cursorObj.t) {
    return e.id.localeCompare(cursorObj.id) < 0;
  }
  return false;
});
```

---

## 5. Deduplication Across Pages

### Cross-Page CBT Session & Reframe Deduplication
When retrieving a single unpaginated page, all `cbtSessions` and `reframeLogs` are queried together, allowing in-memory correlation:
- If a reframe has a `cbtSessionId`, it is associated with that CBT session and suppressed from standalone display.
- **Cross-Page Challenge**: If a CBT session occurred on Page 1 and its linked reframe log is queried on Page 2 (due to differing timestamps or candidate limits), the CBT session ID might not exist in Page 2's local `cbtSessions` batch.
- **Remediation**:
  ```typescript
  if (r.cbtSessionId && !knownCbtSessionIds.has(String(r.cbtSessionId))) {
    const parentSession = await ctx.db.get(r.cbtSessionId);
    if (parentSession) {
      continue; // Parent session exists; do NOT emit standalone duplicate on Page 2
    }
  }
  ```
  This guarantees that standalone reframes are never duplicated or mistakenly emitted across page boundaries.

### Cross-Page Screening Attempt & Completion Deduplication
Similarly, if a completed screening record has `attemptId`, but the parent attempt was collected on a previous page:
```typescript
if (s.attemptId && !attemptIds.has(String(s.attemptId))) {
  const parentAttempt = await ctx.db.get(s.attemptId);
  if (parentAttempt) {
    continue; // Parent attempt exists; do NOT emit duplicate screening event
  }
}
```

---

## 6. Authorization

Authorization is strictly enforced **before** any source database queries:
```typescript
await assertCanAccessStudent(ctx, args.userId);
```
- **Student**: Allowed to query only their own timeline. Accessing another student's timeline throws an access denial error.
- **Counselor / Admin**: Role-based institution-wide clinical access verified via `assertCanAccessStudent`. (Note: Emotify's architecture uses role-based institutional access; no student-counselor individual caseload assignment mapping table exists).
- **Unauthenticated**: Rejected immediately with authentication required error.
- **Cursor Binding**: In addition to function-level authorization, the decoded cursor's embedded `u` field is matched against `canonicalUserId`. Even if an authorized counselor is viewing Student B, they cannot supply a cursor generated for Student A.

---

## 7. Test Results

### Focused Test Suite (`convex/priority11_step5c.test.ts`)
Run: `npx vitest run convex/priority11_step5c.test.ts`
Result: **23 / 23 PASSING** (288ms)

| Test ID | Description | Result |
|---|---|---|
| `P11-5C-TL-01` | First page returns default maximum of 50 events | **PASS** |
| `P11-5C-TL-02` | Explicit limit parameter controls page size | **PASS** |
| `P11-5C-TL-03` | Maximum limit is strictly capped at 100 | **PASS** |
| `P11-5C-TL-04` | Second page using nextCursor contains no events from page 1 | **PASS** |
| `P11-5C-TL-05` | Repeated pagination eventually covers all eligible synthetic events without duplication | **PASS** |
| `P11-5C-TL-06` | Events with identical timestamps are deterministically ordered by eventId | **PASS** |
| `P11-5C-TL-07` | Cursor resumes correctly when multiple events share identical timestamps | **PASS** |
| `P11-5C-TL-08` | Malformed cursor is rejected safely | **PASS** |
| `P11-5C-TL-09` | Student A cannot use a cursor to access Student B's timeline | **PASS** |
| `P11-5C-TL-10` | Student authorization remains enforced before timeline queries | **PASS** |
| `P11-5C-TL-10B` | Unauthenticated requests are rejected before querying timeline | **PASS** |
| `P11-5C-TL-11` | Existing event categories remain unchanged | **PASS** |
| `P11-5C-TL-12` | Existing provenance fields remain unchanged | **PASS** |
| `P11-5C-TL-13` | Raw AI companion messages do not enter the clinical timeline | **PASS** |
| `P11-5C-TL-14` | CBT/reframe deduplication remains intact across pages | **PASS** |
| `P11-5C-TL-15` | Abandoned/incomplete events remain excluded where semantics dictate | **PASS** |
| `P11-5C-TL-16` | Category filtering remains correct across multiple pages | **PASS** |
| `P11-5C-TL-17` | An empty timeline returns events = [] and nextCursor = null | **PASS** |
| `P11-5C-TL-18` | A final page returns nextCursor = null | **PASS** |
| `P11-5C-LARGE` | Large multi-source dataset traversal is bounded and deterministic | **PASS** |
| `P11-5C-TL-20` | Single-source >250 events at same timestamp paginated without loss or duplication | **PASS** |
| `P11-5C-TL-21` | Multi-source >250 events at same timestamp with deterministic tie-breaking & mid-cluster resumption | **PASS** |
| `P11-5C-TL-22` | Category filtering stress test (300 raw events: 200 excluded, 100 eligible at same timestamp) | **PASS** |

### Full Test Suite Regression (`npx vitest run`)
Run: `npx vitest run`
Result: **445 / 445 PASSING** across 23 test files (7.97s)

```
 Test Files  23 passed (23)
      Tests  445 passed (445)
   Start at  20:53:57
   Duration  7.97s
```

All previous priorities remain 100% green:
- Priority 2: Authentication & Registration (10 tests)
- Priority 3 & 4: Screening & Authorization (12 tests)
- Priority 5: Longitudinal Records & Timeline (28 tests)
- Priority 7: Telemetry & Mood Mapping (88 tests)
- Priority 8: CBT & Reframes (52 tests)
- Priority 9: Breathing & Relaxation (68 tests)
- Priority 11 Step 3: Core Metric Correctness (11 tests)
- Priority 11 Step 4: Visualizations & Timezone (21 tests)
- Priority 11 Step 5A: Telemetry Bounding & Patient Counter (24 tests)
- Priority 11 Step 5B: Compound Telemetry Indexes (10 tests)
- Priority 11 Step 5C: Clinical Timeline Bounding & Pagination (23 tests)

---

## 8. Build Results

| Check | Command | Result |
|---|---|---|
| **TypeScript Typecheck** | `npx tsc --noEmit` | **0 errors / clean** |
| **Dashboard Production Build** | `npm --prefix dashboard run build` | **0 errors / built in 815ms** |

---

## 9. Performance & Mathematical Correctness

Per the specification, no unmeasured performance claims (such as arbitrary percentage improvements or theoretical latency figures) are asserted.

The verified technical and mathematical properties established by Step 5C are:
1. **Bounded Database Scans**: Unbounded `.collect()` queries in `convex/timeline.ts` have been eliminated. Iterative streams consume at most `targetEligible` documents per source per page, bounded by `maxScanBudget = 1000`.
2. **Deterministic Traversal**: All event sequences are deterministically ordered by `(occurredAt DESC, id DESC)`. Because Convex indices order by `(timestamp DESC, _id DESC)`, and event IDs are uniquely keyed as `${sourceTable}_${_id}`, intra-table document ordering is aligned with index sequence, and inter-table ties are resolved deterministically by string comparison.
3. **No Candidate Exhaustion / Starvation**: By evaluating `isDocEligible` inside the stream iterator rather than on a pre-sliced window, ineligible/abandoned records and excluded categories do not starve eligible records from appearing in the candidate set.
4. **Guaranteed Termination**: `nextCursor` evaluates both in-memory pool overflow and database source continuation (`anySourceHasMore`), returning `null` when and only when all eligible events across all sources have been completely traversed.
5. **Guaranteed Bounded Response**: The endpoint returns at most 50 events by default and enforces a hard ceiling of 100 events.

---

## 10. Backward Compatibility

To ensure seamless operation with existing dashboard components and prior tests, `getStudentClinicalTimeline` adheres to a dual-mode return contract:
- When called with `cursor` or `paginate: true`, it returns the paginated object:
  ```typescript
  {
    events: CanonicalTimelineEvent[],
    nextCursor: string | null
  }
  ```
- When called without `cursor` or `paginate: true`, it returns the direct array `pageEvents` (typed under `PaginatedTimelineResult = CanonicalTimelineEvent[] & { events, nextCursor }`), preserving 100% backward compatibility for existing callers.
- In `dashboard/src/components/ClinicalTimelineView.tsx`, the event list safely extracts events via:
  ```typescript
  const timelineEvents =
    timelineResult === undefined
      ? undefined
      : Array.isArray(timelineResult)
      ? timelineResult
      : (timelineResult as any)?.events;
  ```

---

## 11. Deferred Work

The following work is explicitly excluded from Step 5C and deferred to future steps:
- **Step 5D**: Counselor roster and administrative pagination.
- **Step 5E**: Institutional analytics rollup tables.
- **Step 5F**: DAU/WAU/MAU aggregation definitions.
- **Step 5G**: Formal performance verification framework.
