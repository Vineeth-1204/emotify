# P12 Step 6 — Longitudinal Review & Unified Student Profile Implementation Report

**Priority**: P12 — Counselor Interaction & Longitudinal Tracking  
**Phase**: Step 6 — Longitudinal Review & Unified Student Profile  
**Status**: COMPLETE  
**Baseline Test Count**: 669/669 tests (40 test files)  
**Final Test Count**: 688/688 tests (41 test files)  
**TypeScript**: Clean (0 errors across root and dashboard)  
**Dashboard Production Build**: Clean (Exit code 0, 0 errors)  
**Schema/Index Changes**: 0 (Pure read-model unification over canonical data)

---

## 1. Objective
Unify the counselor's existing Student Profile ([PatientDetail.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/pages/PatientDetail.tsx)) into a coherent, longitudinal review experience. The counselor can now trace a student's documented care journey across the full care pipeline:
```
Screening (PHQ-9 / GAD-7 / PQ-16)
   ↓
Triage (Triages)
   ↓
Counselor Request (counsellorRequests)
   ↓
Appointment (appointments)
   ↓
Follow-Up (followUps)
   ↓
Interventions (CBT, Somatic JPMR, Grounding, Breathing, Emotion Maps)
```
Crucially, this is a **read model** assembling existing authoritative records without creating synthetic intelligence, fabricated scores, or duplicate clinical tables.

---

## 2. PatientDetail Pre-Implementation Audit
Before implementation, [PatientDetail.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/pages/PatientDetail.tsx) and associated components were audited:

1. **Student Identity / Header**: Present (`patient.full_name`, `patient.patientId`, `patient.status`).
2. **Screening Results**: Present via `screening.getAllScreenings` displaying distinct PHQ-9, GAD-7, and PQ-16 scores per attempt.
3. **Triage Information**: Present via `triage.getByUser` displaying triage category, safety flags, and clinical notes.
4. **Safety Alerts**: Present via `dashboard.getPatientAlerts`.
5. **Counselor Requests**: **MISSING** from `PatientDetail.tsx` (counselor had to navigate separately to the general `/requests` queue).
6. **Appointments**: **MISSING** from `PatientDetail.tsx` (counselor had to navigate to the general `/sessions` schedule).
7. **Follow-Ups**: **MISSING** from `PatientDetail.tsx`.
8. **CBT / Interventions**: Present via `cbt.getPatientCbtAnalytics`.
9. **Somatic Interventions**: Present via grounding/breathing tabs in `PatientDetail.tsx`.
10. **Clinical Timeline**: Rendered via [ClinicalTimelineView.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/components/ClinicalTimelineView.tsx) consuming [convex/timeline.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/timeline.ts).
11. **Discovered Flaws**:
    - Hardcoded speculative cards: `"AI Risk Score: Low (12/100)"` and `"Assigned Counsellor: Priyanka R."` were mocked into the header!
    - [ClinicalTimelineView.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/components/ClinicalTimelineView.tsx) lacked badges for `counsellorRequestId` and `appointmentId`.
    - No direct view linking counselor requests to resulting appointments and subsequent follow-ups for the specific student.

---

## 3. Existing Canonical Data Sources
No duplicate or parallel tables were created. All queries and timeline projections draw strictly from canonical tables:
- **Screenings**: `screeningAttempts` (with historical fallback to `screenings`).
- **Triage**: `triages`.
- **Counselor Requests**: `counsellorRequests`.
- **Appointments**: `appointments`.
- **Follow-Ups**: `followUps`.
- **Interventions**: `cbtSessions`, `reframeLogs`, `groundingLogs`, `breathingLogs`, `jpmrVideos`, `emotionMaps`.
- **Timeline Read Model**: [convex/timeline.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/timeline.ts) (`getStudentClinicalTimeline`).

---

## 4. Longitudinal Architecture
The architecture preserves strict separation of concerns:
1. **Server Authorization Enforcement**: [assertCanAccessStudent](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/users.ts) verifies caller identity:
   - Counselors and admins have institutional access to any student's clinical file.
   - Students can only query their own records.
   - Unauthenticated or unauthorized callers are rejected immediately.
2. **Timeline Projection**: Projections merge time-series events across all clinical and care records with stable IDs (`${table}_${doc._id}`) and explicit provenance references.
3. **No Clinical Conclusions**: The UI presents factual state transitions and dates, strictly avoiding speculative scores or predictions.

---

## 5. Timeline Changes
In [convex/timeline.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/timeline.ts):
- Updated Source 5 (`counsellorRequests`) to map originating provenance:
  ```ts
  provenance: {
    attemptId: req.attemptId ? String(req.attemptId) : undefined,
    triageId: req.triageId ? String(req.triageId) : undefined,
  }
  ```
- Retained clean sanitization: raw AI companion transcripts and crisis distress text are excluded from the timeline read-model summaries.
- Verified Source 6 (`appointments`) retains `provenance.counsellorRequestId`.
- Verified Source 7 (`followUps`) retains `provenance.appointmentId`.

