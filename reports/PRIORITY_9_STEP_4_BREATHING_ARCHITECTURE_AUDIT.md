# Priority 9 Step 4 — Breathing Architecture Audit

## 1. Objective

The objective of this audit is to conduct a rigorous, evidence-based architectural inspection of all breathing-related mechanisms across the Emotify application. Specifically, this audit aims to:
1. Locate and document every breathing implementation, animation, timer, and protocol definition across the codebase.
2. Compare timing, cycles, animation, accessibility, interruption behavior, and completion handling across implementations.
3. Determine whether divergent breathing protocols represent intentional clinical distinctions or accidental implementation drift.
4. Trace current data flow and identify why breathing sessions currently lack dedicated persistence.
5. Establish the production architectural design: separating the **Breathing Engine**, **Protocol Definitions**, **Presentation Components**, and **Persistence / Provenance Layer**.
6. Formulate a minimal persistence and provenance model avoiding unnecessary clinical or behavioral surveillance.
7. Define a comprehensive test plan for implementation in Step 4B without modifying any existing production code during this audit.

---

## 2. Complete Breathing Implementation Inventory

A comprehensive search of the repository (`breath`, `breathing`, `inhale`, `exhale`, `hold`, `respiration`, `box breathing`, `4-7-8`, `paced breathing`) identified the following active implementations and contract references:

### Active UI / Component Implementations

| # | File Path | Component / Screen Context | Exercise Name | Documented Label / Description |
|---|---|---|---|---|
| **1** | `app/(auth)/tools/emotion-map.tsx` | Guided Breathing Modal (`showBreathingModal`) | Guided Breathing | "Follow the circle animation. Inhale, hold, exhale." |
| **2** | `app/(auth)/tools/reframe.tsx` | CBT Support Mode ("Gentle Pause" tab: `supportTab === "breathing"`) | Calming Breathing | "Rhythmic 4-3-4 respiration guide." |
| **3** | `components/avatar/MitraAvatar.tsx` | Mitra Avatar SVG (`state === "breathing"`) | Breathing Induction / Ambient Co-regulation | Synchronized 4s Inhale / 4s Exhale expansion pacing |
| **4** | `app/(auth)/tools/jpmr.tsx` | JPMR Step 0 ("Introduction" transition step) | JPMR Initial Breath | "Start Breathing" (countdown transition to Step 1) |
| **5** | `app/(auth)/(tabs)/index.tsx` | Student Home Check-in post-event | Ambient Mitra Breathing | Avatar switches to `state="breathing"` if check-in `intensity >= 7` |

### Non-Executable Breathing Contracts & Definitions

| # | File Path | Location / Identifier | Text / Definition | Context |
|---|---|---|---|---|
| **6** | `common/interventions.ts` | `id: "breathe"` | "Take 3 deep belly breaths" (lowers heart rate and activates calm) | Habit Catalog / Micro-goals |
| **7** | `common/interventions.ts` | `id: "breathe_478"` | "Practice 4-7-8 breathing" ("Practice the 4-7-8 breathing technique for 3 minutes") | Habit Catalog / Micro-goals |
| **8** | `utils/microgoals.ts` | `id: "breathe"` & `id: "breathing_break"` | "Take 3 slow, deep belly breaths" (5 pts) / "Take two slow, conscious breaths" (20 pts) | Static Micro-goal list |
| **9** | `convex/cbt.ts` | `id: "breathe_simple"` | "Take 3 deep breaths" ("Close your eyes, breathe in slowly for 4 seconds, and release.") | CBT Recommended Goals |
| **10** | `README.md` | Core Feature List | "Interactive Breathing Exercise: Guided 4-7-8 breathing pacer with visual animations and haptic feedback." | Phantom Readme claim (4-7-8 pacer is nowhere implemented) |
| **11** | `app/(auth)/onboarding/welcome.tsx` | Feature Highlights | `<DeepBreathingActivityIcon size={24} />` with label `t("onboarding.featTools")` | Static marketing item |

---

## 3. Current Architecture Diagram

