# Priority 9 Step 6B — Counselor Dashboard Intervention Timeline Implementation

## 1. Objective
The objective of Priority 9 Step 6B was to implement the five approved changes established in the Step 6 audit (`PRIORITY_9_STEP_6_INTERVENTION_TIMELINE_AUDIT.md`) for the Counselor Dashboard and Clinical Timeline:
1. Integrate `breathingLogs` into the dynamic Clinical Timeline under category `intervention`.
2. Integrate `groundingLogs` into the dynamic Clinical Timeline under category `intervention`.
3. Deduplicate CBT-linked `reframeLogs` from the top-level Clinical Timeline so a single cognitive exercise produces exactly one authoritative timeline card.
4. Add a Breathing Sessions table to `PatientDetail.tsx` Tab 4 ("🧘 Somatic & Sensory Interventions") powered by `convex/dashboard.ts`.
5. Remove the redundant nested `<ClinicalTimelineView>` from `PatientDetail.tsx` Tab 3 ("AI CBT & Recovery").

All work strictly preserves the architectural invariant: **The Clinical Timeline remains a dynamic read model**. No persistent `timelineEvents` or materialized timeline tables were created.

---

## 2. Timeline Backend Changes
File: `convex/timeline.ts`
- **Parallel Query Architecture:** Preserved `Promise.all` parallel retrieval. Added queries for `breathingLogs` and `groundingLogs` using existing indexed queries:
  - `ctx.db.query("breathingLogs").withIndex("by_user_status", q => q.eq("userId", studentId)).order("desc").take(limit)`
  - `ctx.db.query("groundingLogs").withIndex("by_user_status", q => q.eq("userId", studentId)).order("desc").take(limit)`
- **Zero N+1 Queries:** All data retrieval is bounded, indexed, and executed in the initial parallel gather phase.
- **Dynamic Sorting and Bounding:** Combined all canonical events, sorted by `occurredAt` descending, and sliced to the requested `limit` (default: 50).

---

## 3. Breathing Timeline Integration
- **Category:** `"intervention"`.
- **Event Filtering:** Only `"completed"` and `"partial"` statuses are mapped; `"abandoned"` sessions are strictly excluded.
- **Event Types:**
  - `"breathing_completed"` for status `"completed"`
  - `"breathing_partial"` for status `"partial"`
- **Deterministic ID:** `breathingLogs_${log._id}`.
- **Title:** `Breathing: ${log.protocolName}`.
- **Summary:** `${log.cyclesCompleted}/${log.targetCycles} cycles completed (${log.durationSeconds}s). Status: ${log.status}.`
- **Source Preservation:** `sourceTable: "breathingLogs"`, `sourceId: String(log._id)`.
- **Timestamp:** `log.completedAt || log.startedAt || log._creationTime`.
- **Validated Provenance:** Preserves `attemptId` and `triageId` if and only if present on the source log; never fabricated.

---

## 4. Grounding Timeline Integration
- **Category:** `"intervention"`.
- **Event Filtering:** Only `"completed"` and `"partial"` sessions are mapped; `"abandoned"` sessions are strictly excluded.
- **Event Types:**
  - `"grounding_completed"` for status `"completed"`
  - `"grounding_partial"` for status `"partial"`
- **Deterministic ID:** `groundingLogs_${log._id}`.
- **Title:** `Sensory Grounding: 5-4-3-2-1`.
- **Summary:** `${log.stepsCompleted}/5 sensory steps completed (${log.durationSeconds}s). Status: ${log.status}.`
- **Source Preservation:** `sourceTable: "groundingLogs"`, `sourceId: String(log._id)`.
- **Timestamp:** `log.completedAt || log.startedAt || log._creationTime`.
- **Zero Sensory Observations:** Contains only structural metrics (step count, elapsed duration, status). No free-text observations or sensory details are stored or exposed.

---

