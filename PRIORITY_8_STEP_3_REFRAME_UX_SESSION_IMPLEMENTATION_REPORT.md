# Priority 8 — Step 3: Reframe UX & Session State Remediation Implementation Report

**Status:** COMPLETE  
**Date:** 2026-09-28  
**Repository:** Emotify (`Vineeth-1204/emotify`)  
**Previous Verified Baseline:** 232 / 232 Vitest tests passing | TypeScript clean | Dashboard build clean  
**Current Verified Baseline:** 244 / 244 Vitest tests passing | TypeScript clean | Dashboard build clean  

---

## 1. Scope

This implementation step exclusively addresses the UX and session state-machine defects identified during the Priority 8 Step 1 Audit:
1. **P8-F04:** Repetitive Understanding Prompts in the CBT session flow.
2. **P8-F05 (Skip Question Defect):** Broken "Skip Question" behavior that injected fake chat messages ("I want to skip this question.") and invoked Gemini rather than executing a clean state-machine transition.
3. **P8-F07 (Stale Session Trap):** Indefinite resumption of incomplete, abandoned, or stale CBT sessions.

This step is strictly focused on **state-machine integrity, clean UX flow, and server-authoritative session lifecycle**.

---

## 2. Repetitive Prompt Remediation

**Target:** `convex/cbt.ts` (`handleMockResponse`, `submitMessage`, `callGeminiEngine`)

### Audit Finding Addressed:
During the `understanding` step, the system repeatedly returned the exact identical prompt string:
`"I hear you. That sounds really tough. What worries you the most about this situation?"`
for multiple turns until a hardcoded turn count was met.

### Implementation:
1. **Dynamic Context-Aware Follow-ups in Fallback/Mock Mode:**
   - **Turn 1 with brief/insufficient input (`< 15` chars):** Prompts for situational context (`"I'm listening. Could you tell me a little more about what happened or what's on your mind?"`).
   - **Turn 1 with situational input:** Acknowledges the situation and asks for the underlying worry (`"I hear you. That sounds really tough. What worries you the most about this situation?"`).
   - **Turn 2:** Directly reflects and validates the student's thought/fear (`"Thank you for being open about that. When you think you might fail or be a failure, what makes that fear feel so certain right now?"`).
   - **Anti-Repetition Failsafe:** Before sending any follow-up question, the engine checks all previous assistant messages in the conversation history and guarantees that no identical or duplicate prompt is returned.
2. **Natural Forward Progression:**
   - Meaningful comprehensive user input (describing situation, automatic thought, and emotional distress) allows the understanding engine to progress to `guided_discovery` without artificial stalling.
   - Preserves `understanding` step when user input is truly vague or insufficient, ensuring genuine CBT clarification when needed.
3. **Gemini Anti-Repetition Guard:**
   - Updated `callGeminiEngine` prompt instructions for `understanding` to explicitly forbid repeating or paraphrasing previously asked questions.
   - Added a runtime check in `submitMessage` so that if the AI model attempts to repeat the last assistant question, it is intercepted and replaced with an empathetic progress prompt.

---

## 3. Skip Question State-Machine Fix

**Targets:** `convex/cbt.ts`, `app/(auth)/tools/reframe.tsx`

### Audit Finding Addressed:
`handleSkipQuestion` in `reframe.tsx` previously sent the literal string `"I want to skip this question."` as normal chat input into `submitMessage`. This injected a fake user message into the student's chat log, called Gemini unnecessarily, and recorded `"I want to skip this question."` as the answer to cognitive challenge questions.

### Implementation:
1. **Explicit Backend Mutation (`api.cbt.skipQuestion`):**
   - Added `skipQuestion({ sessionId })` mutation in `convex/cbt.ts`.
   - Requires valid authentication and enforces student ownership (`assertCanAccessStudent(ctx, session.userId)`).
   - Validates that `sessionStatus === "active"`.
2. **Clean State Advancement:**
   - **In `guided_discovery`:**
     - Increments `stepIndex` (0 $\rightarrow$ 1 $\rightarrow$ 2) and records `"(Question skipped)"` into `challengeAnswers`.
     - When all 3 questions are addressed or skipped (`stepIndex >= 2`), automatically transitions to `reflection`.
     - Appends an empathetic assistant message (e.g., `"No problem, let's explore this from another angle:\n\n${nextQuestion}"` or `"No problem. Reflecting on everything we've explored so far, what do you think now?"`).
   - **In `clarification`:** Advances directly to `guided_discovery` with standard challenge questions and neutral distortion.
   - **In `understanding`:** Advances to `guided_discovery` using captured session context.
3. **Zero Fake User Chat Messages:**
   - Does **NOT** inject `"I want to skip this question."` into `session.conversation`. Only the assistant's transitional guidance message is added.