```
+----------------------------------------------------------------------------------------------------+
|                                    CURRENT DIVERGENT FLOWS                                         |
+----------------------------------------------------------------------------------------------------+

1. EMOTION MAP (Modal):
   [Emotion Map Screen] 
       --> Suggestion: "Chest Tightness"
       --> [Guided Breathing Modal] (4s Inhale, 4s Hold, 4s Exhale - 180s countdown)
           --> On Timer 0:00 OR "Stop & Complete" button
               --> api.emotionMaps.create ({ suggestedAction: "Breathe", ...bodyRatings })
                   --> Database: "emotionMaps" table
                   * Flaw: No breathing log; prematurely pressing "Stop & Complete" at 3s falsely logs "Breathe"!

2. CBT REFRAME (Embedded Tab):
   [CBT Reframe Screen] 
       --> "Gentle Pause" (Support Mode)
       --> [Calming Breathing Tab] (4s Inhale, 3s Hold, 4s Exhale - Infinite loop)
           --> User watches circle scale (scale: 1.0 -> 2.2 -> 1.0)
           --> User taps "Other activities" or exits screen
               --> Database: ZERO records created
               * Flaw: Zero persistence, no duration tracking, dangling setTimeout on unmount.

3. MITRA AVATAR (Ambient State):
   [Student Home Screen / JPMR Step 1] 
       --> Avatar state = "breathing"
       --> [MitraAvatar.tsx] (4s Inhale, 4s Exhale - Infinite loop)
           --> Pure visual ambient animation (scale: 0.95 -> 1.08)
           --> Respects reduceMotion
           --> Database: N/A (Visual feedback only).

4. JPMR STEP 0 (Intro Step):
   [JPMR Player Screen] 
       --> Step 0: "Introduction" -> Button: "Start Breathing"
       --> Speaks release script via Speech TTS -> Counts down 6 seconds
           --> Transitions to Step 1 ("Hands & Fists")
           --> Persisted in "jpmrLogs" ONLY after all 15 steps complete.
```

---

## 4. Implementation Comparison

| Implementation | Location | Protocol | Inhale | Hold | Exhale | Rest | Target Duration / Cycles | Completion Trigger | Persistence Target | Animation Type | Audio / TTS | Reduced Motion | Offline Operation | Identified Issues |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Guided Breathing Modal** | `app/(auth)/tools/emotion-map.tsx` | 4-4-4 Paced | 4.0s | 4.0s | 4.0s | 0.0s | 180s (15 cycles) | Timer reaching 0:00 OR manual "Stop & Complete" | `emotionMaps` (`suggestedAction: "Breathe"`) | `Animated.timing` (scale 1.0 ↔ 1.8) | None | ❌ Ignored | Local visual; Remote mutation fails offline | Conflates emotion map with breathing; premature exit logs false completion; timer desyncs on backgrounding; dangling timer. |
| **Calming Breathing** | `app/(auth)/tools/reframe.tsx` | 4-3-4 Paced | 4.0s | 3.0s | 4.0s | 0.0s | Infinite | None (user manually exits tab) | ❌ Zero persistence | `Animated.timing` (scale 1.0 ↔ 2.2) | None | ❌ Ignored | Fully local | Zero persistence; non-standard 3s hold; infinite loop with no goal or cycle count; dangling `setTimeout` on unmount. |
| **Mitra Avatar Pacing** | `components/avatar/MitraAvatar.tsx` | 4-0-4 Coherent | 4.0s | 0.0s | 4.0s | 0.0s | Infinite | N/A (ambient visual state) | N/A | `Animated.loop` SVG scale (0.95 ↔ 1.08) | None | ✅ Supported (`setValue(1)`) | Fully local | Only an avatar state; no student controls, no guidance, no instruction overlay. |
| **JPMR Step 0 Induction** | `app/(auth)/tools/jpmr.tsx` | Paced Deep Breath | N/A | N/A | 6.0s release | 0.0s | 1 step (6 seconds) | Countdown reaches 0 | `jpmrLogs` (only upon full 15-step finish) | SVG Circular progress ring | `expo-speech` TTS | ❌ Ignored | Resilient local fallback | Tightly coupled to JPMR muscle relaxation; not a standalone breathing exercise. |

