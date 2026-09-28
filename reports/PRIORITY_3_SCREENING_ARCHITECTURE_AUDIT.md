# EMOTIFY — Priority 3 Screening Architecture Audit

## 1. Executive Summary

This audit assesses the current state of the Clinical Screening Questionnaire Architecture in the EMOTIFY application following the completion of Priority 1 (existing codebase audit) and Priority 2 (student authentication and registration).

### Core Findings
1. **Active Instruments in Student Flow**: Only **PHQ-9** (9 items) and **GAD-7** (7 items) are active in the student screening UI (`app/(auth)/screening.tsx`).
2. **PQ-16 Status**: PQ-16 question definitions (16 items) and a scoring helper exist in `constants/Screening.ts` and `utils/scoring.ts`. However, PQ-16 is **completely bypassed** by the student screening UI. When the student submits their assessment, `pq16_total` is **hard-coded to 0** in both `api.screening.submitScreening` and `api.triage.processTriage`. As a result, the clinical psychosis triage threshold (`pq16_total >= 6`) is unreachable dead code at runtime.
3. **WSAS & ReQoL-10 Status**: Neither questionnaire has questions, answer options, instructions, or scoring functions defined in the codebase. They exist only as optional numeric fields (`wsas_total`, `reqol10_total`) in `convex/schema.ts`, defaulted to `0` upon submission.
4. **Data Loss (Item-Level Responses)**: Raw question responses are **never saved** to the database. Only aggregate scores (`phq9_total`, `gad7_total`, `pq16_total: 0`, `phq9_item9_flag`, `phq9_item9_score`) are persisted in the `screenings` table. Counselors cannot inspect which specific symptoms or questions were endorsed.
5. **Historical Retention vs. Schema Structure**: Multiple screening submissions are preserved chronologically by `createdAt`, but each record is stored as a flat document rather than a structured screening attempt containing modular questionnaire responses.
6. **Severity Classification Disconnect**: Clinical severity cutoffs (Minimal, Mild, Moderate, Moderately Severe, Severe) are not calculated or stored in Convex. They are partially re-implemented ad-hoc in client UI components (`ScreeningCentre.tsx`).

---

## 2. Current Screening Flow

```
Student completes Onboarding / Demographics
         ↓
Redirected to `app/(auth)/screening.tsx`
         ↓
Local Draft Check (Loads `screening_progress_${user.id}` from SecureStore)
         ↓
Screening Hub renders 2 cards:
  • PHQ-9 ("Mood & Energy Check")
  • GAD-7 ("Calm & Focus Check")
         ↓
Student selects an instrument → `components/screening/Questionnaire.tsx`
         ↓
Question-by-Question Navigation (Next / Prev / Radio Option Selection)
         ↓
Instrument Completed → Returned to Screening Hub with progress bar updated
         ↓
When both PHQ-9 and GAD-7 are complete:
Student taps "Submit Assessment"
         ↓
`finishScreening()` executes:
  1. `scorePHQ9(answers.phq9)` calculates `phq9_total`, `item9Score`, `item9Flag`
  2. `scoreGAD7(answers.gad7)` calculates `gad7_total`
  3. `runTriage()` runs client-side (result is calculated but discarded)
  4. Calls `api.screening.submitScreening` with:
     - `phq9_total`
     - `gad7_total`
     - `pq16_total: 0` (HARDCODED)
     - `phq9_item9_flag`
     - `phq9_item9_score`
  5. Calls `api.triage.processTriage` with:
     - `phq9_total`
     - `gad7_total`
     - `pq16_total: 0` (HARDCODED)
     - `phq9_item9_score`
  6. Calls `api.followUps.scheduleFollowUp({ userId, level })`
  7. Calls `api.users.markScreeningComplete({ clerkId: user.id })`
  8. Deletes `screening_progress_${user.id}` from `SecureStore`
  9. Navigates to `/(auth)/(tabs)` (Student Dashboard)
```

---

## 3. Instrument Status

