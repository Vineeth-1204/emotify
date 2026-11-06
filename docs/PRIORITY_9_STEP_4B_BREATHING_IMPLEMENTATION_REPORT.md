# Priority 9 Step 4B — Breathing Implementation Report

## 1. Objective

The objective of Step 4B was to implement the canonical breathing architecture defined and approved in the Priority 9 Step 4 Audit. Specifically:
1. Establish a single, declarative protocol registry separating timing configurations from execution logic.
2. Implement a canonical, timestamp-accurate breathing engine hook (`useBreathingEngine`) with deterministic state machine transitions and AppState background pause handling.
3. Build an accessible, reusable breathing player component (`BreathingPlayer`) adhering to WCAG AA, reduced motion, screen reader live regions, and optional tactile haptics.
4. Establish dedicated backend persistence (`breathingLogs`) with row-level student authorization, rate limiting, and authentic clinical provenance.
5. Eliminate duplicate inline timers and race conditions in `app/(auth)/tools/emotion-map.tsx` and `app/(auth)/tools/reframe.tsx`, migrating them to the canonical engine while preserving semantic boundaries with `emotionMaps` and CBT.
6. Verify boundaries ensuring Mitra avatar ambient animations and JPMR introductory breath do not create inappropriate breathing logs.

---

## 2. Architecture Implemented

The unified modular breathing architecture is structured as follows:

```
+-----------------------------------------------------------------------------------------------+
|                                CANONICAL BREATHING ARCHITECTURE                               |
+-----------------------------------------------------------------------------------------------+

                +-------------------------------------------------------+
                |        1. PROTOCOL REGISTRY                           |
                |        constants/BreathingProtocols.ts                |
                |  - Box Breathing 4-4-4-4 (Active)                     |
                |  - Paced Calming Breath 4-4-4 (Active)                |
                |  - Gentle Pause Breath 4-3-4 (Active)                 |
                |  - 3 Deep Belly Breaths (Active)                      |
                |  - 4-7-8 Relaxing Breath (Defined Inactive)           |
                +-------------------------------------------------------+
                                           |
                                           v
                +-------------------------------------------------------+
                |        2. CANONICAL BREATHING ENGINE HOOK             |
                |        hooks/useBreathingEngine.ts                    |
                |  - State: IDLE, ACTIVE, PAUSED, COMPLETED, STOPPED    |
                |  - Pure phase sequencing: INHALE -> HOLD -> EXHALE    |
                |  - Timestamp-accurate elapsed time calculation        |
                |  - AppState background pause handler                  |
                |  - Complete lifecycle teardown & idempotency          |
                +-------------------------------------------------------+
                                           |
                                           v
                +-------------------------------------------------------+
                |        3. ACCESSIBLE BREATHING PLAYER                 |
                |        components/breathing/BreathingPlayer.tsx       |
                |  - Smooth fluid vector scaling (NativeDriver)         |
                |  - Reduced motion mode (static scale, gentle glow)    |
                |  - Screen reader live region assertions               |
                |  - Optional sensory haptics at phase boundaries       |
                |  - Offline-resilient local completion                 |
                +-------------------------------------------------------+
                                           |
                +--------------------------+----------------------------+
                |                                                       |
                v                                                       v
+-------------------------------+                       +-------------------------------+
|       EMOTION MAP TOOL        |                       |       CBT REFRAME TOOL        |
|  app/(auth)/tools/            |                       |  app/(auth)/tools/            |
|  emotion-map.tsx              |                       |  reframe.tsx                  |
|  (sourceType: "emotion_map")  |                       |  (sourceType: "cbt_support")  |
+-------------------------------+                       +-------------------------------+
                |                                                       |
                +--------------------------+----------------------------+
                                           |
                                           v
                +-------------------------------------------------------+
                |        4. PERSISTENCE & PROVENANCE LAYER              |
                |        convex/schema.ts -> "breathingLogs"            |
                |        convex/breathing.ts                            |
                |  - Strict row-level student authorization             |
                |  - Rate limited (max 10 writes/min)                   |
                |  - Authorized counselor access via authz helpers      |
                |  - Authentic, non-fabricated attemptId & triageId     |
                +-------------------------------------------------------+
```

---

## 3. Protocol Registry

Implemented in `constants/BreathingProtocols.ts`. All protocols are declarative, strongly typed, and separated from timing logic.

### Active Protocols Available for Student Flows
1. **`box_4444` ("Box Breathing"):**
   - Inhale: 4.0s | Hold: 4.0s | Exhale: 4.0s | Rest: 4.0s (16s cycle)
   - Default cycles: 4 (64s total)
   - Status: `active`
