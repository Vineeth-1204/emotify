# Priority 8 — Step 1: Personalized Intervention / Reframe Audit
## Comprehensive Architecture & Clinical Boundary Discovery Report

**Date:** 2026-09-28  
**Scope:** Priority 8 — Step 1 Audit (Personalized Intervention / Reframe Architecture)  
**Status:** AUDIT COMPLETE — ZERO CODE MODIFICATIONS (READ-ONLY)  
**Verification Baseline:** 222 / 222 Vitest tests passing | TypeScript Clean | Dashboard Build Clean  

---

## 1. Executive Summary

Following the formal closure and certification of Priority 7, this audit evaluates the current implementation of personalized interventions, cognitive reframing, behavioral micro-goals, and progressive relaxation across the mobile application, Convex backend, and counselor dashboard.

### Core Audit Discoveries:
1. **Clinical Score Leakage in Intervention Logic (P1):** Standardized clinical psychometric scores (PHQ-9, GAD-7) and clinical triage classifications are currently queried and directly influence intervention recommendations in [`convex/cbt.ts:620-664`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/cbt.ts#L620-L664) and [`convex/microGoals.ts:230-252`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/microGoals.ts#L230-L252). This violates medical domain separation and must be decoupled in Priority 8.
2. **Reframe Tool vs Table Architectural Disconnect (P1):** The mobile screen titled "Reframing Thoughts" ([`app/(auth)/tools/reframe.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/tools/reframe.tsx)) is actually an interactive multi-step CBT session communicating exclusively with `cbtSessions` in `convex/cbt.ts`. It never writes to the canonical [`reframeLogs`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/schema.ts#L301) table, causing [`app/(auth)/tools/saved-reframes.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/tools/saved-reframes.tsx) to remain completely empty for standard users.
3. **Root Cause of Repetitive, Stressful Reframe Prompting (P2):** In [`convex/cbt.ts:1050-1089`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/cbt.ts#L1050-L1089), the `understanding` phase repeats the identical static prompt (*"I hear you. That sounds really tough. What worries you the most about this situation?"*) for every user turn until turn 3. Furthermore, tapping "Skip question" in the mobile UI simply posts the literal string `"I want to skip this question."` into the chat rather than advancing the state machine.
4. **Claimed vs Implemented Personalization Disconnect (P2):** The check-in mutation [`api.microGoals.submitMorningCheckin`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/microGoals.ts#L587) accepts `mood`, but the downstream generator `generateRecommendedGoals` completely ignores the `mood` parameter, selecting goals via `Math.random()` shuffling.

---

## 2. Repository Areas Audited

### Backend Services (`convex/`)
- [`convex/cbt.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/cbt.ts): CBT session state machine (understanding, clarification, guided discovery, reflection, balanced thought, belief rating, emotion after, recovery coach), AI Gemini dialogue integration, mock fallbacks.
- [`convex/reframes.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/reframes.ts): `create`, `createLog`, `getRecentLogs`, `updateLog`, `removeLog`, `toggleFavoriteLog`.
- [`convex/microGoals.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/microGoals.ts): 24 goal templates across 4 difficulty tiers, `generateRecommendedGoals`, streak resolution, streak freeze, completion with feeling.
- [`convex/jpmrLogs.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/jpmrLogs.ts) & [`convex/jpmrVideos.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/jpmrVideos.ts): Jacobson's Progressive Muscle Relaxation logging, video metadata, duration, pre/post tension.
- [`convex/companion.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/companion.ts): Mitra companion messages, mock fallbacks, conversation clearing.
- [`convex/reinforcement.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/reinforcement.ts): Contextual positive messages based on recent activity.
- [`convex/dashboard.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/dashboard.ts): `getPatientCbtAnalytics` (frequently completed goals, average emotion improvement, belief scores).
- [`convex/schema.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/schema.ts): Schemas for `cbtSessions`, `reframeLogs`, `reframes`, `microGoals`, `jpmrLogs`, `streaks`, `weeklyMissions`, `monthlyChallenges`, `badges`.

### Mobile Application (`app/`)
- [`app/(auth)/tools/reframe.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/tools/reframe.tsx): 1,658-line interactive CBT restructuring wizard with crisis safety mode, grounding support mode, and balanced thought editor.
- [`app/(auth)/tools/saved-reframes.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/tools/saved-reframes.tsx): Reader/editor for saved reframe cards (`reframeLogs`).
- [`app/(auth)/tools/recovery-plan.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/tools/recovery-plan.tsx): 4-goal behavioral activation selector following CBT session completion.
- [`app/(auth)/tools/microgoals.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/tools/microgoals.tsx): Daily goal checklist, feeling selector, gamification level, streak badges.
- [`app/(auth)/tools/jpmr.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/tools/jpmr.tsx): Guided muscle relaxation video player with pre/post tension sliders.
- [`app/(auth)/(tabs)/tools.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/(tabs)/tools.tsx): Categorized tools directory.
- [`app/(auth)/(tabs)/index.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/(tabs)/index.tsx): Student home quick intervention launcher cards.

### Counselor Dashboard (`dashboard/src/`)
- [`dashboard/src/pages/PatientDetail.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/pages/PatientDetail.tsx): Somatic & CBT analytics tabs, goal completion rates, tension reduction metrics.

---

## 3. Current Intervention Architecture

```
+---------------------------------------------------------------------------------------------------+
|                                  STUDENT MOBILE APP INTERACTION                                   |
+---------------------------------------------------------------------------------------------------+
           |                                  |                              |
           v                                  v                              v
   "Reframe Now" Card                 "MicroGoals" Card             "Relax Now" (JPMR) Card
(app/tools/reframe.tsx)          (app/tools/microgoals.tsx)          (app/tools/jpmr.tsx)
           |                                  |                              |
           v                                  v                              v
   api.cbt.startSession           api.microGoals.getTodayGoals     api.jpmrLogs.create
   api.cbt.submitMessage          api.microGoals.completeGoal...            |
   api.cbt.recommendGoalAction                |                             v
           |                                  v                        jpmrLogs
           v                              microGoals            (Pre/Post Tension: 1-10)
      cbtSessions                       (XP, Coins, Streak)
(Multi-step Conversation)                     |
           |                                  |
           +-----------------+----------------+
                             |
                             v
           [!] CRITICAL GAP: Neither path writes to
                     reframeLogs!
                             |
                             v
              app/tools/saved-reframes.tsx
                (Displays empty state)
```

---

## 4. Current Reframe Architecture

The system contains **two completely disjoint reframe implementations**:

### Path A: The Canonical Reframe Log Model (`convex/reframes.ts`)
- **Table:** `reframeLogs` (indexed by `userId`, `createdAt`).
- **Fields:** `situation_text`, `thought_original`, `thinking_trap_choice`, `guided_answers`, `reframe_text`, `pre_reframe_intensity`, `post_reframe_intensity`, `improvement_percentage`, `saved_reframe_flag`, `favorite`.
- **UI:** Rendered by [`saved-reframes.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/tools/saved-reframes.tsx), with search, category filtering, favorites, inline text editing, and soft deletion.
- **Problem:** There is currently **no user-facing creation flow** that writes to `reframes.createLog`.

### Path B: The Interactive Conversational CBT Engine (`convex/cbt.ts` + `reframe.tsx`)
- **Table:** `cbtSessions`.
- **Fields:** `situation`, `automaticThought`, `emotion`, `emotionBefore`, `thinkingStyle`, `cbtDistortion`, `challengeQuestions`, `challengeAnswers`, `balancedThoughtsOptions`, `balancedThought`, `beliefScore`, `emotionAfter`, `recommendedGoals`.
- **UI:** 8-stage interactive wizard in `reframe.tsx`.
- **Problem:** When completed, it saves to `cbtSessions` and creates `microGoals`, but never creates a record in `reframeLogs`.

---

## 5. Current Emotion $\rightarrow$ Intervention Flow

1. **Daily Check-in (`dailyCheckins`):**
   - User submits mood (`"great" | "good" | "okay" | "low" | "stressed" | "tired" | "frustrated"`).
   - Backend mutation `submitMorningCheckin` calls `generateRecommendedGoals(ctx, userId, args.mood, todayStr)`.
   - **Flaw:** `generateRecommendedGoals` ignores `args.mood`. It queries `triages` to check `isSevere`, then executes `Math.random()` shuffling.
2. **Episodic Emotion Log (`emotionLogs`):**
   - User logs an episodic emotion with pre/post intensity and body regions.
   - **Flaw:** Emotion logging has no downstream link to recommend an intervention; it terminates upon submission.
3. **Somatic Emotion Map (`emotionMaps`):**
   - Heatmap body ratings logged; no intervention recommendation generated.

---

## 6. Personalization Mechanisms: Claimed vs Implemented

| Personalization Claim | Claimed Behavior | Actual Code Implementation | Status |
| :--- | :--- | :--- | :--- |
| **Mood-Adaptive Goals** | Goals match morning emotional check-in | `generateRecommendedGoals` receives `mood` but never reads it in the function body | **CLAIMED ONLY (NOT IMPLEMENTED)** |
| **Triage-Adaptive Goals** | Eases goal difficulty for high-stress users | Reads `triages.level`; if severe, downgrades `medium` $\rightarrow$ `small` | **IMPLEMENTED (UNSAFE CLINICAL LEAKAGE)** |
| **Clinical Score Goal Tuning** | Recovery coach adapts to depression/anxiety | In `cbt.ts:620`, queries PHQ-9 & GAD-7; if $\ge 15$, forces crisis goals | **IMPLEMENTED (UNSAFE CLINICAL LEAKAGE)** |
| **Goal Repetition Learning** | Avoids recommending goals the user skipped | Prompt instructs Gemini not to repeat; mock fallback does not check history | **PARTIALLY IMPLEMENTED (AI ONLY)** |
| **Streak Freeze Preservation** | Preserves streak using 1 freeze per month | Implemented in `checkAndFreezeStreak` via `users.lastStreakFreezeUsed` | **FULLY IMPLEMENTED** |

---

## 7. Intervention Catalog Audit

| ID / Type | Title / Media | Category | Duration | Completion Tracking | Clinical Review Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **JPMR** | Progressive Muscle Relaxation (Video/Audio) | Relaxation | 10–15 mins | `jpmrLogs` (pre/post tension 1–10) | UNKNOWN — REQUIRES CONTENT REVIEW |
| **Breathing (4-3-4)** | Animated Respiration Circle | Calming | 3–5 mins | In-session support mode | UNKNOWN — REQUIRES CONTENT REVIEW |
| **Sensory Grounding** | 5-4-3-2-1 Sensory Exercise | Mindfulness | 5 mins | In-session support mode | UNKNOWN — REQUIRES CONTENT REVIEW |
| **Free Writing** | Unanalyzed Expressive Journal | Journaling | 5 mins | In-session support mode | UNKNOWN — REQUIRES CONTENT REVIEW |
| **CBT Restructuring** | Socratic Challenge & Balanced Thought | Cognitive | 8–12 mins | `cbtSessions` (belief & emotion delta) | UNKNOWN — REQUIRES CONTENT REVIEW |
| **Micro-Goal (Small)** | 8 templates (e.g. Water, 3 Breaths, Window) | Behavioral | 1–5 mins | `microGoals` (feeling after, XP) | UNKNOWN — REQUIRES CONTENT REVIEW |
| **Micro-Goal (Medium)**| 6 templates (e.g. Journal 5m, Fruit, Note) | Behavioral | 5–10 mins | `microGoals` (feeling after, XP) | UNKNOWN — REQUIRES CONTENT REVIEW |
| **Micro-Goal (Large)** | 6 templates (e.g. Walk 20m, Body Scan 15m) | Behavioral | 15–30 mins| `microGoals` (feeling after, XP) | UNKNOWN — REQUIRES CONTENT REVIEW |
| **Micro-Goal (Challenge)**| 4 templates (e.g. 5k Steps, Detox 2h, Sleep) | Lifestyle | Daily/Night | `microGoals` (feeling after, XP) | UNKNOWN — REQUIRES CONTENT REVIEW |

---

## 8. Intervention History & Provenance

- **Tracking Granularity:**
  - `cbtSessions`: Captures initial automatic thought, emotion before, cognitive trap, challenge answers, chosen balanced thought, belief score (0–100%), emotion after (0–10), and recommended goals.
  - `reframeLogs`: Captures situation, original thought, thinking trap, guided answers, reframe text, pre/post intensity, improvement percentage, and favorite flag.
  - `jpmrLogs`: Captures duration seconds, pre/post tension, start/complete timestamps.
  - `microGoals`: Captures scheduled time, reminder status, snooze count, completed timestamp, and `feelingAfter`.
- **Provenance Linkage:**
  - Optional `sourceType`, `attemptId`, and `triageId` exist across all 4 intervention tables.
  - When launched independently by a student, `sourceType` correctly defaults to `"self_initiated"`.
  - Provenance is cleanly preserved without fabricating historical ties.

---

## 9. Reframe Repetition & UX Stress Analysis

A previous device test noted: *"The reframe thought question was repeatedly presented and could become stressful."*

### Concrete Technical Root Causes Identified:
1. **Mock Dialogue Infinite Turn Loop (`convex/cbt.ts:1050-1089`):**
   - In offline/mock mode (or when Gemini API fails/times out), the `understanding` step repeats the exact same message:
     ```text
     "I hear you. That sounds really tough. What worries you the most about this situation?"
     ```
   - It forces the student to reply at least 3 separate times before transitioning to Guided Discovery, regardless of how clear their first message was.
2. **Broken "Skip Question" Action (`app/(auth)/tools/reframe.tsx:343`):**
   - The skip handler is implemented as:
     ```typescript
     const handleSkipQuestion = () => {
       handleSendMessage("I want to skip this question.");
     };
     ```
   - It posts `"I want to skip this question."` as user chat text. Neither the Gemini prompt nor the mock engine recognizes this string as a state bypass, causing the engine to interpret it as an emotional statement and repeat the challenge question.
3. **Persistent Resume Trap (`app/(auth)/tools/reframe.tsx:241`):**
   - `startSession({ forceNew: false })` resumes any session where `sessionStatus === "active"`.
   - If a student leaves mid-session due to frustration or lack of time, reopening the tool indefinitely prompts: *"Ongoing Session Found. Would you like to resume it?"*
   - There is no session staleness expiration (e.g. 24-hour timeout) or cooldown period.

---

## 10. Legacy / Duplicate Architecture

- **`reframes` vs `reframeLogs`:**
  - In Priority 5, `reframes.create` was redirected to `reframeLogs`.
  - Historical rows remain in `reframes` for backward compatibility.
  - Neither table receives entries from the active CBT screen `reframe.tsx`.
- **`companionMessages` vs `aiCompanionLogs`:**
  - `companion.ts` writes exclusively to `aiCompanionLogs`.
  - Legacy `companionMessages` is read only as a fallback.

---

## 11. AI Involvement Audit

- **Model Usage:** Google Gemini via REST API (`fetchGeminiWithFallback` in `cbt.ts`).
- **Prompt Structure:**
  - Brain 1 (`understanding`): Evaluates risk, situational triggers, automatic thoughts.
  - Brain 2 (`clarification`, `guided_discovery`, `reflection`): Identifies cognitive distortion, formulates 3 challenge questions, generates 3 balanced thoughts.
  - Brain 3 (`recommendGoalAction`): Generates 4 bite-sized behavioral micro-goals.
- **Safety Gate:** Evaluates regex and AI determinations for suicide, self-harm, or psychosis risk. Immediately triggers `api.alerts.createAlert` and locks session into `safety_mode`.
- **Major Finding:** `cbt.ts:664` explicitly injects:
  ```text
  - Screening: PHQ-9 ${phq9}, GAD-7 ${gad7}
  ```
  into the AI prompt. This clinical leakage must be eradicated in Priority 8.

---

## 12. Security & Authorization

- **Student Self-Access:**
  - `cbt.getSession`, `cbt.updateSessionContext`, `cbt.selectBalancedThought`: Enforces `session.userId === identity.subject`.
  - `reframes.getRecentLogs`: Protected by `assertCanAccessStudent`.
  - `reframes.updateLog`, `reframes.removeLog`, `reframes.toggleFavoriteLog`: Enforces `item.userId === identity.subject`.
  - `microGoals.scheduleGoalRelative`, `snoozeGoal`, `completeGoalWithFeelingHelper`: Enforces `goal.userId === identity.subject`.
- **Counselor Role-Based Access:**
  - `dashboard.getPatientCbtAnalytics`: Enforces `assertCanAccessStudent(ctx, resolvedUserId)`.
- **Cross-Student IDOR:** Zero P0/P1 IDOR vulnerabilities detected across intervention endpoints.

---

## 13. Safety & Clinical Boundaries

- **Violation Identified:** In `cbt.ts:620` and `1302`, the goal recommendation engine queries clinical screenings (`api.screening.getAll`) and forces crisis-oriented or simplified goals based on `phq9 >= 15 || gad7 >= 15`.
- **Violation Identified:** In `microGoals.ts:230`, `generateRecommendedGoals` queries `triages` and modifies goal categories based on `triageLevel === "severe"`.
- **Required Separation:** Priority 8 must decouple intervention recommendations from clinical scoring. Interventions must respond to **user-reported emotional state, recent habit engagement, and user preferences**, NOT standardized psychometric scores.

---

## 14. Findings by Severity

| ID | Severity | File / Component | Current Behavior | Recommended Direction | Approval Needed |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **P8-F01** | **P1** | `convex/cbt.ts:620-664` | `recommendGoalAction` queries `screeningAttempts` and injects PHQ/GAD scores into AI prompts | Decouple recommendation prompt from clinical psychometric scores; base recommendations purely on session context & habit history | Clinical |
| **P8-F02** | **P1** | `convex/microGoals.ts:232` | `generateRecommendedGoals` queries `triages` to alter goal difficulty | Remove clinical triage query; determine goal difficulty based on user preference or self-selected pace | Clinical |
| **P8-F03** | **P1** | `app/(auth)/tools/reframe.tsx` vs `reframeLogs` | Interactive CBT session never writes to `reframeLogs`, leaving `saved-reframes.tsx` empty | On CBT completion, write the finalized balanced thought to `reframeLogs` so it appears in Saved Reframes | Product |
| **P8-F04** | **P2** | `convex/cbt.ts:1050-1089` | Mock engine repeats identical "what worries you most" prompt 3 times | Advance understanding phase on meaningful user input or provide progressive prompts | Product |
| **P8-F05** | **P2** | `app/(auth)/tools/reframe.tsx:343` | "Skip question" sends literal text into chat, causing prompt repetition | Implement explicit state bypass action to advance `stepIndex` without chatting | Product |
| **P8-F06** | **P2** | `convex/microGoals.ts:230` | `generateRecommendedGoals` receives `mood` but completely ignores it | Implement genuine mapping between checked-in mood category and relevant goal categories | Product |
| **P8-F07** | **P3** | `app/(auth)/tools/reframe.tsx:241` | Unfinished CBT sessions prompt to resume indefinitely with no expiration | Add 24-hour expiration or cooldown on incomplete sessions | Product |
| **P8-F08** | **P4** | `app/(auth)/tools/saved-reframes.tsx` | Static distortion labels; no search by thinking trap | Enhance filtering by cognitive distortion category | Product |

---

## 15. Clinical Dependencies

1. **Intervention Appropriateness Matrix:** Clinical approval required for mapping self-reported moods (e.g. "stressed", "low", "frustrated") to specific intervention categories (e.g. breathing vs JPMR vs journaling).
2. **Clinical Score Decoupling Approval:** Formal acknowledgment that intervention recommendations are self-guided wellness tools and do not represent prescribed clinical treatment plans.
3. **Crisis Mode Escalation Content:** Approval of crisis contact numbers and wording in CBT `safety_mode`.

---

## 16. Product Dependencies

1. **Reframe Session Linking:** Product decision on whether every completed CBT session in `reframe.tsx` should automatically appear as a card in `saved-reframes.tsx`.
2. **Session Cooldown & Expiration:** Setting appropriate session staleness windows (e.g., 24 hours) to prevent students from being trapped in old conversations.
3. **Skip Flow UX:** Determining whether skipping a Guided Discovery challenge question displays a simplified question or advances directly to Reflection.

---

## 17. Test Coverage Gaps

- **Current Tests:**
  - `cbt.test.ts` (2 tests: complete state machine workflow, safety trigger).
  - `hardening.test.ts` (covers `reframeLogs.createLog` and authorization).
  - `mitra_avatar.test.ts` (covers avatar preferences).
- **Missing Coverage:**
  - Zero tests for `microGoals.generateRecommendedGoals` decoupling.
  - Zero tests for `cbt.recommendGoalAction` clinical decoupling.
  - Zero tests for session resume expiration or cooldown.
  - Zero tests verifying that CBT balanced thoughts bridge into `reframeLogs`.
  - Zero tests verifying skip button state machine bypass.

---

## 18. Production Readiness Matrix

| Component | Status | Notes |
| :--- | :--- | :--- |
| **JPMR Logging & Audio/Video** | **READY** | Pre/post tension tracking, duration validation, authorization verified. |
| **Saved Reframes Management** | **READY** | Full CRUD, favorites, soft delete in `saved-reframes.tsx`. |
| **CBT State Machine Backend** | **PARTIAL** | Functional 8-stage engine, but contains clinical score leakage in goal recommendation. |
| **CBT Mobile Frontend** | **PARTIAL** | Full UI, but suffers from repetitive prompt loop and ineffective skip button. |
| **Micro-Goal Engine** | **PARTIAL** | Rich templates & gamification, but ignores check-in mood and queries triage. |
| **Emotion $\rightarrow$ Intervention Link** | **NOT IMPLEMENTED** | Check-in mood does not influence recommendations; emotion logs have no intervention triggers. |
| **Intervention Cooldown & Limits** | **NOT IMPLEMENTED** | No session timeout, frequency cap, or repetition suppression. |

---

## 19. Priority 8 Scope Boundary

### In Scope for Priority 8:
- Decoupling intervention and goal recommendations from clinical screening scores (PHQ-9/GAD-7) and triage tiers.
- Fixing the CBT/reframe repetitive prompt loop and implementing a functional question skip mechanism.
- Bridging completed CBT balanced thoughts into `reframeLogs` so they populate `saved-reframes.tsx`.
- Implementing genuine non-clinical mood mapping for daily micro-goal recommendations.
- Adding session expiration, cooldowns, and repetition suppression.
- Adding comprehensive regression test suite for Priority 8.

### Explicitly Deferred to Later Priorities:
- **Priority 9:** Comprehensive CBT & Media Architecture overhaul (audio tracks, video CDN, structured therapy course curriculum).
- **Priority 10:** Major Mitra AI Rework (long-term memory, voice synthesis, multi-turn open-ended companion chat).
- **Clinical Governance:** Reassessment cadence scheduling, voluntary re-screening policy, and historical risk dual indicators.

---

## 20. Recommended Implementation Sequence

```
+---------------------------------------------------------------------------------------+
|                    RECOMMENDED PRIORITY 8 EXECUTION SEQUENCE                          |
+---------------------------------------------------------------------------------------+
  Step 2: Clinical Decoupling of Recommendations
          - Remove PHQ/GAD queries and prompt injection from cbt.ts
          - Remove triage queries from microGoals.ts:generateRecommendedGoals
          - Verify domain separation with targeted unit tests

  Step 3: Reframe UX & Repetition Remediation
          - Eliminate identical turn-1/turn-2 mock prompt in cbt.ts:understanding
          - Implement state machine skip action for guided discovery questions
          - Add 24-hour expiration to cbtSessions to prevent indefinite resume traps

  Step 4: Reframe & CBT Data Bridge
          - Automatically save finalized balanced thoughts to reframeLogs on CBT finish
          - Verify saved-reframes.tsx displays thoughts from completed CBT sessions

  Step 5: Non-Clinical Habit Personalization
          - Map dailyCheckin mood categories to relevant microGoal categories
          - Personalize goal suggestions based on previous completion & skip history
          - Add full regression test suite (target: >230 tests passing)
```

---

## 21. Open Questions for Product / Clinical Review

1. *Should a student be allowed to launch multiple CBT sessions on the same calendar day, or should there be a minimum 4-hour cooldown?*
2. *When a student selects "Skip question" during Guided Discovery, should the AI attempt a simpler question or advance directly to the Reflection step?*
3. *Should goals recommended at the end of CBT be automatically added to today's micro-goals checklist, or should the user be required to manually accept them?*

---

## 22. Verification Results

Because this step is **AUDIT ONLY**, no code was modified. The existing verification baseline was re-executed:

### 1. Vitest Suite (`npx vitest run`)
- **Result:** **222 / 222 tests passing** (12 test files).
- **Duration:** 9.13s.
- **Regressions:** 0.

### 2. TypeScript Check (`npx tsc --noEmit`)
- **Result:** Clean (Exit code 0, 0 errors).

### 3. Counselor Dashboard Production Build (`npm run build --prefix dashboard`)
- **Result:** Clean production bundle built in 1.45s (Exit code 0).

---

## 23. Final Stopping Rule

**AUDIT COMPLETE. STOPPING.**  
No source code, schemas, UI, or tests have been modified. Implementation of Step 2 will await your authorization.