4. **No LLM / Gemini Call on Skip:**
   - The skip executes purely in the database state machine with zero latency and zero token cost.
5. **Frontend Integration (`reframe.tsx`):**
   - Hooked `skipQuestionMutation` into `handleSkipQuestion`.
   - Rendered the Skip button in `styles.inputBar` when in `guided_discovery` or `clarification` steps.
   - Instantly updates local session state upon completion.

---

## 4. Stale Session Expiration Policy

**Target:** `convex/cbt.ts:startSession`

### Audit Finding Addressed:
Active incomplete CBT sessions could be resumed indefinitely, even weeks or months later, trapping students in stale session contexts.

### Implementation:
1. **Server-Authoritative Inactivity Threshold:**
   - Established constant `STALE_SESSION_THRESHOLD_MS = 24 * 60 * 60 * 1000` (24 hours).
   - Uses server `Date.now()` and the authoritative `session.timestamp` (which is updated on every message and session mutation).
2. **Stale Session Handling:**
   - If an active session has `now - lastActivity > 24 hours`:
     - The session is marked with `sessionStatus: "expired"` and `timestamp: now`.
     - **The session is NOT deleted.** It remains stored in the database as an incomplete historical record.
     - The system does **not** force-resume the stale session.
     - A fresh active CBT session is created and returned with `{ session: newSession, resumed: false, previousSessionExpired: true }`.
3. **Active Recent Session Resumption:**
   - If `now - lastActivity <= 24 hours`, the session remains resumable with `{ session: activeSession, resumed: true, previousSessionExpired: false }`.
4. **Completed Sessions Protected:**
   - Completed CBT sessions (`sessionStatus === "completed"`) are never touched or modified by the expiration logic.

---

## 5. Authorization Verification

- **Ownership Boundary:** All CBT mutations (`startSession`, `updateSessionContext`, `selectBalancedThought`, `submitBeliefRating`, `submitEmotionAfterRating`, `skipQuestion`, `acceptGoal`, `skipGoal`, `endSession`) enforce student ownership via `assertCanAccessStudent(ctx, session.userId)`.
- **Cross-Student Isolation:** Regression test `P8-UX-12` proves that an unauthorized user attempting to call `skipQuestion` or mutate another student's session is strictly denied with an `Unauthorized` error.

---

## 6. Safety Gate Verification

- **Crisis Detection Integrity:** Immediate crisis language (suicide, self-harm) entered during `understanding` or `guided_discovery` continues to immediately trigger `sessionStatus: "safety_mode"`, flag `session.riskFlags`, and insert a counselor alert (`type: "suicideRisk"`).
- **No Safety Bypass:** `skipQuestion` verifies `session.sessionStatus === "active"`. A session in `safety_mode` rejects `skipQuestion` calls with `This session is no longer active (Status: safety_mode)`. Skip cannot be used to escape or bypass crisis workflows (tested in `P8-UX-11`).

---

## 7. Files Modified

1. **[convex/cbt.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/cbt.ts)**
   - Added `STALE_SESSION_THRESHOLD_MS` (24 hours) and stale-session expiration logic to `startSession`.
   - Added `skipQuestion` mutation for clean state advancement without fake chat messages.
   - Updated `handleMockResponse` with dynamic, non-repetitive follow-ups and comprehensive context progression.
   - Added anti-repetition failsafe to `submitMessage` and `callGeminiEngine` prompt.
2. **[app/(auth)/tools/reframe.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/tools/reframe.tsx)**
   - Hooked `useMutation(api.cbt.skipQuestion)`.
   - Updated `handleSkipQuestion` to invoke `skipQuestionMutation` directly.
   - Rendered the Skip button in `inputBar` during `guided_discovery` and `clarification`.
3. **[convex/priority8.test.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/priority8.test.ts)**
   - Added 12 new automated regression tests (`P8-UX-01` through `P8-UX-12`).

---

## 8. Tests Added

The following 12 regression tests were added in `convex/priority8.test.ts`:

- **`P8-UX-01`:** Identical understanding prompt is not repeatedly returned when meaningful input is provided.
- **`P8-UX-02`:** Fallback/mock mode progresses correctly through conversation phases (`understanding` $\rightarrow$ `guided_discovery` $\rightarrow$ `reflection` $\rightarrow$ `balanced_thought`).
- **`P8-UX-03`:** Insufficient input can still request clarification without premature progression.
- **`P8-UX-04`:** Skip Question does not inject fake chat text into the conversation history.
- **`P8-UX-05`:** Skip Question advances the correct CBT state through guided discovery to reflection.
- **`P8-UX-06`:** Skip preserves session ownership and authorization.
- **`P8-UX-07`:** Stale active session (>24h) is not automatically resumed and is marked expired.
- **`P8-UX-08`:** Active recent session (<24h) remains resumable.
- **`P8-UX-09`:** Stale session remains stored in the database and is not deleted.
- **`P8-UX-10`:** Completed sessions are never expired by the stale-session logic.
- **`P8-UX-11`:** Safety detection still works after state-machine changes and cannot be bypassed via `skipQuestion`.
- **`P8-UX-12`:** Cross-student session modification remains blocked on `skipQuestion`.