| Instrument | Questions | UI | Scoring | Persistence | Triage | Dashboard | Status |
|---|---|---|---|---|---|---|---|
| **PHQ-9** | ✅ Defined (9 items) | ✅ Rendered | ✅ Dynamic sum | ✅ Total + Item 9 saved (no item responses) | ✅ Item 9 & Score thresholds active | ✅ Displayed (Stats, Trend, Table) | **IMPLEMENTED** (Lacks item-level response persistence) |
| **GAD-7** | ✅ Defined (7 items) | ✅ Rendered | ✅ Dynamic sum | ✅ Total saved (no item responses) | ✅ Threshold active ($\ge 15$, $10-14$) | ✅ Displayed (Stats, Trend, Table) | **IMPLEMENTED** (Lacks item-level response persistence) |
| **PQ-16** | ✅ Defined (16 items) | ❌ Omitted from UI | ⚠️ Helper exists, never called | ❌ Hardcoded to 0 in mutation call | ⚠️ Logic exists ($\ge 6$), but receives 0 | ⚠️ Table column exists, always shows `0 / 16` | **DEFINED BUT DISCONNECTED** |
| **WSAS** | ❌ Absent | ❌ Absent | ❌ Absent | ⚠️ Schema slot only (`wsas_total ?? 0`) | ❌ Ignored in triage logic | ❌ Not displayed in table or charts | **MISSING** |
| **ReQoL-10** | ❌ Absent | ❌ Absent | ❌ Absent | ⚠️ Schema slot only (`reqol10_total ?? 0`) | ❌ Ignored in triage logic | ❌ Not displayed in table or charts | **MISSING** |

---

## 4. Questionnaire Architecture

### A. Question Definitions (`constants/Screening.ts`)
- **PHQ-9**:
  - Constant: `PHQ9_QUESTIONS` (9 items, IDs 1–9).
  - Item 9: `"Thoughts that you would be better off dead, or of hurting yourself in some way"`.
  - Options: `PHQ9_OPTIONS` (4 choices: `Not at all` = 0, `Several days` = 1, `More than half the days` = 2, `Nearly every day` = 3).
  - Instruction: `PHQ9_INSTRUCTION` ("Over the last 2 weeks, how often have you been bothered by any of the following?").
- **GAD-7**:
  - Constant: `GAD7_QUESTIONS` (7 items, IDs 1–7).
  - Options: `GAD7_OPTIONS` (4 choices, values 0–3).
  - Instruction: `GAD7_INSTRUCTION` ("Over the last 2 weeks, how often have you been bothered by the following?").
- **PQ-16**:
  - Constant: `PQ16_QUESTIONS` (16 items, IDs 1–16).
  - Options: `PQ16_OPTIONS` (2 choices: `No` = 0, `Yes` = 1).
  - Instruction: `PQ16_INSTRUCTION` ("Please indicate whether you have experienced any of the following:").
  - Omission: Not included in `SCREENING_ORDER` (`export const SCREENING_ORDER = ['phq9', 'gad7'] as const;`).
- **WSAS & ReQoL-10**:
  - Completely absent. No interfaces, question texts, options, or instructions exist in `constants/Screening.ts`.

### B. UI Component (`components/screening/Questionnaire.tsx`)
- Single question presentation with progress indicator (`ProgressBar`).
- Radio button options with animated selection styles.
- Support for optional question explanation popups (`showExplanation`).
- Next/Previous navigation buttons with validation (Next disabled until option selected).
- Callbacks: `onAnswerChange` (per-question update) and `onComplete` (all questions answered).

---

## 5. Answer State Architecture

### A. In-Memory React State (`app/(auth)/screening.tsx`)
```typescript
type ScreeningState = Record<string, (number | null)[]>;

const [answers, setAnswers] = useState<ScreeningState>({
  phq9: new Array(PHQ9_QUESTIONS.length).fill(null),
  gad7: new Array(GAD7_QUESTIONS.length).fill(null),
});
```
- Initialized with arrays of `null` values for `phq9` (length 9) and `gad7` (length 7).
- PQ-16 is absent from state initialization.

### B. Local Persistence (Draft State)
- Stored in `expo-secure-store` using key: `screening_progress_${user.id}`.
- Serialized as JSON: `Record<string, (number | null)[]>`.
- Restored on component mount so students can leave and resume without losing progress.
- Cleared via `SecureStore.deleteItemAsync` only after successful Convex submission.

### C. Home Tab Progress Indicator Conflict
- In `app/(auth)/(tabs)/index.tsx`:
  ```typescript
  const TOTAL_QUESTIONS = 47; // PHQ9:9 + GAD7:7 + PQ16:16 + WSAS:5 + ReQoL10:10
  ```
