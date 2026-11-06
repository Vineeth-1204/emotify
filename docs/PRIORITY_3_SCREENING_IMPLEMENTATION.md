# Priority 3 Step 2: Clinical Screening Architecture Implementation

## Executive Summary

In Priority 3 Step 2, we have established a clinically rigorous, five-instrument screening architecture for Emotify. The implementation transitions the application from a fragmented screening prototype (with hardcoded zero values and disconnected instruments) into a unified, server-authoritative clinical screening engine.

### Status Classification
- **PHQ-9 (Mood & Energy)**: `IMPLEMENTED` (9 items, item-level responses, Item 9 suicide signal, server-side validated scoring, clinical severity interpretation).
- **GAD-7 (Calm & Focus)**: `IMPLEMENTED` (7 items, item-level responses, server-side validated scoring, clinical anxiety severity bands).
- **PQ-16 (Perception & Thoughts)**: `IMPLEMENTED` (16 items, mounted in UI, genuine scoring, psychosis cutoff $\ge 6$, hardcoded zero removed, alerts integrated).
- **WSAS (Daily Functioning)**: `WAITING FOR APPROVED CONTENT` (Architecture, data model, validation interfaces, and persistence slots implemented; clinical questions withheld per safety rule).
- **ReQoL-10 (Quality of Life)**: `WAITING FOR APPROVED CONTENT` (Architecture, data model, validation interfaces, and persistence slots implemented; clinical questions withheld per safety rule).
- **Screening Attempt Architecture**: `IMPLEMENTED` (Multi-attempt history, non-destructive, item-level response mapping, server-side authoritative calculation, backward compatible dashboard mirroring).

---

## 1. New Architecture

```
Student Screening UI
  │
  ├─► PHQ-9 (9 items) ──┐
  ├─► GAD-7 (7 items) ──┼──► Item-Level Responses Map (phq9_q1: 2, gad7_q3: 1, pq16_q5: 1)
  └─► PQ-16 (16 items) ─┘
            │
            ▼
Convex Backend: `api.screening.submitScreeningAttempt`
  │
  ├── 1. Authoritative Validation (`clinicalScoring.ts`)
  │      - Validates item keys, completeness (all 9, 7, 16 items answered)
  │      - Enforces allowed option ranges (0–3 for PHQ-9/GAD-7, 0–1 for PQ-16)
  │
  ├── 2. Clinical Scoring & Severity Interpretation
  │      - Authoritative server-side summation (discards client-submitted aggregate claims)
  │      - Computes validated severity bands (Minimal, Mild, Moderate, Moderately Severe, Severe)
  │      - Evaluates critical safety flags (PHQ-9 Item 9 > 0, PQ-16 ≥ 6)
  │
  ├── 3. Clinical Triage Evaluation
  │      - Evaluates triage level (`suicide_flag` > `psychosis_flag` > `severe` > `moderate` > `mild`)
  │      - Checks delta vs historical screening for score escalation alerts
  │
  ├── 4. Persistence Layer (Non-destructive Multi-attempt)
  │      ├─► `screeningAttempts`: Full attempt record with item responses, versions, and clinical results
  │      ├─► `triages`: Official triage record
  │      ├─► `alerts`: Counselor notification (if safety or escalation triggered)
  │      └─► `screenings`: Backward-compatible mirror with genuine `pq16_total` for counselor dashboard
  │
  ▼
Downstream Consumers
  ├─► Mobile Tab Home (`index.tsx`): Dynamic progress calculation & status
  ├─► Counselor Dashboard (`PatientDetail.tsx`): Real scores without unadministered zero distortions
  └─► Longitudinal History: `getAllAttempts` and `getAttemptById` for clinical audit
```

---

## 2. Database Changes