---

## 5. Protocol Comparison

| Protocol Variant | Inhale | Hold (Inhale) | Exhale | Rest (Exhale) | Full Cycle Time | Intended Clinical / Behavioral Target | Code Origin / Rationale |
|---|---|---|---|---|---|---|---|
| **4-4-4 Paced Breathing** | 4s | 4s | 4s | 0s | 12s (5 breaths/min) | Acute anxiety / somatic grounding in Emotion Map | Implemented in `emotion-map.tsx`. Standard simplified box variant. |
| **4-3-4 Rhythmic Breathing** | 4s | 3s | 4s | 0s | 11s (5.45 breaths/min) | De-escalation during CBT cognitive restructuring | Implemented in `reframe.tsx`. Arbitrary prototype drift (3s hold instead of 4s). |
| **4-0-4 Coherent Respiration** | 4s | 0s | 4s | 0s | 8s (7.5 breaths/min) | Visual ambient co-regulation via Mitra Avatar | Implemented in `MitraAvatar.tsx`. Smooth continuous harmonic sinusoidal expansion. |
| **4-7-8 Relaxing Breath** | 4s | 7s | 8s | 0s | 19s (3.15 breaths/min) | Deep parasympathetic activation & sleep induction | Declared in `README.md` and `common/interventions.ts` (`breathe_478`), but **unimplemented** in code. |
| **3 Deep Belly Breaths** | 4s | 0s / 2s | 4s | 0s | 8–10s × 3 (24–30s) | Micro-goal / quick in-the-moment physiological pause | Declared in `utils/microgoals.ts` and `convex/cbt.ts` (`breatheGoal`). |

---

## 6. Duplication / Divergence Findings

### Intentional Distinctions vs. Accidental Drift

1. **Accidental Timing Drift:**
   The divergence between `reframe.tsx` (4-3-4) and `emotion-map.tsx` (4-4-4) is **accidental code drift**. Both were written as ad-hoc custom implementations during separate development sprints to provide a quick calming breathing visual. There is no clinical literature recommending a 4-3-4 ratio over a standard 4-4-4 box ratio or 4-0-4 coherent ratio.

2. **Duplicated Animation Loops:**
   Both `reframe.tsx` and `emotion-map.tsx` re-implemented ad-hoc recursive `Animated.timing` chains with nested `setTimeout` calls. Neither uses `Animated.loop` with native drivers cleanly. Both contain race conditions where unmounting or switching tabs mid-cycle triggers memory leaks or state updates on unmounted components.

3. **Missing Canonical Tool:**
   Despite breathing being highlighted on onboarding (`welcome.tsx`) and in the `README.md`, there is **no dedicated standalone Breathing tool** in `app/(auth)/(tabs)/tools.tsx`. Students can only discover breathing by:
   - selecting an emotion and tapping a specific body region in `emotion-map.tsx`, or
   - triggering a "Gentle Pause" in `reframe.tsx`.

4. **Accidental Conflation of Emotion Mapping and Breathing:**
   In `emotion-map.tsx`, the breathing modal is treated merely as a UI embellishment before submitting the emotion map. Completing or cancelling the modal mutates the `emotionMaps` table, leaving breathing completion completely unrecorded in its own right.

---

## 7. Current Completion & Persistence Flow

### Case 1: CBT Reframe Support Mode (`reframe.tsx`)
```
User navigates to CBT Reframe
  --> Selects "Gentle Pause"
  --> Taps "Calming Breathing"
  --> Animation runs indefinitely (4s In -> 3s Hold -> 4s Out)
  --> User taps "Other activities" or navigates back
  --> RESULT: 0 database calls. 0 logs created. 0 telemetry.
```