- Because only 16 questions (9 + 7) exist in the active screening flow, `totalAnswered / TOTAL_QUESTIONS` can only ever reach $16 / 47 \approx 34\%$ if evaluated against this constant.

---

## 6. Scoring Architecture

### A. Scoring Implementation (`utils/scoring.ts`)
```typescript
export function scorePHQ9(answers: number[]): { total: number; item9Score: number; item9Flag: boolean } {
  const total = answers.reduce((sum, val) => sum + val, 0);
  const item9Score = answers[8] ?? 0;
  return { total, item9Score, item9Flag: item9Score > 0 };
}

export function scoreGAD7(answers: number[]): { total: number } {
  return { total: answers.reduce((sum, val) => sum + val, 0) };
}

export function scorePQ16(answers: number[]): { total: number } {
  return { total: answers.reduce((sum, val) => sum + val, 0) };
}
```

### B. Scoring Gaps
1. **Dynamic vs. Hardcoded**:
   - `scorePHQ9` and `scoreGAD7` dynamically calculate totals from state arrays.
   - `scorePQ16` is never invoked in `screening.tsx`.
   - `pq16_total` is hardcoded to `0` in `finishScreening()`.
2. **Missing Severity Classifications**:
   - `utils/scoring.ts` does not provide standardized severity bands:
     - PHQ-9: 0–4 None/Minimal, 5–9 Mild, 10–14 Moderate, 15–19 Moderately Severe, 20–27 Severe.
     - GAD-7: 0–4 Minimal, 5–9 Mild, 10–14 Moderate, 15–21 Severe.
     - PQ-16: $\ge 6$ positive responses indicates clinical prodromal psychosis risk.
3. **Missing WSAS & ReQoL-10 Scoring**:
   - No scoring logic exists in the codebase for WSAS (0–40 scale) or ReQoL-10 (0–40 scale).

---

## 7. Triage Architecture

### A. Clinical Triage Logic (`utils/triage.ts` & `convex/triage.ts`)
The clinical engine implements the following priority hierarchy:
1. **Priority 1: Suicide Risk**:
   - Condition: `phq9_item9_score > 0`.
   - Output: `level = 'suicide_flag'`, `suicideFlag = true`, `alertType = 'suicide'`, `requiresAlert = true`.
2. **Priority 2: Psychosis Risk**:
   - Condition: `pq16_total >= 6`.
   - Output: `level = 'psychosis_flag'`, `psychosisFlag = true`, `alertType = 'psychosis'`, `requiresAlert = true`.
3. **Priority 3: Severe Depression or Anxiety**:
   - Condition: `phq9_total >= 15 || gad7_total >= 15`.
   - Output: `level = 'severe'`, `alertType = 'severe'`, `requiresAlert = true`.
4. **Priority 4: Moderate Depression or Anxiety**:
   - Condition: `(phq9_total >= 10 && <= 14) || (gad7_total >= 10 && <= 14)`.
   - Output: `level = 'moderate'`, `requiresAlert = false`.
5. **Priority 5: Mild / Minimal**:
   - Default fallback.
   - Output: `level = 'mild'`, `requiresAlert = false`.

### B. Longitudinal Escalation Check (`convex/triage.ts:60–72`)
- Compares current submission with the user's previous screening document in `screenings`.
- If `phq9_total > previous.phq9_total + 5` or `gad7_total > previous.gad7_total + 5`:
  - Triggers an alert with `type = 'escalation'`, `status = 'pending'`.

### C. Alerts & Notifications
- If `requiresAlert` is true, an entry is inserted into the `alerts` table:
  ```typescript
  await ctx.db.insert("alerts", {
    userId,
    type: alertType || "general",
    status: "pending",
    createdAt: Date.now(),
  });
  ```

---

## 8. Convex / Data Architecture

### A. Current `screenings` Table Schema (`convex/schema.ts:85–95`)
```typescript
screenings: defineTable({
  userId: v.string(),
  phq9_total: v.number(),
  gad7_total: v.number(),
  pq16_total: v.number(),
  wsas_total: v.optional(v.number()),
  reqol10_total: v.optional(v.number()),
  phq9_item9_flag: v.boolean(),
  phq9_item9_score: v.number(),
  createdAt: v.number(),
}).index("by_userId", ["userId"]),
```

