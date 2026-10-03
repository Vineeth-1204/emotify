# Priority 11 — Step 3: Core Metric Correctness & Data Minimization

## 1. Status

**IMPLEMENTATION COMPLETE — ALL CHECKS PASSING**

- **Full Vitest Suite:** 367 / 367 tests passing (19 test files)
- **TypeScript:** Clean (0 errors via `npx tsc --noEmit`)
- **Dashboard Production Build:** Clean (0 errors, built in 756ms via `npm run build`)
- **Scope Compliance:** Strict adherence to Step 3 boundaries; zero modifications to clinical scoring, triage, Mitra, or Step 4/5 features.

---

## 2. Changes Implemented

| # | Domain | File | Description |
|---|--------|------|-------------|
| 1 | Calm Points Bug | [`convex/insights.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/insights.ts) | Filtered micro-goals by `completed === true` before summing points in `getDailyStats`. Incomplete and skipped goals now contribute 0 points. |
| 2 | Data Minimization | [`convex/insights.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/insights.ts) | Stripped unrendered clinical diagnostic arrays (`screenings`, `triages`) from `getDailyStats` response. Removed redundant unbounded database scans across `screeningAttempts`, `screenings`, and `triages`. |
| 3 | Student Profile CSV Export | [`app/(auth)/(tabs)/profile.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/(tabs)/profile.tsx) | Migrated student CSV export to query dedicated `api.screening.getAll` instead of relying on leaked clinical arrays from `getDailyStats`. |
| 4 | Synthetic DAU/WAU Removal | [`convex/dashboard.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/dashboard.ts) | Removed fabricated active-user formulas (`patients.length * 0.45` and `patients.length * 0.75`) and `mau` from `getEnterpriseAnalytics`. |
| 5 | Institutional Clinical Labels | [`dashboard/src/pages/Analytics.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/pages/Analytics.tsx) | Retitled KPI cards to `"Institutional Mean PHQ-9 (Depression Screening)"` and `"Institutional Mean GAD-7 (Anxiety Screening)"`. Replaced Active Users panel with `"Enrolled Students"`. Removed longitudinal recovery claims. |
| 6 | CBT Terminology Guardrail | [`dashboard/src/pages/PatientDetail.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/pages/PatientDetail.tsx) | Retitled CBT chart to `"Acute Session Tension Delta (Pre vs Post Exercise)"`. Retitled `"Recovery Plans Created"` to `"Action Plans Created"` and `"Recommended Goals in Recovery Plan"` to `"Recommended Goals in Action Plan"`. |
| 7 | Screening API Uniformity | [`convex/screening.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/screening.ts) | Added `status: "completed"` property to mapped `api.screening.getAll` objects to ensure behavioral consistency with `getLatest`. |
| 8 | Regression Suite | [`convex/priority11_step3.test.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/priority11_step3.test.ts) | Added 11 focused automated regression tests covering Calm Points correctness, payload minimization, DAU/WAU removal, and UI terminology guardrails. |
| 9 | Existing Tests Alignment | [`convex/priority7.test.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/priority7.test.ts) | Updated 7 legacy assertions to verify data minimization on `getDailyStats` (`screenings` and `triages` undefined) while validating screening retrieval via `api.screening.getAll`. Aligned `INSIGHT-3B-05` to assert 120 points for 8 completed goals (replacing old buggy 180 points expectation). |

---

## 3. Calm Points

### Before Behavior
In `convex/insights.ts`, `totalCalmPoints` was computed using:
```typescript
const totalCalmPoints = goals.reduce((acc, g) => acc + (g.points || 0), 0);
const completedGoalsCount = goals.filter(g => g.completed).length;
```
If a student had 10 goals worth 10 points each but only completed 2, `totalCalmPoints` awarded 100 points instead of 20. Incomplete and skipped goals improperly inflated points.

### After Behavior
In `convex/insights.ts`:
```typescript
const completedGoals = goals.filter((g) => g.completed === true);
const totalCalmPoints = completedGoals.reduce((acc, g) => acc + (g.points || 0), 0);
const completedGoalsCount = completedGoals.length;
```
- Incomplete goals contribute 0 points.
- Skipped goals contribute 0 points.
- Only goals with `completed === true` contribute their point value.
- Progression currency (`users.xp`) remains untouched.
- Legacy `points` table remains deprecated and untouched.

### Automated Test Coverage
- `CP-01`: All goals completed (sum of all points).
- `CP-02`: Mixed set (completed counted, incomplete & skipped excluded).
- `CP-03`: All goals incomplete (returns 0).
- `CP-04`: Zero-point goals and empty state (returns 0 without error).

---

## 4. Clinical Metric Labels

### Before Terminology (`dashboard/src/pages/Analytics.tsx`)
- Card Title 1: `Avg PHQ-9 Improvement`
- Card Subtitle 1: `Longitudinal depression reduction`
- Card Title 2: `Avg GAD-7 Improvement`
- Card Subtitle 2: `Longitudinal anxiety reduction`

### Flaw
These metrics calculate raw cross-sectional arithmetic means of all completed attempts ($\frac{\sum \text{scores}}{\text{count}}$). Labeling them as "Improvement" or "Longitudinal reduction" misrepresented cross-sectional scores as proven clinical progress.

### After Terminology (`dashboard/src/pages/Analytics.tsx`)
- Card Title 1: `Institutional Mean PHQ-9 (Depression Screening)`
- Card Subtitle 1: `Cross-sectional cohort mean`
- Card Title 2: `Institutional Mean GAD-7 (Anxiety Screening)`
- Card Subtitle 2: `Cross-sectional cohort mean`

### Safety Invariant
The underlying arithmetic average calculation remains identical. Prohibited terminology (`"Improvement"`, `"Reduction"`, `"Recovery"`) is removed. Verified by automated test `LABEL-01`.

---

## 5. CBT Terminology

### Before Terminology (`dashboard/src/pages/PatientDetail.tsx`)
- Chart Title: `Recovery Progress Chart` / `CBT Emotion Improvement Trend`
- Metric Label: `Recovery Plans Created`
- Detail View: `Recommended Goals in Recovery Plan`

### Flaw
Pre-to-post exercise tension delta (`emotionBefore` - `emotionAfter`) in a single CBT exercise is an acute, situational behavioral response to cognitive reframing. Terming it "Recovery Progress" violated clinical boundaries.

### After Terminology (`dashboard/src/pages/PatientDetail.tsx`)
- Chart Title: `Acute Session Tension Delta (Pre vs Post Exercise)`
- Metric Label: `Action Plans Created`
- Detail View: `Recommended Goals in Action Plan`

### Safety Invariant
The underlying calculation (`emotionBefore` vs `emotionAfter`) remains intact. The misleading "Recovery" claim is eliminated. Verified by automated test `LABEL-02`.

---

## 6. Student Insights Data Minimization

### Inspection of Callers
Every caller of `api.insights.getDailyStats` was analyzed:
1. `app/(auth)/(tabs)/insights.tsx` (Student Insights UI): Consumes `totalCalmPoints`, `completedGoalsCount`, `totalCheckins`, `dailyCheckins`, `recentDailyMood`, `emotionLogs`, `reframesCount`, `avgReframeDrop`, `jpmrMinutes`, `avgJpmrDrop`. **Does not render screenings, triages, or alerts.**
2. `app/(auth)/(tabs)/profile.tsx` (Student Profile Data Export): Invoked `getDailyStats` exclusively to access `exportData.screenings` in `handleExportData`.
3. `convex/priority7.test.ts`: Contained legacy assertions verifying that `getDailyStats` returned `screenings` and `triages`.

### Actions Taken
1. **Payload Minimization:** Stripped `screenings` and `triages` from `getDailyStats` return object in `convex/insights.ts`.
2. **Database Query Elimination:** Removed the unbounded `.collect()` queries for `screeningAttempts`, `screenings`, and `triages` from `getDailyStats`, eliminating privacy leakage and query overhead on every student visit to the Insights tab.
3. **Consumer Decoupling:** Migrated `app/(auth)/(tabs)/profile.tsx` to consume the authoritative, access-controlled `api.screening.getAll` query for CSV export, ensuring students can export their screening records without polluting behavioral telemetry.
4. **Test Alignment:** Updated `convex/priority7.test.ts` to assert that `stats.screenings` and `stats.triages` are `undefined` on `getDailyStats`, while verifying that `api.screening.getAll` returns the complete screening history.

---

## 7. Synthetic DAU/WAU

### Before Behavior (`convex/dashboard.ts:getEnterpriseAnalytics`)
```typescript
dau: Math.round(patients.length * 0.45),
wau: Math.round(patients.length * 0.75),
mau: patients.length,
```
The dashboard displayed:
```html
<p>{data?.dau || 0} / {data?.wau || 0} / {data?.mau || 0}</p>
<span>High institutional engagement</span>
```

### Action Taken
- **Backend:** Removed `dau`, `wau`, and `mau` fields and their fabricated multiplier calculations from `convex/dashboard.ts:getEnterpriseAnalytics`.
- **Frontend:** Replaced the vanity "Active Users (DAU / WAU / MAU)" card in `dashboard/src/pages/Analytics.tsx` with an empirical KPI:
  - Metric: `Enrolled Students`
  - Value: `{data?.totalPatients || 0}`
  - Subtitle: `Total registered cohort`
- **Header:** Updated subtitle from `"DAU/MAU activity, patient recovery outcomes..."` to `"Cohort population, institutional screening averages, CBT session completion rates, and clinical efficiency metrics."`
- **Deferred:** Genuine activity telemetry (distinct active calendar days/sessions) is deferred to future enterprise analytics architecture as established by the Step 2 decision contract.

---

## 8. Tests Added

A dedicated test suite [`convex/priority11_step3.test.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/priority11_step3.test.ts) was created with 11 focused tests:

| Test ID | Suite | Purpose |
|---------|-------|---------|
| `CP-01` | Calm Points | Verifies all completed goals are summed into `totalCalmPoints`. |
| `CP-02` | Calm Points | Verifies incomplete and skipped goals are excluded from `totalCalmPoints`. |
| `CP-03` | Calm Points | Verifies 0 points returned when all goals are incomplete. |
| `CP-04` | Calm Points | Verifies zero-point goals and empty state handle gracefully without errors. |
| `DM-01` | Data Minimization | Proves `getDailyStats` does NOT expose `screenings` or `screeningAttempts`. |
| `DM-02` | Data Minimization | Proves `getDailyStats` does NOT expose `triages` or `alerts`. |
| `DM-03` | Data Minimization | Verifies all required behavioral fields (`totalCheckins`, `dailyCheckins`, `recentDailyMood`, `jpmrMinutes`, `reframesCount`) remain functional. |
| `DAU-01` | DAU/WAU | Proves `getEnterpriseAnalytics` does not calculate or return synthetic `dau`, `wau`, or `mau`. |
| `DAU-02` | DAU/WAU | Verifies `getEnterpriseAnalytics` calculates accurate institutional mean scores for PHQ-9 and GAD-7. |
| `LABEL-01` | Terminology | Verifies `Analytics.tsx` does not contain prohibited reduction/improvement claims and includes approved institutional mean labels. |
| `LABEL-02` | Terminology | Verifies `PatientDetail.tsx` does not contain "Recovery Progress" or "Recovery Plans" and includes approved session tension delta labels. |