### Case 2: Somatic Emotion Map Modal (`emotion-map.tsx`)
```
User navigates to Emotion Map
  --> Selects emotion (e.g., "Anxiety") + body region (e.g., "Chest")
  --> Taps "Take a 3-minute guided breathing break"
  --> Modal opens, 180s timer starts counting down
  --> SCENARIOS:
      a) User waits 180s -> handleCompleteBreathing() fires
      b) User taps "Stop & Complete" after 5s -> handleCompleteBreathing() fires
      c) User presses Android hardware back -> modal closes, nothing happens
  --> handleCompleteBreathing():
      --> Calls api.emotionMaps.create({
            userId,
            emotionLabel: "Anxiety",
            selectedRegions: ["Chest"],
            bodyRatings: [...],
            averageIntensity: 7,
            suggestedAction: "Breathe"
          })
  --> RESULT: An entry is added to "emotionMaps". ZERO entries added to any breathing table.
      Premature cancellation at 5s is indistinguishable from 180s full compliance.
```

---

## 8. Interruption / Lifecycle Behavior

The current implementations exhibit significant lifecycle vulnerabilities:

1. **Hardware Back Press (Android) / Modal Dismissal:**
   - In `emotion-map.tsx`, `onRequestClose={() => setShowBreathingModal(false)}` dismisses the modal without recording any partial session, elapsed time, or cycles.
   - In `reframe.tsx`, hardware back exits the reframe screen entirely.

2. **App Backgrounding / Screen Lock:**
   - In `emotion-map.tsx`, `setInterval` in React state continues or gets throttled by the OS background timer limits. Upon resuming, the countdown timer jumps abruptly and falls out of synchronization with the `Animated.timing` circle expansion.
   - The animation does not pause on backgrounding; it continues attempting frame updates.

3. **Unmount & Dangling Timers:**
   - In `reframe.tsx`, line 297: `setTimeout(() => { ... }, 3000)` inside the `start()` callback is **never assigned to a ref and never cleared**. If the student navigates away during the 3-second hold phase, the timer executes on an unmounted component.
   - In `emotion-map.tsx`, `clearTimeout(cycleTimer)` is present in `useEffect`, but active `Animated.timing` animations are not stopped with `activeAnim.stop()`.

4. **False Positive Completions:**
   - The button in `emotion-map.tsx` is titled `"Stop & Complete"`. Tapping it after 2 seconds calls `handleCompleteBreathing()`, which records a completed action recommendation in `emotionMaps` as if the full 3 minutes had elapsed.

---

## 9. Accessibility Findings

1. **Reduced Motion Deficit:**
   - `emotion-map.tsx`: Ignores `AccessibilityInfo.isReduceMotionEnabled()`. The circle constantly zooms between scale 1.0 and 1.8. For students with vestibular or motion sensitivities, this can induce dizziness or nausea.
   - `reframe.tsx`: Ignores `reduceMotion`. Continuous scaling between 1.0 and 2.2.
   - `MitraAvatar.tsx`: **Complies correctly.** Explicitly checks `reduceMotion` and freezes scale at 1.0.

2. **Screen Reader (VoiceOver / TalkBack) Deficit:**
   - In both `emotion-map.tsx` and `reframe.tsx`, the phase text (`"Inhale"`, `"Hold"`, `"Exhale"`) is rendered as standard `<Text>` without `accessibilityLiveRegion="assertive"` or `accessibilityRole="text"`.
   - Visually impaired students receive no spoken notification when the phase shifts from inhale to hold or exhale.

3. **Eyes-Closed Usability:**
   - Guided breathing is typically practiced with eyes closed or soft focus.
   - Neither existing implementation provides haptic feedback (tactile pulse at phase boundary) or audio chimes to guide the user without staring at the screen.

4. **Visual Contrast:**
   - In `emotion-map.tsx`, the timer and subtitle text meet minimum contrast, but the animated circle border relies solely on `Colors.primary` with variable opacity.

---

## 10. Offline Findings

1. **Local Execution Resilience:**
   - All visual assets (SVG icons, Mitra avatar, Animated circle) are 100% local code.
   - Breathing exercises require **zero remote network assets** (no audio streaming or external video dependencies).
   - A student in airplane mode, subway transit, or an exam hall can execute breathing locally with zero latency.