## 5. CBT / Reframe Deduplication
- **Authoritative CBT Event:** CBT sessions remain the primary authoritative timeline card (`cbt_session`).
- **Read-Model Deduplication:**
  ```typescript
  const knownCbtSessionIds = new Set(cbtSessions.map(session => String(session._id)));
  ```
  When mapping `reframeLogs`, if `reframeLog.cbtSessionId` is present and contained in `knownCbtSessionIds`, the reframe log is omitted from the top-level timeline.
- **Concise Structured CBT Metadata:** When a CBT session has an associated `reframeLog`, structured outcome metadata (`reframeCompleted: true`, `reframeImprovementPercentage: number`) is attached to the existing CBT event.
- **Data Minimization:** No raw dialogue, conversation transcripts, AI prompts, or thought text are attached.
- **Standalone Reframe Preservation:** Standalone reframes (`reframeLog.cbtSessionId === undefined`) continue to render as independent `reframe_completed` intervention events.
- **Zero Mutation:** Neither `cbtSessions` nor `reframeLogs` records are altered or deleted in the database.

---

## 6. Counselor Analytics Changes
File: `convex/dashboard.ts`
- **Query Function:** `getPatientCbtAnalytics`.
- **Authorization:** Maintained strict counselor authorization check (`assertCanAccessStudent(ctx, studentId)`).
- **Breathing Retrieval:** Queried `breathingLogs` using the `by_user_status` index, bounded to 50 items descending.
- **Payload:** Returned `breathingLogs` alongside existing `jpmrLogs` and `groundingLogs` somatic data.
- **Privacy Enforcement:** Data exposed to the counselor is restricted to protocol name, completion status, duration, cycles, source type, and timestamp.

---

## 7. Dashboard UI Changes
File: `dashboard/src/pages/PatientDetail.tsx`
- **Change A — Remove Duplicate Timeline:**
  - Removed the redundant nested `<ClinicalTimelineView studentId={patient.userId} />` from Tab 3 ("AI CBT & Recovery").
  - Tab 2 remains the single dedicated home for the full Clinical Timeline.
  - Eliminated duplicate component rendering, network requests, and query load.
- **Change B — Somatic Tab Expansion & Breathing Table:**
  - Renamed Tab 4 from `"🧘 Somatic & JPMR"` to `"🧘 Somatic & Sensory Interventions"`.
  - Added the **Breathing Sessions** table featuring:
    - Date & Time
    - Protocol Name (Badge formatted)
    - Duration (`${durationSeconds}s`)
    - Cycles Completed (`${cyclesCompleted}/${targetCycles}`)
    - Status Badge (Green for `completed`, Amber for `partial`, Slate for `abandoned`)
    - Source (`self_initiated`, `cbt_support`, `emotion_map`, etc.)
  - Positioned consistently alongside JPMR Relaxation Sessions, Emotion Body Maps, and Sensory Grounding Sessions.

---

## 8. Privacy & Data Minimization
- No raw Mitra conversation text or AI dialogue arrays are exposed in the timeline.
- No private journal entries or user thought notes are included.
- No free-text sensory observations exist or are exposed for grounding exercises.
- Device telemetry, microphone data, and location data are strictly absent.
- Only clinically relevant operational metrics (protocol, duration, step/cycle counts, completion status) are provided to the counselor.

---

## 9. Authorization
- All Clinical Timeline operations enforce:
  ```typescript
  await assertCanAccessStudent(ctx, args.userId);
  ```
- All Dashboard analytics operations enforce:
  ```typescript
  await assertCanAccessStudent(ctx, studentId);
  ```
- Students cannot access another student's timeline or somatic logs.
- Unauthenticated requests are rejected.

---