### A. New Table: `screeningAttempts`
Located in [`convex/schema.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/schema.ts):
```typescript
screeningAttempts: defineTable({
  userId: v.string(),
  patientId: v.optional(v.string()),
  status: v.string(), // "in_progress" | "completed" | "abandoned"
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  instrumentVersions: v.object({
    phq9: v.string(),
    gad7: v.string(),
    pq16: v.string(),
    wsas: v.optional(v.string()),
    reqol10: v.optional(v.string()),
  }),
  responses: v.object({
    phq9: v.optional(v.record(v.string(), v.number())),
    gad7: v.optional(v.record(v.string(), v.number())),
    pq16: v.optional(v.record(v.string(), v.number())),
    wsas: v.optional(v.record(v.string(), v.number())),
    reqol10: v.optional(v.record(v.string(), v.number())),
  }),
  results: v.object({
    phq9: v.object({
      administered: v.boolean(),
      score: v.number(),
      maxScore: v.number(),
      severity: v.string(),
      level: v.string(),
      item9Score: v.number(),
      item9Flag: v.boolean(),
    }),
    gad7: v.object({
      administered: v.boolean(),
      score: v.number(),
      maxScore: v.number(),
      severity: v.string(),
      level: v.string(),
    }),
    pq16: v.object({
      administered: v.boolean(),
      score: v.number(),
      maxScore: v.number(),
      severity: v.string(),
      level: v.string(),
    }),
    wsas: v.optional(
      v.object({
        administered: v.boolean(),
        score: v.number(),
        maxScore: v.number(),
        severity: v.string(),
        level: v.string(),
      })
    ),
    reqol10: v.optional(
      v.object({
        administered: v.boolean(),
        score: v.number(),
        maxScore: v.number(),
        severity: v.string(),
        level: v.string(),
      })
    ),
  }),
  triageLevel: v.string(),
  suicideFlag: v.boolean(),
  psychosisFlag: v.boolean(),
  triageId: v.optional(v.id("triages")),
  screeningId: v.optional(v.id("screenings")),
})
  .index("by_userId", ["userId"])
  .index("by_status", ["status"])
  .index("by_startedAt", ["startedAt"]);
```

### B. Legacy Table Modification: `screenings`
Added an optional `attemptId: v.optional(v.string())` field to maintain a bidirectional pointer between legacy records and authoritative screening attempts.

---

## 3. Questionnaire Model

In [`constants/Screening.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/constants/Screening.ts), we introduced the common `QuestionnaireDefinition` contract:

```typescript
export interface QuestionnaireDefinition {
  id: ScreeningInstrumentId;
  title: string;
  shortTitle: string;
  description: string;
  instruction: string;
  version: string;
  status: 'active' | 'pending_approved_content';
  questionCount: number;
  minScore: number;
  maxScore: number;
  questions: ScreeningQuestion[];
  options: ScreeningOption[];
}
```

Registered instruments in `INSTRUMENT_DEFINITIONS`:
1. `phq9`: Version `PHQ-9.v1`, 9 items, max score 27, status `active`.
2. `gad7`: Version `GAD-7.v1`, 7 items, max score 21, status `active`.
3. `pq16`: Version `PQ-16.v1`, 16 items, max score 16, status `active`.
4. `wsas`: Version `WSAS.v1`, 5 items, max score 40, status `pending_approved_content` (questions: `[]`).
5. `reqol10`: Version `ReQoL-10.v1`, 10 items, max score 40, status `pending_approved_content` (questions: `[]`).

---

## 4. Screening Attempt Model

- Previous implementation stored a single flat record in `screenings`, which failed to capture repeated attempts cleanly and lacked item responses.
- The new `screeningAttempts` collection records each attempt independently with `startedAt`, `completedAt`, and `status: "completed"`.
- Subsequent assessments create new documents rather than overwriting historical records.
- Longitudinal queries `api.screening.getAllAttempts` and `api.screening.getLatestAttempt` return complete historical trajectories.

---

## 5. Item-Level Response Model