---

## 6. Provenance Navigation
In [dashboard/src/components/ClinicalTimelineView.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/components/ClinicalTimelineView.tsx):
- Added dedicated provenance badge visualizers:
  - `📋 Request #${event.provenance.counsellorRequestId.slice(-6)}`
  - `📅 Appt #${event.provenance.appointmentId.slice(-6)}`
  - Alongside existing badges for Attempt, Triage, Alert, and Session.
- In [PatientDetail.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/pages/PatientDetail.tsx):
  - Appointments display `From Request: #[ID]` badge with link to the originating request.
  - Follow-ups display `From Appt: #[ID]` badge linking back to the originating consultation.
  - A visual Pipeline Provenance Tracker at the top of the Care Journey tab visually communicates the 5-stage pipeline with factual counts.

---

## 7. Current Care Status
Replaced hardcoded mock stats in [PatientDetail.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/pages/PatientDetail.tsx) header with four factual care-status metrics:
1. **Consultation Request**: Displays current active request status (`Pending`, `Scheduled`, `Completed`, or `None Pending`).
2. **Upcoming Consultation**: Displays exact scheduled date and time of the next appointment (`Oct 15, 2026 at 10:00 AM` or `None Scheduled`).
3. **Latest PHQ-9**: Factual instrument score and clinical severity string from authoritative attempts (`14 / 27 (Moderate)` or `Not Assessed`).
4. **Latest GAD-7**: Factual instrument score and clinical severity string (`9 / 21 (Mild)` or `Not Assessed`).

All speculative labels like "AI Risk Score" and "Recovery Score" have been completely eradicated.

---

## 8. Screening History
- Preserved existing multi-instrument screening attempt displays.
- Historical attempts maintain distinct item scores for PHQ-9, GAD-7, and PQ-16.
- Item 9 (self-harm/suicide flag) and PQ-16 psychosis flags remain prominently tagged per attempt.
- No synthetic composite scores or React recalculations.

---

## 9. Triage History
- Preserved existing authoritative `triages` query.
- Displays triage category, associated attempt ID, suicide flag, and psychosis flag.
- Historical records are immutable; appointments or follow-up statuses never alter historical triage classifications.

---

## 10. Counselor Request History
- Added query `counsellorRequests.getStudentCounsellorRequests` in [convex/counsellorRequests.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/counsellorRequests.ts) with `assertCanAccessStudent` security enforcement.
- Integrated into [PatientDetail.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/pages/PatientDetail.tsx) under the "Care Journey" tab:
  - Request date/time
  - Source type (`Student Self-Initiated`, `Triage Recommendation`, `Crisis / Safety Alert`)
  - Status (`pending`, `scheduled`, `cancelled`, `completed`)
  - Linked Triage and Attempt badges
  - Counselor notes

---

## 11. Appointment History
- Integrated student appointments into [PatientDetail.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/pages/PatientDetail.tsx) using `appointments.getByUser`:
  - Date and time
  - Title and reason
  - Status (`requested`, `accepted`, `rejected`, `completed`, `cancelled`)
  - Attendance (`yes`, `no`, `excused`)
  - Originating Counselor Request provenance badge (`From Request: #[ID]`)

---

## 12. Follow-Up History
- Integrated student follow-ups into [PatientDetail.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/pages/PatientDetail.tsx) using `followUps.getStudentFollowUps`:
  - Follow-up type (`Counselor Check-in`, `Post-Intervention Review`, `Routine Check-in`, `Safety Follow-up`)
  - Due date and overdue warnings
  - Status (`pending`, `completed`, `cancelled`)
  - Originating Appointment provenance badge (`From Appt: #[ID]`)
  - Counselor-only internal notes section
  - Inline "Mark Complete" counselor action directly on the student profile

---

## 13. Intervention History
- Preserved existing CBT analytics, reframe logs, somatic grounding logs, and breathing logs.
- Added emotion mapping visualization in the monitoring view.
- Clinical conclusions or unsupported efficacy inferences are NOT generated.

---

## 14. Privacy & Security Handling
1. **Institutional Authorization**: [assertCanAccessStudent](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/users.ts) is enforced across `getStudentClinicalTimeline`, `getStudentCounsellorRequests`, `getStudentFollowUps`, and `getByUser`.
2. **Staff Notes Privacy**: Follow-up `notes` are scrubbed from student-facing views, visible only when accessed by counselors/admins.
3. **AI Transcript Protection**: Raw conversational messages (`aiCompanionLogs` / `companionMessages`) are excluded from the clinical timeline.

---

## 15. Duplicate-Data Analysis
- No duplicate records are inserted.
- The Care Journey tab and the Clinical Timeline are complementary **projections** of identical canonical documents (`counsellorRequests`, `appointments`, `followUps`).
- Each timeline event contains a deterministic ID `${sourceTable}_${docId}`, guaranteeing zero duplicates.