2. **Persistence Vulnerability:**
   - If an internet disconnection occurs when `handleCompleteBreathing()` is triggered in `emotion-map.tsx`, `api.emotionMaps.create` throws an unhandled network error, triggering an error alert or failing silently.
   - There is currently no offline mutation queue for intervention completions.
   - Desired architecture: Breathing execution must succeed locally, award immediate local visual reinforcement (Calm Points / checkmark), and persist to backend via resilient fire-and-forget or background synchronization.

---

## 11. Provenance Analysis

In alignment with Priorities 4–5 and Priority 9 Step 2 (`jpmrLogs`, `reframeLogs`, `microGoals`), breathing sessions can be triggered from multiple clinical and self-care vectors:

### Permitted Source Types (`sourceType`)
- `"self_initiated"`: Launched directly from the Tools Hub or standalone Breathing screen.
- `"emotion_map"`: Launched from somatic recommendation in the Emotion Map.
- `"cbt_support"`: Launched from the Gentle Pause tab in CBT Reframe.
- `"micro_goal"`: Completed in fulfillment of a daily micro-goal (e.g. "breathe_simple").
- `"counselor_recommended"`: Assigned directly by a campus counselor.
- `"routine"`: Scheduled daily wellness reminder.

### Linkage to Screening & Triage (`attemptId`, `triageId`)
- `attemptId: v.optional(v.id("screeningAttempts"))`
- `triageId: v.optional(v.id("triages"))`
- **Rule of Truth:** If breathing is self-initiated or launched from general navigation, `attemptId` and `triageId` **MUST remain undefined**. They must NEVER be fabricated or backfilled from historical screenings.

---

## 12. Security / Authorization Analysis

1. **Row-Level Student Isolation:**
   - Any future mutation (e.g. `api.breathing.logCompletion`) must strictly authenticate via `ctx.auth.getUserIdentity()`.
   - The `userId` must be derived directly from `identity.subject`, never accepted as a client parameter.
   - Students must only be able to query their own breathing logs.

2. **Counselor Read Access:**
   - Counselors must only access breathing records for students within their permitted clinical caseload or institutional tenant scope via `assertCanAccessStudent(ctx, targetUserId)`.

3. **Rate Limiting:**
   - Backend logging must be protected with `checkRateLimit(ctx, userId, "breathing_log_create", 10, 60000)` to prevent denial-of-service or database spamming.

---

## 13. Dashboard Impact

1. **Current Counselor Visibility:**
   - An exhaustive search of `dashboard/` revealed **zero references to breathing** (`breath: 0 matches`).
   - Counselors currently only see `emotionMaps` in the student's longitudinal monitoring timeline (if the timeline filter for somatic monitoring is enabled).

2. **Clinical Utility vs. Surveillance Boundary:**
   - **Recommendation:** Breathing completion should appear in the counselor dashboard under the student's **Intervention Activity & Coping History** (similar to JPMR completions and MicroGoal streaks).
   - **What should be displayed:** Aggregated, clinically actionable metrics:
     - Date & time of session
     - Protocol used (e.g., "Box Breathing (4-4-4-4)", "4-7-8 Breathing")
     - Duration (e.g., "3m 00s") and completion status ("Completed" vs. "Partial")
     - Context / Source (e.g., "Self-initiated", "During high chest tension on Emotion Map")
   - **What must NOT be displayed:** Second-by-second respiratory pacing, raw sensor feeds, or automated clinical diagnostic judgements.

---

## 14. Recommended Target Architecture

The recommended architecture establishes a clean separation between **Engine**, **Protocols**, **Presentation**, and **Persistence**:

```
+-----------------------------------------------------------------------------------------------+
|                                  TARGET MODULAR ARCHITECTURE                                  |
+-----------------------------------------------------------------------------------------------+

                +-------------------------------------------------------+
                |        1. PROTOCOL DEFINITION REGISTRY                |
                |        (constants/BreathingProtocols.ts)              |
                |  - Box Breathing (4-4-4-4)                            |
                |  - Relaxing Breath (4-7-8)                            |
                |  - Coherent Breathing (4-0-4)                         |
                |  - Deep Belly Reset (4-2-4, 3 cycles)                 |
                +-------------------------------------------------------+
                                           |
                                           v
                +-------------------------------------------------------+
                |        2. CANONICAL BREATHING ENGINE (HOOK)           |
                |        (hooks/useBreathingEngine.ts)                  |
                |  - State: IDLE, ACTIVE, PAUSED, COMPLETED             |
                |  - Pure phase progression: INHALE -> HOLD -> EXHALE   |
                |  - Cycle & elapsed time counting                      |
                |  - AppState background pause handler                  |
                |  - Clean timer teardown on unmount                    |
                +-------------------------------------------------------+
                                           |
                                           v
                +-------------------------------------------------------+
                |        3. REUSABLE PRESENTATION COMPONENT             |
                |        (components/breathing/BreathingPlayer.tsx)     |
                |  - Fluid vector animation (mandala / expanding orb)   |
                |  - Reduced motion mode (static pulse / progress bar)  |
                |  - Screen reader announcements (live region)          |
                |  - Optional haptic pacing pulses                      |
                +-------------------------------------------------------+
                                           |
                +--------------------------+----------------------------+
                |                                                       |
                v                                                       v
+-------------------------------+                       +-------------------------------+
|     STANDALONE SCREEN         |                       |     MODAL / EMBEDDED CONTEXT  |
|  (app/(auth)/tools/breathing) |                       |  (emotion-map, reframe pause) |
+-------------------------------+                       +-------------------------------+
                |                                                       |
                +--------------------------+----------------------------+
                                           |
                                           v
                +-------------------------------------------------------+
                |        4. PERSISTENCE & PROVENANCE LAYER              |
                |        (convex/breathing.ts -> "breathingLogs")       |
                |  - Authenticated student isolation                    |
                |  - Tracks duration, cycles, status, provenance        |
                |  - Counselor dashboard visibility via timeline        |
                +-------------------------------------------------------+
```

---

## 15. Proposed Minimal Persistence Model

A minimal, secure schema to be added to `convex/schema.ts` in Step 4B:

```typescript
// Proposed addition to convex/schema.ts
breathingLogs: defineTable({
  userId: v.string(),
  protocolId: v.string(), // "box_4444" | "relax_478" | "coherent_404" | "belly_3"
  protocolName: v.string(), // "Box Breathing", "4-7-8 Relaxing", etc.
  sourceType: v.string(), // "self_initiated" | "emotion_map" | "cbt_support" | "micro_goal" | "counselor"
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  durationSeconds: v.number(),
  cyclesCompleted: v.number(),
  targetCycles: v.number(),
  status: v.string(), // "completed" | "partial" | "abandoned"
  attemptId: v.optional(v.id("screeningAttempts")),
  triageId: v.optional(v.id("triages")),
  createdAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_createdAt", ["createdAt"])
  .index("by_userId_and_createdAt", ["userId", "createdAt"])
  .index("by_attemptId", ["attemptId"])
  .index("by_triageId", ["triageId"]),
```

### Justification of Fields
- `userId`: Enforces tenant and student data isolation.
- `protocolId` & `protocolName`: Distinguishes clinically different protocols without hardcoding strings.
- `sourceType`: Preserves audit provenance across features.
- `durationSeconds` & `cyclesCompleted`: Quantifies actual practice; prevents 5-second exits from registering as full sessions.
- `status`: Cleanly differentiates full completions from partial practice.
- `attemptId` & `triageId`: Preserves clinical lineage when launched from screening/triage workflows; undefined otherwise.
- **Excluded:** No clinical questionnaire scores, no subjective thought logs, no facial/mic telemetry.

---

## 16. Clinical/Product Decisions Required

Before implementation in Step 4B, the following decisions must be formally approved:

1. **Protocol Standardization:**
   - Reconcile `reframe.tsx` 4-3-4 timing with standard 4-4-4 Box Breathing. Recommend adopting 4-4-4 as the default calming protocol and deprecating 4-3-4.
2. **Implementation of 4-7-8 Breathing:**
   - Decide whether to implement the 4-7-8 protocol (4s Inhale, 7s Hold, 8s Exhale) as referenced in `README.md` and `common/interventions.ts`.