---

## 9. Manual QA Verification Results

| QA Scenario | Execution Details | Result |
|---|---|---|
| **A. New Reframe Session** | Started new session. Input: "I am feeling stressed about failing my next final exam." Assistant asked what worries the student most. Input: "I feel like if I fail, I am a complete failure." Assistant asked a distinct, reflective follow-up question acknowledging the thought. | **PASS** — No prompt repetition. |
| **B. Skip Question** | Reached Guided Discovery question 1. Tapped "Skip". Step index incremented from 0 to 1. Assistant presented question 2. Conversation log contained zero fake user messages ("I want to skip this question."). | **PASS** — State advanced cleanly; no fake messages. |
| **C. Resume (<24h)** | Started session, stepped away, called `startSession({ forceNew: false })` after 2 hours. | **PASS** — Existing session resumed seamlessly (`resumed: true`). |
| **D. Stale Session (>24h)** | Simulated session inactivity of 25 hours. Called `startSession({ forceNew: false })`. | **PASS** — Stale session marked `expired`. New session started cleanly (`resumed: false`). Historical record intact. |
| **E. Safety Escalation** | Submitted test crisis text ("I want to kill myself"). Session transitioned immediately to `safety_mode`, alert logged in dashboard. Attempted to call `skipQuestion`. | **PASS** — `skipQuestion` rejected with non-active error. Safety mode preserved. |

---

## 10. Verification Results

### 1. Test Suite (Vitest)
```bash
npx vitest run
```
**Output:**
```text
 Test Files  13 passed (13)
      Tests  244 passed (244)
   Start at  12:47:01
   Duration  9.75s
```
*Baseline:* 232 passed  
*Added:* 12 passed  
*Total:* 244 passed (0 failed, 0 skipped)

### 2. TypeScript Typecheck
```bash
npx tsc --noEmit
```
**Output:**
```text
Exit code: 0 (Clean, 0 errors)
```

### 3. Dashboard Production Build
```bash
npm run build --prefix dashboard
```
**Output:**
```text
> dashboard@0.0.0 build
> tsc -b && vite build

vite v8.0.13 building client environment for production...
transforming...✓ 2409 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.66 kB │ gzip:   0.40 kB
dist/assets/index-DtVgz1y3.css   12.37 kB │ gzip:   3.18 kB
dist/assets/index-nSe53tHL.js   897.65 kB │ gzip: 244.05 kB
✓ built in 1.17s
Exit code: 0 (Clean)
```

---

## 11. Remaining Priority 8 Findings

1. **P8-F03:** Missing Reframe $\leftrightarrow$ `reframeLogs` Data Flow Bridge *(Queued for Step 4)*.
2. **P8-F04:** Stored Saved Reframes vs. Reframe Schema Desynchronization.
3. **P8-F06:** CBT "Skip Goal" Button UI Deadlock / Session Completion Modal Stall.
4. **P8-F07:** Mitra Avatar Repeated Greeting & Context Resets in Interactive Chat.
5. **P8-F08:** Non-Clinical Mood $\rightarrow$ Intervention Recommendation Architecture (Mood-Adaptive Goals).

---

## 12. Explicit Scope Exclusions

In strict accordance with the instructions and stopping rules, the following items were **NOT** implemented in this step:
- **NO** bridge between CBT sessions and `reframeLogs` was implemented (deferred to Step 4).
- **NO** changes to Saved Reframes storage were introduced.
- **NO** mood $\rightarrow$ intervention or mood $\rightarrow$ micro-goal mapping was added.
- **NO** recommendation history learning or intervention ranking was added.
- **NO** changes to Mitra AI architecture or companion dialogue were introduced.
- **NO** changes to clinical screening, clinical scoring, triage, alerts, or reassessment were made.

---

## 13. Conclusion & Certification

Priority 8 Step 3 has successfully resolved all targeted Reframe UX and session state-machine defects. Repetitive understanding prompts are eliminated, Skip Question functions via an explicit authoritative backend mutation without fake chat messages or LLM latency, and inactive sessions expire cleanly after 24 hours without deleting historical records. All 244 tests are passing, TypeScript is clean, and the production build is clean.
