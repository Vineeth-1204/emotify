# Priority 7 — Phase 5 — Step 5B
## Wellness Profile Clinical Decoupling & Remediation Report

**Date:** 2026-09-28  
**Scope:** Step 5B of Priority 7 Phase 5 (Wellness Profile Decoupling from Clinical Screening & Triage)  
**Status:** COMPLETE & VERIFIED  

---

### 1. Existing `wellnessProfiles` Behavior (Pre-Remediation)
Prior to this remediation, `convex/wellness.ts:updateProfile` queried clinical assessment data directly:
- Queried `screeningAttempts` (and fallback `screenings`) for the user's latest clinical scores.
- Inferred subjective, pseudo-diagnostic personality traits and wellness goals directly from standardized clinical psychometric instruments (PHQ-9 and GAD-7):
  - `GAD-7 > 10` $\rightarrow$ Added `"Sensitive to stress"` to `personality_traits`.
  - `PHQ-9 > 15` $\rightarrow$ Added `"Needs gentle support"` to `personality_traits`.
  - `PHQ-9 > 10` $\rightarrow$ Added `"Gentle recovery"` to `wellness_goals`.
  - `PHQ-9 > 5` $\rightarrow$ Added `"Improve mood"` to `wellness_goals`.
  - `GAD-7 > 5` $\rightarrow$ Added `"Build daily habits"` to `wellness_goals`.
  - `avgIntensity > 7` $\rightarrow$ Inferred `"Easily stressed during pressure"`.
- This violated medical domain separation by conflating formal clinical screening and risk triage with non-clinical, self-guided student wellness reflection.

---

### 2. Clinical Inference Removed
The following clinical inferences and dependencies were **completely removed**:
1. **Screening Table Queries Excluded:** `screeningAttempts` and `screenings` are no longer queried, read, or referenced in `convex/wellness.ts`.
2. **Clinical Personality Traits Removed:**
   - Removed `GAD-7 > 10` $\rightarrow$ `"Sensitive to stress"`.
   - Removed `PHQ-9 > 15` $\rightarrow$ `"Needs gentle support"`.
3. **Clinical Goals Inferences Removed:**
   - Removed `PHQ-9 > 10` $\rightarrow$ `"Gentle recovery"`.
   - Removed `PHQ-9 > 5` $\rightarrow$ `"Improve mood"`.
   - Removed `GAD-7 > 5` $\rightarrow$ `"Build daily habits"` from clinical score triggers.
4. **Diagnostic Framing of Intensity Removed:**
   - Removed `"Easily stressed during pressure"`.
   - Replaced with purely descriptive, non-stigmatizing telemetry summaries.

---

### 3. Final Non-Diagnostic Behavior
`wellnessProfiles` is now strictly a **non-diagnostic behavioral habit and self-reflection summary**:
- **Inputs:** Purely non-clinical telemetry and habit records:
  - `emotionLogs` (recent logged emotional intensity and timing)
  - `microGoals` (habit goal completion)
  - `jpmrLogs` (relaxation exercise completion)
- **Derived Fields (Schema Preserved):**
  - `personality_traits`: Non-diagnostic behavioral descriptors:
    - Defaults to `["Self-reflective"]`.
    - `jpmrLogs.length > 3` $\rightarrow$ Adds `"Values relaxation"`.
    - `completedGoals > 3` $\rightarrow$ Adds `"Consistent and improving"`.
  - `mood_pattern`: Descriptive summary of logged emotional intensity without clinical or diagnostic labels:
    - Average intensity > 7 $\rightarrow$ `"Expressive emotional intensity"`.
    - Average intensity > 4 $\rightarrow$ `"Moderate emotional shifts"`.
    - Default $\rightarrow$ `"Mostly calm and stable"`.
  - `wellness_goals`: Habit- and routine-oriented focus areas:
    - Defaults to `["Build daily habits", "Practice mindfulness"]`.
    - `jpmrLogs.length < 2` $\rightarrow$ Adds `"Explore relaxation"`.
    - `completedGoals > 0` $\rightarrow$ Adds `"Maintain daily momentum"`.
  - `energy_pattern`: Retains timezone-aware morning/evening engagement calculation (`"Morning person"` vs `"Evening person"`).
  - `last_updated`: Millisecond timestamp.

---