## 10. Tests
Created `convex/priority9_step6b.test.ts` covering 14 targeted verification scenarios:
1. `TIMELINE-BREATHING`: Completed breathing session appears under category `intervention` with protocol, duration, cycles, and status.
2. `TIMELINE-BREATHING-PARTIAL`: Partial breathing session appears as `breathing_partial`.
3. `TIMELINE-BREATHING-ABANDONED`: Abandoned breathing session is excluded from the timeline.
4. `TIMELINE-GROUNDING`: Completed grounding session appears with 5/5 steps and status `completed`.
5. `TIMELINE-GROUNDING-PARTIAL`: Partial grounding session appears as `grounding_partial`.
6. `TIMELINE-GROUNDING-ABANDONED`: Abandoned grounding session is excluded from the timeline.
7. `TIMELINE-CBT-REFRAME-DEDUP`: CBT session with linked reframeLog produces exactly 1 top-level CBT event.
8. `TIMELINE-STANDALONE-REFRAME`: Standalone reframeLog remains an independent `reframe_completed` event.
9. `TIMELINE-PROVENANCE`: Valid `attemptId` and `triageId` are preserved without fabrication.
10. `TIMELINE-PRIVACY`: Private dialogue and thought text are not included in timeline events.
11. `DASHBOARD-BREATHING`: Counselor can fetch patient breathing logs via `getPatientCbtAnalytics`.
12. `DASHBOARD-BREATHING-AUTH`: Unauthorized access by a different student is blocked.
13. `DASHBOARD-TIMELINE-DUPLICATE`: Tab 3 does not render the redundant `ClinicalTimelineView`.
14. `DASHBOARD-SOMATIC-BREATHING`: PatientDetail source code contains the Breathing Sessions table.

Result: **14 / 14 tests passing**.

---

## 11. Manual QA
| Item | Verification Step | Result |
|---|---|---|
| 1 | Open Clinical Timeline for a student | Passed |
| 2 | Completed breathing session appears with protocol and cycle count | Verified |
| 3 | Partial breathing session appears with partial count and status | Verified |
| 4 | Abandoned breathing session does not appear | Verified |
| 5 | Completed grounding session appears with 5/5 sensory steps | Verified |
| 6 | Partial grounding session appears with step count and status | Verified |
| 7 | Abandoned grounding session does not appear | Verified |
| 8 | Intervention filter includes breathing and grounding | Verified |
| 9 | Screening, Triage, and Safety filters exclude breathing/grounding | Verified |
| 10 | CBT session with linked reframe produces 1 top-level card | Verified |
| 11 | Standalone reframe produces independent event | Verified |
| 12 | Tab 3 contains CBT charts/tables with no nested timeline | Verified |
| 13 | Tab 4 header reads "🧘 Somatic & Sensory Interventions" | Verified |
| 14 | Tab 4 renders Breathing, Grounding, JPMR, and Body Maps | Verified |
| 15 | Provenance displays only when present on source log | Verified |

---

## 12. Regression Verification
- **Full Vitest Suite:** 18 test files, **356 / 356 tests passing** (0 failures).
- **TypeScript Check:** `npx tsc --noEmit` exited with code 0 (clean).
- **Dashboard Production Build:** `npm run build --prefix dashboard` completed successfully with Vite (0 errors).

---

## 13. Scope Compliance
- [x] No modifications to clinical screening instruments (PHQ-9, GAD-7, PQ-16, WSAS, ReQoL-10).
- [x] No modifications to clinical scoring or triage thresholds.
- [x] No modifications to breathing engine or protocols.
- [x] No modifications to grounding player or grounding protocols.
- [x] No new database tables created (`interventionTimeline`, etc. were avoided).
- [x] No historical migrations executed.
- [x] No scope creep into Priority 10.

---

## 14. Remaining Limitations
- Breathing and grounding logs older than the timeline limit (default 50) are paginated/bounded; counselor queries retrieve the most recent 50 records.
- Standalone reframes created outside CBT restructuring are displayed as individual cards without parent grouping.

---

## 15. Final Status

### **STEP 6B COMPLETE**

All approved scope items implemented, verified by unit tests, full regression suite, clean TypeScript compilation, and production dashboard build.