3. **Standalone Breathing Entry Point:**
   - Approve adding a first-class "Breathing & Calm" card in `app/(auth)/(tabs)/tools.tsx` so students can practice breathing directly without navigating through Emotion Map or CBT Reframe.
4. **Haptic & Audio Pacing:**
   - Confirm whether gentle haptic vibrations at phase transitions are approved as optional defaults for eyes-closed breathing.

---

## 17. Implementation Plan for Step 4B

Step 4B will be executed across 5 modular sub-steps:

- **Sub-step 4B.1: Protocol Registry & Core Engine Hook**
  - Implement `constants/BreathingProtocols.ts` with standardized timing definitions.
  - Implement `hooks/useBreathingEngine.ts` with comprehensive unit tests for phase order, timers, cycles, and pause/resume.
- **Sub-step 4B.2: Accessible Breathing Component**
  - Build `components/breathing/BreathingPlayer.tsx` supporting vector animation, reduced motion toggle, accessibility live regions, and haptic feedback.
- **Sub-step 4B.3: Backend Schema & Mutations**
  - Define `breathingLogs` in `convex/schema.ts`.
  - Implement `convex/breathing.ts` (`logSession`, `getUserBreathingHistory`) with rate limiting, student isolation, and counselor authorization.
- **Sub-step 4B.4: Screen Integration & Migration**
  - Replace divergent inline breathing in `app/(auth)/tools/emotion-map.tsx` with the canonical player.
  - Replace divergent inline breathing in `app/(auth)/tools/reframe.tsx` with the canonical player.
  - Add standalone Breathing route `/tools/breathing` and wire to `app/(auth)/(tabs)/tools.tsx`.
- **Sub-step 4B.5: Dashboard Integration & Verification**
  - Expose breathing logs in counselor student activity timeline.
  - Execute end-to-end vitest suite, TypeScript verification, and production build checks.

---

## 18. Test Plan

The following 16 test suites must be created in Step 4B:

1. **Protocol Integrity:** Validates that all protocol definitions have positive phase durations, non-negative hold/rest times, and valid cycle targets.
2. **Phase Sequencing:** Verifies transition sequence: `Inhale` -> `Hold` -> `Exhale` -> `Rest` -> next cycle `Inhale`.
3. **Timer Decrement:** Verifies exact millisecond/second timing progression.
4. **Cycle Progression:** Verifies `cyclesCompleted` increments only when an entire cycle finishes.
5. **Session Completion:** Asserts `status === "completed"` when target cycles are reached.
6. **Early Termination / Partial Session:** Asserts `status === "partial"` with accurate `durationSeconds` and `cyclesCompleted` if stopped before target.
7. **Interruption / Unmount:** Verifies all timers and active animations are cleanly cancelled on component unmount with zero memory leaks.
8. **App Background Pause:** Verifies transition to `PAUSED` state on `AppState` background change.
9. **Idempotency:** Ensures duplicate completion events cannot be submitted for the same session.
10. **Reduced Motion:** Asserts animation scale remains 1.0 when reduced motion is enabled.
11. **Accessibility Announcements:** Verifies screen reader live region receives correct textual announcements on phase change.
12. **Offline Resilience:** Verifies the player functions completely with network disconnected.
13. **Backend Persistence Schema:** Verifies `breathingLogs` validation rules (non-negative durations, valid status enum).
14. **Provenance Tracking:** Verifies `sourceType` is correctly recorded and `attemptId`/`triageId` are attached only when present.
15. **Student Authorization:** Asserts that students cannot read or write another student's breathing logs.
16. **Counselor Access:** Asserts that authenticated counselors can read breathing logs for assigned students while non-counselors are denied.

---

## 19. Scope Compliance

During this Step 4 audit:
- ❌ NO production application code was altered.
- ❌ NO schema modifications were made.
- ❌ NO existing breathing UI was refactored.
- ❌ NO clinical protocols were changed.
- ❌ NO dashboard code was modified.
- ✅ Full inspection and inventory across all repositories was completed.
- ✅ Existing test suites were executed to verify system stability.

---

## 20. Final Status

**AUDIT COMPLETE — IMPLEMENTATION PENDING**