---

## 9. Validation

### 1. Focused Test Execution
```bash
npx vitest run convex/priority11_step3.test.ts
```
**Result:** 11 passed (11) in 101ms.

### 2. Full Test Suite Execution
```bash
npx vitest run
```
**Result:** 367 passed (367) across 19 test files in 6.59s. Zero failures.

### 3. TypeScript Compilation
```bash
npx tsc --noEmit
```
**Result:** Clean exit code 0. Zero errors.

### 4. Dashboard Production Build
```bash
cd dashboard && npm run build
```
**Result:**
```
✓ 2409 modules transformed.
dist/index.html                   0.66 kB │ gzip:   0.40 kB
dist/assets/index-DtVgz1y3.css   12.37 kB │ gzip:   3.18 kB
dist/assets/index-CQOdJbbh.js   902.55 kB │ gzip: 244.55 kB
✓ built in 756ms
```
Zero errors.

---

## 10. Regression Review

- **Priority 3 Screening:** Intact. `screeningAttempts` scoring, validation, and triage logic completely untouched. `api.screening.getAll` confirmed functional.
- **Priority 4 Auth/Provenance:** Intact. Student isolation, staff authorization, and rate limiting intact.
- **Priority 5 Longitudinal:** Intact. `screeningAttempts` completed attempt querying unaffected.
- **Priority 6 Student Home/Profile:** Intact. Student profile CSV export successfully uses `api.screening.getAll`.
- **Priority 7 Emotion/Reassessment:** Intact. All 88 tests in `convex/priority7.test.ts` passing. Daily check-in dateStr deduplication intact.
- **Priority 8 Reframe/Intervention:** Intact. All 52 tests in `convex/priority8.test.ts` passing. CBT session state and reframe logging intact.
- **Priority 9 CBT/Somatic Interventions:** Intact. Breathing, grounding, JPMR, and timeline integration intact (all 60 somatic tests passing).
- **Priority 10 Mitra AI:** Intact. Paused state strictly preserved. No edits to companion or LLM files.

---

## 11. Deferred Work (Step 4 & Step 5)

As required by the Step 2 contract and strict scope rules, the following items were **intentionally deferred**:
1. **Mood Trend Redesign (Step 4):** Transition from artificial 1–10 Bézier line interpolation to calendar chip/card representation.
2. **Breathing/Grounding in Student Insights (Step 4):** Adding Priority 9 intervention metrics under "Mindful Relaxation" to the mobile Insights tab.
3. **Timezone Contract Remediation (Step 5):** Bounding and converting local calendar queries across midnight boundaries in dashboard analytics.
4. **Query Bounding & Pagination (Step 5):** Replacing remaining unbounded `.collect()` calls with indexed `.take()` or pagination cursors.
5. **Genuine DAU/WAU Telemetry Architecture (Step 5):** Building empirical active-session counters.
6. **Longitudinal Clinical Outcome Metrics:** Baseline-to-latest individual $\Delta$ calculations.
7. **WSAS & ReQoL-10 Activation:** Pending approved instrument licensing and scoring content.
8. **Priority 10 Safety & Privacy Alignment:** Paused pending institutional clinical sign-off.

---

## 12. Scope Confirmation

- No clinical scoring algorithms were altered.
- No triage rules or thresholds were changed.
- No questionnaire content was modified.
- WSAS and ReQoL-10 remain inactive.
- Priority 10 Mitra files were not touched.
- No Priority 12+ work was started.
- No database tables or schema fields were deleted.

---

## 13. Final Recommendation

Priority 11 Step 3 is **COMPLETE**, fully validated, and ready for review. All core metric correctness, labeling, and data-minimization objectives have been achieved with 100% test passing rate and zero production regressions.