### 4. Files Modified
- [`convex/wellness.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/wellness.ts):
  - Removed queries to `screeningAttempts` and `screenings`.
  - Excised all clinical score thresholds and diagnostic personality/goal inferences.
  - Retained safe non-clinical summaries based on `emotionLogs`, `microGoals`, and `jpmrLogs`.
  - Added authorization check (`assertCanAccessStudent`) so students can only update their own profile and staff can only access authorized students.
- [`convex/priority7.test.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/priority7.test.ts):
  - Added dedicated test suite `WELLNESS-5B-01` through `WELLNESS-5B-08`.

---

### 5. Authorization Verification
- `getProfile`: Protected by `assertCanAccessStudent(ctx, targetUserId)`. Students can only inspect their own profile; counselors can only inspect profiles of students assigned to them.
- `updateProfile`: Enforces `identity.subject`. If an explicit `userId` is passed and differs from `identity.subject`, `assertCanAccessStudent` is executed, preventing cross-student manipulation.
- Counselor dashboard has **zero dependency** on `wellnessProfiles` (verified by grep search across `dashboard/src`). Counselors inspect objective telemetry via `insights.getCounselorStudentDailyCheckins` and clinical assessments via `screeningAttempts` / `clinicalTimelines`.
- No raw AI dialogue or screening details are written or exposed through `wellnessProfiles`.

---

### 6. Historical-Data Handling
- Existing historical `wellnessProfiles` documents remain completely valid and readable by `getProfile`.
- No destructive migration, heuristic backfill, or table rewrites were performed.
- Subsequent calls to `updateProfile` overwrite fields with the sanitized non-clinical values.

---

### 7. Tests Added
The following 8 targeted tests were implemented in `convex/priority7.test.ts`:
- **`WELLNESS-5B-01`**: `wellnessProfiles` no longer derives personality traits from PHQ-9 (e.g. score 24 does not inject `"Needs gentle support"`).
- **`WELLNESS-5B-02`**: `wellnessProfiles` no longer derives personality traits from GAD-7 (e.g. score 21 does not inject `"Sensitive to stress"`).
- **`WELLNESS-5B-03`**: `wellnessProfiles` no longer derives wellness goals from PHQ/GAD scores (e.g. scores do not inject `"Gentle recovery"` or `"Improve mood"`).
- **`WELLNESS-5B-04`**: Non-clinical wellness data remains available where safely supported (JPMR logs trigger `"Values relaxation"`; microGoals trigger `"Consistent and improving"` and `"Maintain daily momentum"`).
- **`WELLNESS-5B-05`**: Student authorization remains strictly enforced (cross-student query and mutation return Unauthorized).
- **`WELLNESS-5B-06`**: Existing historical `wellnessProfiles` records remain readable without alteration.
- **`WELLNESS-5B-07`**: No screening, triage, or alert records are created, deleted, or modified by `updateProfile`.
- **`WELLNESS-5B-08`**: No Priority 8 intervention/recommendation logic or machine-learning fields are introduced into the profile payload.

---

### 8. Full Verification Results

#### Vitest Suite
```bash
npx vitest run
```
**Result:**
- **Test Files:** 12 passed (12)
- **Tests:** 222 passed (222)
- **New Tests:** 8 passed (Step 5B)
- **Baseline Regressions:** 0 (all 214 prior baseline tests remain 100% passing)

#### TypeScript Compilation
```bash
npx tsc --noEmit
```
**Result:** Clean (Exit code 0, 0 errors).

#### Counselor Dashboard Build
```bash
npm run build --prefix dashboard
```
**Result:** Clean production build:
- `dist/index.html` 0.66 kB
- `dist/assets/index-DtVgz1y3.css` 12.37 kB
- `dist/assets/index-nSe53tHL.js` 897.65 kB
- Built in 6.18s (Exit code 0).

---

### 9. Explicit Scope Exclusions (Strict Stopping Rule)
In strict accordance with the prompt instructions:
- **Priority 8 NOT started.**
- **Step 5C, 5D, 5E NOT implemented.**
- **Reassessment scheduling NOT implemented.**
- **Student voluntary reassessment NOT implemented.**
- **Historical-risk Step 2C NOT implemented.**
- **No changes made to clinical scoring (PHQ-9, GAD-7, PQ-16).**
- **No changes made to triage thresholds or safety alerts.**
- **No background cron jobs or automated profiling engines added.**