Individual item selections are captured during assessment and persisted as a structured dictionary:
```json
{
  "phq9": {
    "phq9_q1": 2,
    "phq9_q2": 1,
    "phq9_q9": 0
  },
  "gad7": {
    "gad7_q1": 1,
    "gad7_q2": 2
  },
  "pq16": {
    "pq16_q1": 0,
    "pq16_q2": 1
  }
}
```
The backend parser supports normalized item keys (`phq9_q1`, `q1`, `1`) transparently.

---

## 6. Scoring Flow

The client calculates provisional scores solely for immediate visual feedback in the UI cards. The authoritative scoring occurs strictly server-side in [`convex/clinicalScoring.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/clinicalScoring.ts):
1. **Validation**: Checks that all items are present and within valid bounds ($0 \le v \le 3$ for PHQ-9/GAD-7, $0 \le v \le 1$ for PQ-16).
2. **Summation**: Calculates total authoritative score.
3. **Band Derivation**:
   - PHQ-9: Minimal (0–4), Mild (5–9), Moderate (10–14), Moderately Severe (15–19), Severe (20–27).
   - GAD-7: Minimal (0–4), Mild (5–9), Moderate (10–14), Severe (15–21).
   - PQ-16: Low Risk (0–5), Prodromal Psychosis Risk Flagged ($\ge 6$).
4. **Safety Signal Extraction**:
   - Isolates Item 9 value (`phq9_q9`).
   - Flags `suicideFlag = true` if `phq9_q9 > 0`.

---

## 7. PQ-16 Connection

### Problems Solved:
1. **Previous Disconnection**: PQ-16 was defined in constants but omitted from the active screening list.
2. **Hardcoded Zero Removed**: The client and backend previously hardcoded `pq16_total = 0`.
3. **Dead Clinical Logic Activated**: The triage threshold (`pq16_total >= 6 -> psychosis_flag`) is now reachable.

### Implementation:
- Mounted in [`app/(auth)/screening.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/%28auth%29/screening.tsx) under `Perception & Thoughts Check`.
- Uses approved 16 items with "No" (0) and "Yes" (1) options and existing instructions.
- Captured item-level answers are transmitted and scored server-side.
- Stored as genuine score in `screeningAttempts.results.pq16.score` and mirrored to `screenings.pq16_total`.
- Triggers `psychosis_flag` and creates a counselor alert when score $\ge 6$.

---

## 8. WSAS Status: `WAITING FOR APPROVED CONTENT`

- **Safety Compliance**: In accordance with the Critical Safety Rule, no questions or answer options were invented, paraphrased, or fabricated.
- **Architectural Readiness**:
  - `WSAS_CONFIG` defined with 5 questions, 0–8 scale, max score 40.
  - Severity thresholds defined (Subclinical: 0–9, Significant Impairment: 10–20, Severe Impairment: 21–40).
  - Validation function `scoreWSASResponses` created.
  - Unadministered status returns `Not Administered (Pending Approved Content)` with score `0` (never disguised as a negative or completed score).
  - Stored in optional slots in `screeningAttempts.responses.wsas` and `screeningAttempts.results.wsas`.

---

## 9. ReQoL-10 Status: `WAITING FOR APPROVED CONTENT`

- **Safety Compliance**: Validated clinical questions withheld pending licensed/authorized source text.
- **Architectural Readiness**:
  - `REQOL10_CONFIG` defined with 10 questions, 0–4 scale, max score 40.
  - Population norm benchmark defined ($< 24$ below norm).
  - Validation function `scoreReQoL10Responses` created.
  - Unadministered status returns `Not Administered (Pending Approved Content)` with score `0`.
  - Schema slots available in `screeningAttempts`.

---

## 10. Triage Integration