### B. Limitations of Current Schema
1. **Absence of Item-Level Responses**:
   - There is no field to store individual item answers (e.g. `{ item1: 2, item2: 0, ... }`).
   - Once submitted, it is impossible for a clinician to know which questions drove the score.
2. **Flattened Document instead of Modular Submissions**:
   - All instruments are combined into flat columns (`phq9_total`, `gad7_total`, `pq16_total`) on a single record.
   - It cannot accommodate administering instruments independently (e.g. administering just PHQ-9 during a follow-up or administering WSAS during a later check-in).
3. **No Patient ID Association**:
   - Stores `userId: v.string()` (Convex user ID or Clerk ID). Does not reference the clinical identifier `patientId` (e.g. "101").
4. **No Severity Rating Stored**:
   - Neither the severity category (e.g. "Moderate", "Severe") nor clinical notes are stored with the screening record.
5. **Historical Multi-Attempt Support**:
   - The table does preserve historical attempts because `submitScreening` inserts a new row with `createdAt: Date.now()`.
   - `api.screening.getAll` returns all historical records ordered by `createdAt desc`.

---

## 9. Student → Backend Data Flow

```
[ScreeningScreen.tsx]
   │
   ├─► scorePHQ9(answers.phq9) ─────────► { total, item9Score, item9Flag }
   ├─► scoreGAD7(answers.gad7) ─────────► { total }
   ├─► (PQ-16 bypassed) ────────────────► hardcoded pq16_total = 0
   │
   ├─► api.screening.submitScreening
   │      │
   │      └─► Inserts row into `screenings` table (Stores aggregate scores only)
   │
   ├─► api.triage.processTriage
   │      │
   │      ├─► Evaluates Item 9, PQ-16, PHQ-9, GAD-7
   │      ├─► Inserts row into `triages` table ({ level, suicideFlag, psychosisFlag })
   │      └─► If flagged, inserts row into `alerts` table ({ type, status: "pending" })
   │
   ├─► api.followUps.scheduleFollowUp
   │      │
   │      └─► Inserts follow-up task into `followUps` table based on triage level
   │
   └─► api.users.markScreeningComplete
          │
          └─► Patches user document: { screeningComplete: true }
```

---

## 10. Counselor Dashboard Data Flow

### A. Queries Used by Dashboard
1. **`api.dashboard.getEnterpriseAnalytics`** (`ScreeningCentre.tsx`):
   - Computes `avgPhqScore`, `avgGadScore`, and `riskDistribution` (mild, moderate, severe) across all enrolled patients.
2. **`api.screening.getAll`** (`PatientDetail.tsx`):
   - Fetches historical screening test rows for the selected patient.
   - Powers the "Clinical Score Trends" area chart (`PHQ9`, `GAD7` over time).
   - Populates the "Historical Screening Tests" data table:
     - Test Date (`createdAt`)
     - PHQ-9 (`phq9_total / 27`)
     - GAD-7 (`gad7_total / 21`)
     - PQ-16 (`pq16_total / 16`) — always shows `0 / 16`
     - Suicide Flag (`phq9_item9_flag` & `phq9_item9_score`)
3. **`api.triage.getLatestByUserId`** (`PatientDetail.tsx`):
   - Retrieves the active triage badge (e.g. `suicide_flag`, `severe`, `moderate`, `mild`).
4. **`api.dashboard.getAlerts`** (`AlertsCenter.tsx`):
   - Synthesizes and lists unresolved safety alerts, filtering by `suicideRisk`, `psychosisRisk`, and `deterioration`.

### B. Dashboard Blind Spots
- **Missing Item-Level View**: Counselors cannot expand a test result to see answers to specific questions.
- **PQ-16 Disconnect**: Counselors see "0 / 16" for PQ-16 and may assume the student tested negative for psychosis, whereas the student was never asked the questions.
- **WSAS & ReQoL-10**: The dashboard has no columns, cards, or views for WSAS or ReQoL-10.

---

## 11. Missing / Disconnected Components

1. **PQ-16 UI Integration**:
   - `PQ16_QUESTIONS` and `scorePQ16` exist, but `app/(auth)/screening.tsx` omits PQ-16 from its `INSTRUMENTS` configuration.
   - `pq16_total` is hardcoded to `0` in submissions.