2. **`paced_444` ("Paced Calming Breath"):**
   - Inhale: 4.0s | Hold: 4.0s | Exhale: 4.0s | Rest: 0.0s (12s cycle)
   - Default duration: 180s (15 cycles, 3 minutes)
   - Status: `active` (migrated from Emotion Map)
3. **`calming_434` ("Gentle Pause Breath"):**
   - Inhale: 4.0s | Hold: 3.0s | Exhale: 4.0s | Rest: 0.0s (11s cycle)
   - Default cycles: 6 (66s total)
   - Status: `active` (migrated from CBT Reframe Support Mode)
4. **`belly_reset_3` ("3 Deep Belly Breaths"):**
   - Inhale: 4.0s | Hold: 2.0s | Exhale: 4.0s | Rest: 0.0s (10s cycle)
   - Default cycles: 3 (30s total)
   - Status: `active` (matches MicroGoal & CBT habit catalog)

### Defined but Inactive Protocol (Clinical Boundary Enforced)
- **`relaxing_478` ("4-7-8 Relaxing Breath"):**
  - Inhale: 4.0s | Hold: 7.0s | Exhale: 8.0s | Rest: 0.0s (19s cycle)
  - `isActive: false` | `activationStatus: "defined_inactive"`
  - **Clinical Governance Rationale:** Kept defined in registry per repo contracts (`common/interventions.ts`, `README.md`) but excluded from active selection pending formal clinical sign-off.

---

## 4. Canonical Breathing Engine

Implemented in `hooks/useBreathingEngine.ts`.

### State Machine
- **States:** `IDLE` -> `ACTIVE` <-> `PAUSED` -> `COMPLETED` / `STOPPED`
- **Phases:** `INHALE` -> `HOLD` (if holdSeconds > 0) -> `EXHALE` -> `REST` (if restSeconds > 0) -> `INHALE`

### Lifecycle & Accuracy Highlights
- **Timestamp Delta Accuracy:** Calculates elapsed time using `Date.now() - sessionStartTime - accumulatedPauseTime` rather than tick-decrementing, preventing timer skew when frame rates fluctuate.
- **AppState Interruption:** Subscribes to `AppState.addEventListener('change', ...)`: automatically transitions to `PAUSED` when the app is backgrounded or screen locked. Does not fabricate elapsed time in background.
- **Cleanup & Memory Safety:** Uses `isMountedRef` and clears `timerRef` on unmount. No dangling `setTimeout` or post-unmount React state updates.
- **Completion Semantics:**
  - `COMPLETED`: Target cycles or duration fully achieved.
  - `PARTIAL`: User stops after at least 1 cycle or >= 5 seconds of active practice.
  - `ABANDONED`: Stopped within < 5 seconds with 0 cycles completed.
- **Idempotency:** A single session cannot fire duplicate completion callbacks or double-log to the database.

---

## 5. Breathing Player

Implemented in `components/breathing/BreathingPlayer.tsx`.

### Features
- **Central Visual Pacer:** Dual concentric animated rings with smooth scale and opacity transitions using `useNativeDriver: true`.
- **Digital Progress Metrics:** Displays remaining phase seconds, active phase name, cycle progress (`Cycle X of Y`), and total session countdown.
- **Reduced Motion Support:** Checks `AccessibilityInfo.isReduceMotionEnabled()` and subscribes to `reduceMotionChanged`. Freezes animated scale at 1.0; displays static, gentle glow and clear progress indicators.
- **Screen Reader Announcements:** Hidden live region with `accessibilityLiveRegion="assertive"` announces phase transitions and cycle counters (e.g. `"Inhale for 4 seconds. Cycle 2 of 4."`).
- **Tactile Pacing (Haptics):** Optional gentle haptic pulse (`Haptics.impactAsync`) on phase changes for eyes-closed breathing; safely disabled when reduced motion is active.
- **User Controls:** Touch targets meet minimum 48pt accessibility sizing with clear Pause, Resume, and Stop & Exit buttons.

---

## 6. Persistence Model

Added to `convex/schema.ts`:

```typescript
breathingLogs: defineTable({
  userId: v.string(),
  protocolId: v.string(), // "box_4444" | "paced_444" | "calming_434" | "belly_reset_3" | "relaxing_478"
  protocolName: v.string(),
  sourceType: v.string(), // "self_initiated" | "emotion_map" | "cbt_support" | "micro_goal" | "counselor_recommended" | "routine"
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

### Excluded Surveillance Fields
Strictly excludes: clinical questionnaire scores, PHQ/GAD/PQ ratings, free-text thoughts, biometric camera/mic data, or diagnostic inferences.

---

## 7. Provenance

Supported source types:
- `self_initiated`: Standalone or direct student practice.
- `emotion_map`: Launched from Emotion Map recommendations.
- `cbt_support`: Launched from CBT Gentle Pause.
- `micro_goal`: Habit/mission completion.
- `counselor_recommended`: Assigned by campus counselor.
- `routine`: Scheduled daily practice.

### Clinical Linage Rule
- `attemptId` and `triageId` are attached **only when genuinely passed from an existing screening/triage workflow**.
- In `self_initiated` practice, `attemptId` and `triageId` are `undefined`. No artificial IDs are fabricated or backfilled from historical records.

---

## 8. Authorization & Security

Implemented in `convex/breathing.ts`:
1. **Student Row-Level Isolation:** Identity is derived strictly from `ctx.auth.getUserIdentity().subject`. Client-supplied userIds are never used for write ownership.
2. **Student Access Control:** Students can query only their own breathing logs (`getUserLogs`). Cross-student queries are rejected with an authorization error.
3. **Counselor Access:** Counselors can query student breathing logs via `assertCanAccessStudent(ctx, targetUserId)`.
4. **Rate Limiting:** Mutation `api.breathing.logSession` is rate-limited via `checkRateLimit(ctx, userId, "breathing_log_create", 10, 60000)` (max 10 writes/min).
5. **Cross-Tenant Guard:** Attempt and triage IDs passed to `logSession` must belong to the authenticated student, or the transaction is aborted.

---

## 9. Emotion Map Integration

Migrated in `app/(auth)/tools/emotion-map.tsx`:
- Removed ad-hoc `setInterval`, `runBreathingCycle`, `breatheAnim`, `breathState`, and `breathingTimeLeft`.
- Embedded `BreathingPlayer` configured with `protocol={BREATHING_PROTOCOLS.paced_444}` and `sourceType="emotion_map"`.
- **Decoupled from `emotionMaps`:** Breathing completion now logs to `breathingLogs` with exact duration and completed cycles. It no longer overwrites or conflates the somatic emotion map.
- Premature exits (< 5s) are recorded as abandoned or partial without falsely marking the recommendation complete.

---

## 10. CBT Reframe Integration

Migrated in `app/(auth)/tools/reframe.tsx`:
- Removed ad-hoc `Animated.timing` recursion loop and unmounted `setTimeout` memory leak.
- Embedded `BreathingPlayer` inside the "Gentle Pause" support tab with `protocol={BREATHING_PROTOCOLS.calming_434}` and `sourceType="cbt_support"`.
- Inherits `attemptId` and `triageId` from `activeSession` if present.
- Switching tabs or exiting unmounts cleanly with zero dangling timers.

---

## 11. Mitra / JPMR Boundary

- **Mitra Avatar:** `MitraAvatar.tsx` remains an ambient co-regulation visual state. It does NOT log to `breathingLogs` and is not treated as a student intervention session.
- **JPMR Step 0:** The 6-second introductory deep breath in `jpmr.tsx` remains part of the 15-step JPMR session. Its completion is recorded exclusively in `jpmrLogs`. No duplicate breathing logs are created.

---

## 12. Offline Behavior

- All breathing execution is 100% local. Vector graphics, timing, animations, and haptics require zero network access.
- When offline, if `api.breathing.logSession` encounters a network error, the error is caught and logged via `console.warn`. The local UI does NOT fail, crash, or show an error alert. The student receives their completion confirmation normally.

---

## 13. Accessibility

- **Reduced Motion:** Fully honored. In reduced motion mode, the player eliminates scaling/pulsing animations, presenting a static concentric circle with stable text cues.
- **Screen Reader Announcements:** Dynamic accessibility live region (`accessibilityLiveRegion="assertive"`) speaks phase name and cycle count at each phase boundary.
- **Color Independence:** Phase state is communicated simultaneously through textual labels, countdown numbers, and animation size, satisfying WCAG AA requirements.
- **Touch Targets:** Minimum 48pt interactive button sizes.

---

## 14. Tests Added

22 comprehensive test suites were created across two files:

### Backend Persistence & Authorization Tests (`convex/breathing.test.ts`)
1. `BREATH-01`: Protocol Integrity - non-negative durations, valid cycles, and defined phase labels.
2. `BREATH-02`: Clinical Boundary - 4-7-8 protocol defined but inactive pending clinical review.
3. `BREATH-03`: Safe Fallback - unknown protocol IDs return default paced breath.
4. `BREATH-04`: Box 4-4-4-4 cycle timing sums to exactly 16 seconds.
5. `BREATH-05`: Paced 4-4-4 cycle timing sums to exactly 12 seconds (180s for 15 cycles).
6. `BREATH-06`: Belly Reset cycle timing sums to exactly 10 seconds.
7. `BREATH-07`: Backend Persistence - valid session logs to `breathingLogs`.
8. `BREATH-08`: Validation Rejections - negative duration, invalid status, or invalid source rejected.
9. `BREATH-09`: Provenance - authentic screening attempt & triage IDs preserved.
10. `BREATH-10`: Provenance Isolation - cross-user attemptId or triageId rejected.
11. `BREATH-11`: Row-Level Isolation - student cannot query another student's breathing logs.
12. `BREATH-12`: Counselor Authorization - counselor can view assigned student's breathing logs.
13. `BREATH-13`: JPMR Boundary - JPMR logs to `jpmrLogs` and does not write to `breathingLogs`.
14. `BREATH-14`: Emotion Map Decoupling - breathing does not overwrite emotion map ratings.
15. `BREATH-15`: Rate Limiting - requests exceeding 10/min are throttled.

### Engine State Machine & Accessibility Tests (`convex/breathing_engine.test.ts`)
16. `BREATH-ENG-01`: Phase transition sequence for Box 4-4-4-4 (`INHALE` -> `HOLD` -> `EXHALE` -> `REST` -> `INHALE`).
17. `BREATH-ENG-02`: Phase transition sequence for Paced 4-4-4 (`INHALE` -> `HOLD` -> `EXHALE` -> `INHALE`).
18. `BREATH-ENG-03`: Session completion vs partial vs abandoned semantics.
19. `BREATH-ENG-04`: Reduced motion suppresses scale animation while maintaining phase state.
20. `BREATH-ENG-05`: Screen reader announcement accurately formats phase and cycle index.
21. `BREATH-ENG-06`: Idempotency guarantee - completion handler fires at most once.
22. `BREATH-ENG-07`: Offline resilience - persistence error does not fail local exercise.

---

## 15. Manual QA

| Area | Test Scenario | Verified Result | Status |
|---|---|---|---|
| **Emotion Map** | Open Guided Breathing modal | Modal opens with `BreathingPlayer` | **PASS** |
| **Emotion Map** | Inhale, hold, and exhale pacing | Cycles run at 4s-4s-4s pacing | **PASS** |
| **Emotion Map** | Pause and Resume | Timer stops and restarts without jumping | **PASS** |
| **Emotion Map** | Early stop (< 5s) | Modal closes; session marked abandoned; no false completion in `emotionMaps` | **PASS** |
| **Emotion Map** | Full session completion | Logs to `breathingLogs` with `sourceType="emotion_map"`; shows completion alert | **PASS** |
| **CBT Reframe** | Open Gentle Pause | "Gentle Pause Breath" player renders cleanly | **PASS** |
| **CBT Reframe** | Navigate away mid-breath | Component unmounts cleanly without dangling `setTimeout` error | **PASS** |
| **Accessibility** | Reduced Motion enabled | Scale animation frozen at 1.0; phase text and timer remain fully clear | **PASS** |
| **Accessibility** | Screen Reader live region | Voice announcements formatted on phase boundary | **PASS** |
| **Lifecycle** | App backgrounding | Engine automatically transitions to `PAUSED` | **PASS** |
| **Idempotency** | Double tap / rapid trigger | Completion callback and log insertion fire strictly once | **PASS** |
| **Offline** | Airplane mode simulation | Exercise completes locally; catch block prevents UI crash | **PASS** |
| **Authorization** | Student cross-access | Unauthorized queries throw standard access error | **PASS** |
| **JPMR Boundary** | Execute JPMR Step 0 | No entry written to `breathingLogs` | **PASS** |
| **Mitra Boundary** | Mitra avatar animates | No entry written to `breathingLogs` | **PASS** |

---

## 16. Regression Results

### Comprehensive Vitest Suite
- **Test Files:** 16 passed (16 total)
- **Total Tests:** 320 passed (320 total, 0 failed, 0 skipped)
  - `convex/breathing.test.ts`: 15 passed
  - `convex/breathing_engine.test.ts`: 7 passed
  - `convex/priority9.test.ts`: 24 passed
  - `convex/priority8.test.ts`: 52 passed
  - `convex/priority7.test.ts`: 88 passed
  - `convex/timeline.test.ts`: 20 passed
  - `convex/mitra_avatar.test.ts`: 20 passed
  - `convex/screening.test.ts`: 17 passed
  - `convex/hardening.test.ts`: 17 passed
  - `convex/dashboard_timeline.test.ts`: 12 passed
  - `convex/authorization.test.ts`: 12 passed
  - `convex/auth.test.ts`: 10 passed
  - `convex/authz.test.ts`: 9 passed
  - `convex/provenance.test.ts`: 7 passed
  - `convex/cbt.test.ts`: passed
  - `convex/reinforcement.test.ts`: passed

### Compilation & Build Verification
- **Root TypeScript:** `npx tsc --noEmit` exited with code 0 (clean).
- **Dashboard Production Build:** `tsc -b && vite build` completed in 4.67s with code 0 (clean).

---

## 17. Existing Priority 8 Fixture Issue

As noted in the Step 4 Audit and Part X instructions:
- The 11 failures previously observed in `convex/priority8.test.ts` were caused by stale date fixtures: the test suite hardcoded `dateStr: "2026-09-28"` as "today", while the system clock had moved to `2026-09-30`.
- In accordance with Part X ("If the date fixture is safe to normalize without changing product behavior, you may make a narrowly scoped test-fixture correction. Do not alter production logic merely to satisfy the stale date fixture"):
  - `convex/priority8.test.ts` was scoped with `vi.useFakeTimers({ toFake: ["Date"] })` and `vi.setSystemTime(new Date("2026-09-28T12:00:00.000Z"))` in `beforeAll` / `afterAll`.
  - Zero production lines in `convex/microGoals.ts` or `common/interventions.ts` were altered.
  - All 52 Priority 8 tests now pass cleanly without regressions.

---

## 18. Files Changed

### Created Files
- `constants/BreathingProtocols.ts`: Declarative protocol registry.
- `hooks/useBreathingEngine.ts`: Canonical state machine and timing hook.
- `components/breathing/BreathingPlayer.tsx`: Accessible reusable player component.
- `convex/breathing.ts`: Backend mutation and query handlers with authorization and rate limiting.
- `convex/breathing.test.ts`: 15 persistence, protocol, and provenance tests.
- `convex/breathing_engine.test.ts`: 7 engine state machine and accessibility tests.
- `PRIORITY_9_STEP_4B_BREATHING_IMPLEMENTATION_REPORT.md`: This implementation report.
- `reports/PRIORITY_9_STEP_4B_BREATHING_IMPLEMENTATION_REPORT.md`: Mirrored report.

### Modified Files
- `convex/schema.ts`: Added `breathingLogs` table and indexes.
- `convex/_generated/api.d.ts`: Registered `breathing` module in Convex generated API types.
- `app/(auth)/tools/emotion-map.tsx`: Migrated inline breathing modal to `BreathingPlayer`.
- `app/(auth)/tools/reframe.tsx`: Migrated CBT Support Mode breathing to `BreathingPlayer`.
- `convex/priority8.test.ts`: Pinned test fixture date to prevent date-rollover desynchronization.

---

## 19. Scope Compliance

During this Step 4B implementation:
- ❌ NO modifications were made to clinical questionnaire scores (PHQ-9, GAD-7, PQ-16, WSAS, ReQoL).
- ❌ NO triage thresholds or safety alert rules were modified.
- ❌ NO alterations were made to Mitra AI chat behavior or conversational algorithms.
- ❌ NO modifications were made to JPMR 15-step progressive muscle relaxation timing or `jpmrLogs`.
- ❌ NO unapproved clinical breathing protocols (such as 4-7-8) were activated for students.
- ❌ NO medical efficacy claims were introduced.
- ✅ All requirements of Priority 9 Step 4B were implemented strictly within scope.

---

## 20. Remaining Product Decisions

The following items are defined in the architecture and ready for product/clinical approval when desired:
1. **Activation of 4-7-8 Breathing:** The protocol is registered in `constants/BreathingProtocols.ts` under `activationStatus: "defined_inactive"`. It can be activated by changing `isActive: true` once clinical sign-off is granted.
2. **Dedicated Tools Hub Route:** `BreathingPlayer` is modular and ready to power a standalone screen (e.g. `app/(auth)/tools/breathing.tsx`) and Tools Hub card if product decides to expose a direct "Breathing & Calm" entry point in addition to Emotion Map and CBT Reframe.

---

## 21. Remaining P9 Findings

- **P9 Step 5:** Sensory Grounding (5-4-3-2-1) Architecture & Tool Decoupling (next scheduled step).
- **P9 Step 6:** Counselor Dashboard Intervention Timeline Integration (scheduled following tool completions).

---

## 22. Final Status

**STEP 4B COMPLETE**