Clinical triage evaluation is isolated in `evaluateClinicalTriage` in [`convex/clinicalScoring.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/clinicalScoring.ts):

| Priority Order | Rule | Triage Level | Alert Generated |
|:---|:---|:---|:---|
| 1 | `item9Score > 0` | `suicide_flag` | Yes (`type: "suicide"`) |
| 2 | `pq16Score >= 6` | `psychosis_flag` | Yes (`type: "psychosis"`) |
| 3 | `phq9Score >= 15` or `gad7Score >= 15` | `severe` | Yes (`type: "severe"`) |
| 4 | `phq9Score >= 10` or `gad7Score >= 10` | `moderate` | No |
| 5 | Default | `mild` | No |
| Escalation | PHQ-9 or GAD-7 increased by > 5 pts vs prior attempt | Escalation alert | Yes (`type: "escalation"`) |

---

## 11. Backward Compatibility

1. **Existing Records**: All existing rows in `screenings` remain intact and readable via `api.screening.getLatest` and `api.screening.getAll`.
2. **Dashboard Continuity**: `PatientDetail.tsx` continues to query `api.screening.getAll`. Because `submitScreeningAttempt` mirrors the validated results into `screenings` (with genuine `pq16_total`), the counselor dashboard immediately reflects true clinical data without needing code changes in this step.
3. **Dynamic Progress Count**: Replaced the hardcoded constant `TOTAL_QUESTIONS = 47` in [`app/(auth)/(tabs)/index.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/%28auth%29/%28tabs%29/index.tsx) with `ACTIVE_SCREENING_QUESTIONS_COUNT` ($9 + 7 + 16 = 32$), so student progress bar reaches 100% accurately upon completing active questionnaires.

---

## 12. Verification & Test Results

A dedicated test suite was built in [`convex/screening.test.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/screening.test.ts) covering all 14 mandatory validation scenarios:

| # | Test Scenario | Result |
|:---|:---|:---|
| 1 | PHQ-9 answers produce correct score & severity | **PASS** |
| 2 | GAD-7 answers produce correct score & severity | **PASS** |
| 3 | PQ-16 is actually administered and scored | **PASS** |
| 4 | PQ-16 is no longer hardcoded to zero in database records | **PASS** |
| 5 | Item-level answers are persisted in `screeningAttempts` | **PASS** |
| 6 | Multiple screening attempts do not overwrite previous records | **PASS** |
| 7 | Invalid question IDs or missing items are rejected | **PASS** |
| 8 | Invalid PQ-16 responses (non-binary) are rejected | **PASS** |
| 9 | Backend calculates authoritative scores independently of client | **PASS** |
| 10 | PHQ-9 Item 9 triggers immediate `suicide_flag` and alert | **PASS** |
| 11 | Missing WSAS content is not presented as a completed questionnaire | **PASS** |
| 12 | Missing ReQoL-10 content is not presented as a completed questionnaire | **PASS** |
| 13 | Legacy screening records remain fully readable | **PASS** |
| 14 | Screening completion is rejected when required instruments are missing | **PASS** |

### Execution Commands:
- `npx vitest run`: **26/26 tests passed across entire repository** (14 screening tests, 10 auth tests, 2 CBT tests).
- `npx tsc --noEmit`: **0 TypeScript compilation errors**.

---

## 13. Remaining Work

1. **Approved Clinical Content for WSAS & ReQoL-10**:
   - Obtain validated question wording, response scales, and instructions for WSAS (5 items) and ReQoL-10 (10 items).
   - Once provided, add question arrays to `INSTRUMENT_DEFINITIONS.wsas` and `INSTRUMENT_DEFINITIONS.reqol10`, switch status from `pending_approved_content` to `active`, and add to `SCREENING_ORDER`.
2. **Counselor Dashboard Item-Level Drawer (Priority 3 Step 3)**:
   - Enhance counselor `PatientDetail.tsx` view with a drill-down modal/drawer displaying the item-level breakdown from `api.screening.getLatestAttempt` (e.g. reviewing specific PQ-16 perceptual distortions or PHQ-9 Item 9 scores).