2. **WSAS Implementation**:
   - Entirely absent except for schema column and triage input interface.
   - No questions, options, instructions, scoring, or UI exist.
3. **ReQoL-10 Implementation**:
   - Entirely absent except for schema column and triage input interface.
   - No questions, options, instructions, scoring, or UI exist.
4. **Item-Level Persistence**:
   - No table or field exists in Convex to record question-level answers.
5. **Centralized Severity Engine**:
   - Severity bands are computed ad-hoc in UI code instead of a single, validated clinical utility.
6. **Progress Mismatch in Tabs Home**:
   - Home tab progress expects 47 total questions, while screening only provides 16.

---

## 12. Risks / Architecture Problems

| Risk / Problem | Clinical / Technical Impact |
|---|---|
| **False-Negative Psychosis Risk** | Students with emerging psychosis symptoms are reported as `0 / 16` because PQ-16 is never presented, creating clinical liability. |
| **No Item Audit Trail** | If a student flags for self-harm (Item 9 = 2), counselors cannot view their other answers (e.g., severe sleep disturbance or feelings of worthlessness) to contextualize risk. |
| **Monolithic Screening Submission** | The flat `screenings` schema forces all instruments to be taken together; periodic or tool-triggered single re-assessments cannot be recorded cleanly. |
| **Client-Only Scoring Trust** | Scoring is performed on the React Native client before being sent to Convex. If a corrupted payload or modified client submits scores, the backend accepts them without recalculation from raw responses. |
| **Unanchored Follow-ups** | `scheduleFollowUp` inserts a record into `followUps`, but follow-up reminders are not linked to specific screening IDs. |

---

## 13. Recommended Priority 3 Implementation Order

For **Priority 3 Step 2 and beyond**, the work should proceed in the following structured sequence:

1. **Phase 1: Question Definition & Clinical Standardization**:
   - Verify official standardized wording for PQ-16.
   - Add official question definitions, options, and scoring for **WSAS** (5 items, 0–8 scale) and **ReQoL-10** (10 items, 0–4 scale).
   - Create a centralized severity classification utility (`utils/clinicalSeverity.ts`) mapping score ranges to standard clinical categories.
2. **Phase 2: Database Schema & Attempt Model**:
   - Upgrade Convex schema to persist:
     - Structured screening attempts with `patientId` and `userId`.
     - Item-level responses (storing actual question ID to score mappings).
     - Instrument-level scores and severities.
     - Overall triage level and safety flags.
   - Implement backend-verified scoring in Convex mutations to eliminate client trust issues.
3. **Phase 3: Student Screening UI Rebuild**:
   - Update `app/(auth)/screening.tsx` to include PQ-16 (and optionally WSAS/ReQoL-10 as clinically required).
   - Wire dynamic progress tracking across all active questionnaires.
   - Remove hard-coded `0` values from the submission payload.
4. **Phase 4: Triage & Alert Refinement**:
   - Connect dynamic PQ-16 scores directly to the psychosis alert engine.
   - Incorporate WSAS functional impairment thresholds into triage escalation.
5. **Phase 5: Counselor Dashboard Integration**:
   - Update `PatientDetail.tsx` to display true PQ-16 scores, WSAS/ReQoL-10 metrics, and an expandable item-level drilldown drawer.

---

## 14. Files Inspected

- [constants/Screening.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/constants/Screening.ts)
- [utils/scoring.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/utils/scoring.ts)
- [utils/triage.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/utils/triage.ts)
- [app/(auth)/screening.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/screening.tsx)
- [components/screening/Questionnaire.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/components/screening/Questionnaire.tsx)
- [app/(auth)/(tabs)/index.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/(tabs)/index.tsx)
- [convex/schema.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/schema.ts)
- [convex/screening.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/screening.ts)
- [convex/triage.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/triage.ts)
- [convex/users.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/users.ts)
- [convex/dashboard.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/dashboard.ts)
- [dashboard/src/pages/ScreeningCentre.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/pages/ScreeningCentre.tsx)
- [dashboard/src/pages/PatientDetail.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/pages/PatientDetail.tsx)
- [dashboard/src/pages/PatientsList.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/pages/PatientsList.tsx)
- [dashboard/src/pages/AlertsCenter.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/pages/AlertsCenter.tsx)