---

## 16. Performance & Query Analysis
- Queries utilize existing bounded compound indexes:
  - `counsellorRequests.by_user_id`
  - `appointments.by_userId`
  - `followUps.by_userId`
  - `screeningAttempts.by_userId_and_startedAt`
- Query limits are bounded (50 items max per query) preventing unbounded `.collect()` scans.

---

## 17. Schema & Index Changes
- **0 Schema Changes**: Existing schemas for `counsellorRequests`, `appointments`, and `followUps` were already designed in Steps 1–5 to support provenance fields (`attemptId`, `triageId`, `counsellorRequestId`, `appointmentId`).
- **0 Index Changes**: Existing indexes satisfied all query patterns.

---

## 18. Focused Tests
Created [convex/p12_step6_longitudinal_review.test.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/p12_step6_longitudinal_review.test.ts) covering all Step 6 requirements:
- `TIMELINE-01`: Authorized counselor retrieves student's longitudinal review.
- `TIMELINE-02`: Unauthenticated caller is rejected with error.
- `TIMELINE-03`: Unauthorized student cannot retrieve another student's review.
- `TIMELINE-04`: Counselor request appears with attemptId and triageId provenance.
- `TIMELINE-05`: Appointment appears with counsellorRequestId provenance.
- `TIMELINE-06`: Follow-up appears with appointmentId provenance.
- `TIMELINE-07`: Full chain (Request → Appointment → Follow-up) maintains internal provenance consistency.
- `TIMELINE-08`: Historical appointments without counsellorRequestId remain valid.
- `TIMELINE-09`: Historical follow-ups without appointmentId remain valid.
- `TIMELINE-10`: Raw AI companion transcripts are not returned by longitudinal timeline.
- `TIMELINE-11`: Internal counselor follow-up notes are not exposed to student queries.
- `TIMELINE-12`: PHQ/GAD/PQ16 records remain distinct and attributed to their attempts.
- `TIMELINE-13`: No duplicate timeline event is generated from the same canonical record.
- `TIMELINE-14`: Timeline bounds/limits remain enforced.
- `TIMELINE-CARE-01`: `getStudentCounsellorRequests` enforces authorization and returns student requests.
- `TIMELINE-15` through `TIMELINE-18`: Integration markers confirming Steps 2–5 compatibility.

**Result: 19/19 passing.**

---

## 19. Regression Suites
- **Step 2 Suite** ([convex/p12_step2_security_authorization.test.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/p12_step2_security_authorization.test.ts)): 14/14 passing.
- **Step 3 Suite** ([convex/p12_step3_counsellor_request_flow.test.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/p12_step3_counsellor_request_flow.test.ts)): 12/12 passing.
- **Step 4 Suite** ([convex/p12_step4_appointment_lifecycle.test.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/p12_step4_appointment_lifecycle.test.ts)): 16/16 passing.
- **Step 5 Suite** ([convex/p12_step5_followup_management.test.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/p12_step5_followup_management.test.ts)): 18/18 passing.
- **All P12 Tests Combined**: 79/79 passing across 5 test files.

---

## 20. Full Test Suite Execution
- **Command**: `npx vitest run`
- **Result**: **41 test files passed, 688/688 tests passed!**
- **Increase**: Exactly 19 new tests from `convex/p12_step6_longitudinal_review.test.ts` (669 baseline + 19 = 688).

---

## 21. TypeScript Verification
- **Command**: `npx tsc --noEmit`
- **Result**: Clean exit code 0. Zero errors across all mobile, shared, backend, and dashboard packages.

---

## 22. Dashboard Build Verification
- **Command**: `npm run build` in `dashboard/`
- **Result**: Clean exit code 0 (`tsc -b && vite build` built in 1.05s).

---

## 23. Manual Verification
- **Flow A (Unified Profile)**: Counselor opens Student Profile → sees accurate factual Current Care Status cards, Screening History, Triage, and the new Care Journey tab displaying Requests, Appointments, Follow-ups, and the chronological timeline.
- **Flow B (Provenance Links)**: Each appointment displays badge linking to originating request; each follow-up links to originating appointment.
- **Flow C (Privacy & Notes)**: Follow-up counselor notes render with amber confidentiality tags; students cannot inspect counselor internal notes. AI transcripts do not leak into the timeline.
- **Flow D (Historical Compatibility)**: Pre-existing appointments and follow-ups without foreign keys render cleanly with default provenance labels.

---

## 24. Remaining Risks
- **None identified**. All new data presentation relies strictly on existing validated contracts and indexes.

---

## 25. P12 Step 7 Readiness
- With Step 6 complete, the counselor longitudinal review and unified student profile are fully functional, authenticated, and verified.
- The project is now ready for **P12 Step 7: Final Closure & End-to-End Verification**.

---

P12 STEP 6 — COMPLETE
