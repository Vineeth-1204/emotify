# Priority 9 Step 1 — CBT / Guided Intervention & Media Audit

**Date:** September 28, 2026  
**Audit Stage:** Priority 9 — Step 1 (Read-Only State & Architectural Audit)  
**Status:** AUDIT COMPLETE — READY FOR P9 IMPLEMENTATION  
**Test Baseline:** 274 / 274 Vitest tests passing (13 test files)  
**TypeScript Status:** `npx tsc --noEmit` clean (0 errors)  
**Dashboard Build Status:** `npm run build --prefix dashboard` clean (0 errors)

---

## 1. Executive Summary

With Priority 8 officially closed and its clinical decoupling, reframe architecture, and deterministic habit engine verified, **Priority 9 focuses on CBT, Guided Interventions, and Media Systems**.

This audit established the comprehensive, ground-truth state of the platform's somatic and cognitive tools:
1. **CBT Cognitive Restructuring is Robust:** `cbtSessions` and the server-authoritative bridge to `reframeLogs` are structurally solid. Gemini integration operates with strict non-clinical prompts, resilient offline fallback (`handleMockResponse`), and server-authoritative safety escalation.
2. **JPMR (Jacobson Progressive Muscle Relaxation) is Functional but Fragile:** The 15-step UI sequencer operates effectively with local text-to-speech (`expo-speech`), but its demonstration video player relies on remote third-party preview URLs from Mixkit (`assets.mixkit.co`). This causes real-device failures ("black rectangle"), violates third-party preview hotlinking norms, and leaves the tool vulnerable to network disconnection.
3. **Critical Security Finding in Video Storage (P0):** `convex/jpmrVideos.ts` exposes mutations (`clearAllJpmrVideos`, `generateUploadUrl`, `saveVideoRecord`) with **zero authentication checks**. Any unauthenticated caller can wipe all video records from Convex storage.
4. **Breathing and Sensory Grounding are Fragmented & Unpersisted (P1):**
   - Breathing exercises exist in three disjointed forms: `reframe.tsx` Support Mode, `emotion-map.tsx` modal, and `jpmr.tsx` Step 0. None of the breathing sessions are persisted to a database table.
   - 5-4-3-2-1 Sensory Grounding exists only as an embedded static card within Reframe Support Mode; it has no standalone route, no session tracking, and no database persistence.
5. **Media Architecture Lacks Bundled Intervention Assets:** No local MP4 or audio files exist for breathing, meditation, or muscle relaxation. The repository contains 2 bundled video assets (`landing-page.mp4`, `loading-video.mp4`) and 1 unused dead asset (`landing-page2.mp4`), but no production-grade, locally bundled intervention media.

---

## 2. Current Intervention Inventory

A full scan of the codebase identified the following intervention components:

| Intervention Component | Location | Type | Storage / Persistence | Student Access | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CBT Restructuring (Reframe)** | `app/(auth)/tools/reframe.tsx` | Interactive Screen | `cbtSessions`, `reframeLogs` | Tools Tab (`/tools/reframe`) | Fully Functional |
| **Saved Reframes** | `app/(auth)/tools/saved-reframes.tsx` | History / Viewer | Reads `reframeLogs` (fallback `reframes`) | In-tool navigation | Fully Functional |
| **JPMR Relaxation** | `app/(auth)/tools/jpmr.tsx` | Guided 15-step Tool | `jpmrLogs`, local `SecureStore` | Tools Tab (`/tools/jpmr`) | Partially Functional (Video issues) |
| **JPMR Video Storage** | `convex/jpmrVideos.ts` | Convex Backend | `jpmrVideos` table + `_storage` | Backend Service | **P0 Auth Vulnerability** |
| **Calming Breathing (Reframe)** | `app/(auth)/tools/reframe.tsx` | Support Mode Tab | None (Ephemeral animated circle) | Inside Reframe Support Mode | Unpersisted UI |
| **Guided Breathing (Emotion Map)** | `app/(auth)/tools/emotion-map.tsx` | Modal Activity | None (Ephemeral 3-min timer) | Inside Emotion Map action | Unpersisted UI |
| **Sensory Grounding (5-4-3-2-1)** | `app/(auth)/tools/reframe.tsx` | Support Mode Tab | None (Static SVG list) | Inside Reframe Support Mode | Unpersisted UI / Embedded |
| **Free Writing** | `app/(auth)/tools/reframe.tsx` | Support Mode Tab | None (Discarded on unmount) | Inside Reframe Support Mode | Unpersisted UI / Embedded |
| **Daily Routine Micro-Goals** | `app/(auth)/tools/microgoals.tsx` | Habit Activation Hub | `microGoals`, `dailyCheckins` | Tools Tab & Home Hub | Fully Functional |
| **CBT Recovery Plan Goals** | `app/(auth)/tools/recovery-plan.tsx` | Goal Selector | `microGoals` (`sourceType: "cbt"`) | Post-CBT Session screen | Fully Functional |
| **Mitra Companion Chat** | `app/(auth)/tools/companion.tsx` | AI Conversationalist | `aiCompanionLogs` | Tools Tab (`/tools/companion`) | Fully Functional |
| **Counselor Appointments** | `app/(auth)/tools/appointments.tsx` | Booking Workflow | `counsellorRequests`, `followUps` | Tools Tab (`/tools/appointments`) | Fully Functional |

---

## 3. CBT Session Architecture

### Schema & Data Model (`cbtSessions` in `convex/schema.ts`):
```typescript
cbtSessions: defineTable({
  userId: v.string(),
  sourceType: v.optional(v.string()), // "self_initiated" | "screening" | "triage" | "counselor" | "routine"
  attemptId: v.optional(v.id("screeningAttempts")),
  triageId: v.optional(v.id("triages")),
  situation: v.optional(v.string()),
  automaticThought: v.optional(v.string()),
  emotion: v.optional(v.string()),
  emotionBefore: v.optional(v.number()),
  emotionAfter: v.optional(v.number()),
  thinkingStyle: v.optional(v.string()),
  cbtDistortion: v.optional(v.string()),
  clarificationQuestion: v.optional(v.string()),
  clarificationOptions: v.optional(v.array(v.string())),
  clarificationAnswer: v.optional(v.string()),
  challengeQuestions: v.optional(v.array(v.string())),
  challengeAnswers: v.optional(v.array(v.string())),
  reflection: v.optional(v.string()),
  balancedThoughtsOptions: v.optional(v.array(v.string())),
  balancedThought: v.optional(v.string()),
  beliefScore: v.optional(v.number()),
  goalCompletion: v.optional(v.boolean()),
  selectedGoalIds: v.optional(v.array(v.string())),
  recommendedGoals: v.optional(v.any()),
  recommendedGoal: v.optional(v.any()),
  conversation: v.array(v.object({
    role: v.string(), // "assistant" | "user"
    content: v.string(),
    timestamp: v.number(),
  })),
  stepIndex: v.number(),
  timestamp: v.number(),
  sessionStatus: v.string(), // "active" | "completed" | "expired" | "safety_mode" | "support_mode"
  currentStep: v.string(),   // "understanding" | "clarification" | "guided_discovery" | "reflection" | "balanced_thought" | "belief" | "emotion_after" | "recovery_coach" | "completed" | "safety_mode" | "support_mode"
  riskFlags: v.optional(v.array(v.string())),
}).index("by_userId", ["userId"])
```

### Complete Implemented State Lifecycle:
1. **START (`startSession`):**
   - If `forceNew: false` and active session is $<24$ hours old, returns session for resume.
   - If active session is $>24$ hours old, marks `sessionStatus: "expired"` and creates fresh session.
   - Initializes `conversation` with empathetic greeting.
2. **UNDERSTANDING:**
   - Evaluates risk/danger (`riskDetected`). If risk detected, transitions to `safety_mode`.
   - Assesses unresponsive/rejecting text. If triggered, transitions to `support_mode`.
   - Checks understanding of Situation + Thought + Emotion. If sufficient, transitions to `clarification` or `guided_discovery`. If not, asks follow-up question with anti-repetition protection.
3. **CLARIFICATION (Optional):**
   - Presents two student-friendly trap options.
   - When answered or skipped, sets distortion and proceeds to `guided_discovery`.
4. **GUIDED DISCOVERY:**
   - Asks 3 challenge questions sequentially (`stepIndex: 0, 1, 2`).
   - Supports `skipQuestion` without injecting fake user messages.
   - On completion of 3rd question, transitions to `reflection`.
5. **REFLECTION:**
   - Prompts student to reflect on all questions.
   - Generates 3 candidate balanced thoughts; transitions to `balanced_thought`.
6. **BALANCED THOUGHT (`selectBalancedThought`):**
   - Student selects and customizes balanced thought; transitions to `belief`.
7. **BELIEF RATING (`submitBeliefRating`):**
   - Student rates belief 0–100%; transitions to `emotion_after`.
8. **EMOTION AFTER (`submitEmotionAfterRating`):**
   - Student rates post-reframe emotion 0–10; bridges finalized reframe to `reframeLogs`; transitions to `recovery_coach`.
9. **RECOVERY COACH GOAL SELECTION (`acceptGoal` / `skipGoal`):**
   - Displays 4 personalized behavioral activation micro-goals.
   - On accept or skip, patches `sessionStatus: "completed"`, `currentStep: "completed"`.
10. **COMPLETION / SUMMARY:**
    - Renders summary screen with tension reduction % and scheduled goals.

---

## 4. CBT Content Audit

| Content Element | Location | Generation Type | Student-Facing | Can Repeat? | Content Classification | Clinical Approval Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Initial Greeting** | `cbt.ts` L105 | Static | Yes | No | A (Engineering) | Standard supportive text |
| **Clarification Prompt Options** | `cbt.ts` L1131 | Gemini / Static Fallback | Yes | No | B (Clinical) | **UNKNOWN — Needs Clinical Review** |
| **Distortion Names (Internal)** | `cbt.ts` L1135 | Static list (9 traps) | No (Internal only) | N/A | B (Clinical) | Derived from standard Beckian CBT |
| **Challenge Question 1, 2, 3** | `cbt.ts` L653 | Static Fallback / Gemini | Yes | No | B (Clinical) | Derived from Socratic questioning |
| **Balanced Thought Templates** | `cbt.ts` L754 | Static Fallback / Gemini | Yes | No | B (Clinical) | **UNKNOWN — Needs Clinical Review** |
| **Crisis Safety Text (988)** | `cbt.ts` L585 | Static | Yes | No | B (Clinical) | Verified standard crisis protocol |
| **Unresponsive / Support Text** | `cbt.ts` L609 | Static | Yes | No | A (Engineering) | Supportive pause text |
| **Support Mode 5-4-3-2-1 Grounding** | `reframe.tsx` L655 | Static | Yes | No | B (Clinical) | Standard sensory grounding |
| **Support Mode Breathing (4-3-4)** | `reframe.tsx` L607 | Static | Yes | Loop | B (Clinical) | Non-standard respiration timing |
| **JPMR Muscle Tension Scripts (15 steps)**| `jpmr.tsx` L31–121 | Static | Yes | No | B (Clinical) | **UNKNOWN — Needs Clinical Review** |

---

## 5. AI / Gemini Audit

### Overview:
Gemini acts as the conversational intelligence behind CBT dialog in `convex/cbt.ts`.
- **Primary Model:** `gemini-3.1-flash-lite` (low latency).
- **Secondary Model:** `gemini-3.5-flash` (reliability fallback).
- **Offline / Failure Fallback:** Rule-based `handleMockResponse` executing local pattern matching.

### Input Boundary Verification:
- **Session Context Injected:** Conversation history, situation, automatic thought, emotion label, emotion intensity (0–10).
- **Clinical Data Injected:** **ZERO.** PHQ-9, GAD-7, PQ-16, WSAS, ReQoL-10, and triage severity are **never** injected into Gemini prompts.
- **Goal Recommender Context:** Non-clinical wellness goals, streak, and recent goal completion history.

### AI Output Handling:
- AI outputs are requested strictly as `application/json`.
- `cleanJsonResponse` repairs unclosed JSON and strips markdown fences.
- If parsing fails, the call fails over to `handleMockResponse`.
- Student sees only the structured fields (`responseMessage`, `balancedThoughtsOptions`, `challengeQuestions`), never raw model prompt tokens.

### Security / Prompt Injection:
- `sanitizeInput` strips HTML brackets and escape quotes, capping input at 1,500 characters.
- System instructions explicitly enforce role constraints and prohibit psychological jargon.

---

## 6. Safety Boundary Audit

### Safety Escalation Architecture:
```
Student Message
   │
   ▼
cbt.ts: submitMessage
   │
   ├─► Gemini Assessment: riskDetected + riskFlags
   │   OR
   └─► Local Regex Check: /\b(die|suicide|kill myself|self harm|hurt myself)\b/i
         │
         ▼ [RISK DETECTED]
   ┌─────────────────────────────────────────────────────────────┐
   │ 1. Create Server Alert: api.alerts.createAlert ("suicideRisk")│
   │ 2. Set Session State: sessionStatus = "safety_mode"         │
   │ 3. Set Current Step: currentStep = "safety_mode"            │
   │ 4. Assign Risk Flags: ["suicide", "high_distress"]          │
   │ 5. Post Crisis Message with 988 Crisis Lifeline             │
   └─────────────────────────────────────────────────────────────┘
         │
         ├─► Normal CBT restructuring halts immediately
         ├─► No balancedThought is created
         ├─► NEVER bridged to reframeLogs
         └─► Counselor Dashboard displays High-Risk Alert Banner
```

### Safety Findings:
- Server-authoritative: Yes. Cannot be bypassed by client manipulating `stepIndex` or calling `skipQuestion`.
- Alert generation verified: Creates row in `alerts` table with `status: "pending"`.
- Dashboard visibility verified: Rendered in `PatientDetail.tsx` under High-Risk Safety Mode Activations.

---

## 7. Breathing / Relaxation Audit

### Current Implementations:
1. **Support Mode Breathing (`app/(auth)/tools/reframe.tsx`):**
   - Animated circle scaling between $1.0$ and $2.2$ over 4 seconds.
   - Phases: "Breathe In..." (4s) $\rightarrow$ "Hold..." (3s) $\rightarrow$ "Breathe Out..." (4s).
   - Audio/Video: None.
   - Persistence: None.
2. **Guided Breathing Modal (`app/(auth)/tools/emotion-map.tsx`):**
   - 3-minute countdown timer with animated circle.
   - Audio/Video: None.
   - Persistence: None.
3. **JPMR Step 0 & 7 (`app/(auth)/tools/jpmr.tsx`):**
   - Step 0 ("Introduction") and Step 7 ("Chest"): prompts user to breathe deeply.
   - Audio: `expo-speech` TTS.
   - Video: Remote Mixkit URL.

### The Real-Device "Black Rectangle" Defect:
- **Root Cause Identified:** In `jpmr.tsx`, demonstration videos are loaded via `useVideoPlayer` pointing to remote URLs at `https://assets.mixkit.co/videos/preview/...`.
- **Contributing Factors:**
  1. No local video asset fallback exists if the remote CDN blocks hotlinking, rate-limits, or the device is offline.
  2. The `VideoView` component renders a blank black surface while buffering, with no poster thumbnail or loading indicator.
  3. The `replaceAsync` source switch in `useEffect` can desynchronize with Expo Video's native player state on initial mount.
- **Classification:** **P1 Bug** — Fragile remote media architecture.

---

## 8. JPMR Audit

### Evaluation: **PARTIALLY FUNCTIONAL (B)**

| Dimension | Implementation Details | Finding |
| :--- | :--- | :--- |
| **Structure** | 15 distinct somatic muscle group steps | Comprehensive Jacobson protocol |
| **Sequencing** | Automated cycle: Tense voice $\rightarrow$ 5s Countdown $\rightarrow$ Release voice $\rightarrow$ 8s Rest | Functional timer state machine |
| **Audio** | System Speech via `expo-speech` (`Speech.speak`) | Functional local TTS |
| **Demonstrations** | Remote Mixkit preview MP4s streamed via `expo-video` | **Defective / Black rectangle** |
| **Pre/Post Rating** | 0–10 intensity stepper with semantic distress labels | Fully functional |
| **Persistence** | Completed sessions logged to `jpmrLogs` | Fully functional |
| **In-Progress State** | Local device `SecureStore` (`jpmr_in_progress_${userId}`) | Not synced across devices |
| **Provenance** | `createLog` does NOT send `sourceType`, `attemptId`, `triageId` | **Provenance Gap** |
| **Counselor View** | Dedicated Somatic tab in `PatientDetail.tsx` | Fully visible |

---

## 9. Sensory Grounding Audit

### Evaluation: **EMBEDDED UI-ONLY (D)**

- **Location:** Embedded exclusively inside `app/(auth)/tools/reframe.tsx` under `supportTab === "grounding"`.
- **Content:** Standard 5-4-3-2-1 grounding protocol:
  - 5 things you can SEE (with `SightSensoryIcon`)
  - 4 things you can TOUCH (with `TouchSensoryIcon`)
  - 3 things you can HEAR (with `SoundSensoryIcon`)
  - 2 things you can SMELL (with `SmellSensoryIcon`)
  - 1 thing you can TASTE (with `TasteSensoryIcon`)
- **Interaction:** Static list; no interactive checkboxes, audio prompts, or haptics.
- **Persistence:** **ZERO.** No record is created in Convex or local storage.
- **Standalone Access:** Cannot be launched directly from the Tools Hub.

---

## 10. Media Architecture

### Asset Inventory:

| Asset Path | Size | Type | Usage | Status |
| :--- | :--- | :--- | :--- | :--- |
| `assets/landing-page.mp4` | 1.05 MB | Local MP4 | Onboarding splash overlay | ACTIVE |
| `assets/landing-page2.mp4` | 1.20 MB | Local MP4 | None | **UNREFERENCED DEAD ASSET** |
| `assets/loading-video.mp4` | 1.38 MB | Local MP4 | `LoadingVideoContext` | ACTIVE |
| `assets/emoty_boy_avatar.jpg`| 624 KB | Local JPEG | Mitra 2D fallback | ACTIVE |
| `assets/*.png` | 17–22 KB | Icons/Splash | App manifests | ACTIVE |
| `https://assets.mixkit.co/...`| Remote | Remote MP4s (15) | JPMR step demonstration | **UNRELIABLE / EXTERNAL** |

### Findings:
1. No bundled audio files (`.mp3`, `.wav`, `.m4a`) exist in the repository.
2. No bundled guided relaxation video files exist in the repository.
3. Media delivery relies entirely on hotlinking external preview URLs or ElevenLabs TTS generation.

---

## 11. Media Licensing & Source Audit

| Media Asset | Claimed / Visible Source | Repository Evidence | Classification | Play Store Risk |
| :--- | :--- | :--- | :--- | :--- |
| `landing-page.mp4` | Emotify internal asset | No license file | UNKNOWN | Low |
| `landing-page2.mp4` | Emotify internal asset | No license file | UNKNOWN | Low (Dead asset) |
| `loading-video.mp4` | Emotify internal asset | No license file | UNKNOWN | Low |
| `mixkit-*.mp4` (15 URLs) | Mixkit Free Stock Videos | Hotlinked directly | **THIRD-PARTY / NEEDS REVIEW** | **HIGH** (Hotlinking preview URLs violates CDN terms and risks takedown) |
| `emoty_boy_avatar.jpg` | Emotify avatar graphic | No license file | UNKNOWN | Low |

---

## 12. Intervention Completion Model

The repository currently exhibits divergent completion tracking paradigms across models:

```
cbtSessions:    [active] ────► [completed]  (or [expired], [safety_mode], [support_mode])
jpmrLogs:       [completed: true] only      (in-progress held only in device SecureStore)
reframeLogs:    [saved_reframe_flag: true]  (only finalized reframes are written)
microGoals:     [completed: bool] + [skipped: bool] + [status: string]
Breathing:      NO RECORD CREATED AT ALL
Grounding:      NO RECORD CREATED AT ALL
```

### Gap:
There is no unified `interventionSessions` or `activityLogs` model. Non-CBT tools (Breathing, Grounding) are completely invisible to telemetry, completion stats, streaks, and counselor oversight.

---

## 13. Intervention Provenance

| Table | `sourceType` Support | `attemptId` Support | `triageId` Support | `cbtSessionId` Support | Actual Provenance Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `cbtSessions` | Yes | Yes | Yes | N/A | **PROVENANCE COMPLETE** |
| `reframeLogs` | Yes | Yes | Yes | Yes | **PROVENANCE COMPLETE** |
| `microGoals` | Yes | Yes | Yes | Yes | **PROVENANCE COMPLETE** |
| `jpmrLogs` | In Schema | In Schema | In Schema | No | **PROVENANCE BROKEN IN UI** (UI fails to pass fields to `createLog`) |
| Breathing | No Table | No Table | No Table | No Table | **MISSING ENTIRELY** |
| Grounding | No Table | No Table | No Table | No Table | **MISSING ENTIRELY** |

---

## 14. Counselor Dashboard Coverage

In `dashboard/src/pages/PatientDetail.tsx`:

- **Visible to Counselors:**
  - AI CBT sessions (core thought, distortion, tension delta, belief score, status).
  - Full CBT dialogue transcript modal.
  - High-risk safety mode alerts with risk flags and timestamp.
  - Behavioral activation / micro-goal completion rates and trends.
  - JPMR relaxation session history (duration, pre/post intensity, delta).
  - Emotion body mapping entries.
- **NOT Visible to Counselors:**
  - Saved reframes from `reframeLogs` as an independent list.
  - Breathing exercise completions or duration.
  - Grounding exercise completions.
  - Media player engagement / completion analytics.

---

## 15. Authorization Audit

### Findings:
1. **Critical Vulnerability in `convex/jpmrVideos.ts` (P0):**
   ```typescript
   export const clearAllJpmrVideos = mutation({
     args: {},
     handler: async (ctx) => {
       const existing = await ctx.db.query("jpmrVideos").collect();
       for (const item of existing) {
         await ctx.storage.delete(item.storageId);
         await ctx.db.delete(item._id);
       }
     }
   });
   ```
   `clearAllJpmrVideos`, `generateUploadUrl`, and `saveVideoRecord` have **no authentication checks**. Any unauthenticated client can wipe all video storage records.
2. **`cbt.ts`:** All mutations verify `session.userId === identity.subject` or enforce `assertCanAccessStudent(ctx, session.userId)`. (Clean).
3. **`reframes.ts`:** All mutations verify `item.userId === identity.subject`. (Clean).
4. **`jpmrLogs.ts`:** `create` sets `userId = identity.subject`, ignoring any spoofed client argument. (Clean).

---

## 16. Privacy / Sensitive Data Audit

- **Raw Thoughts Stored:** Yes, in `cbtSessions` and `reframeLogs`.
- **Full Dialogue Stored:** Yes, in `cbtSessions.conversation`.
- **Counselor Access:** Counselors can read full transcripts in `PatientDetail.tsx`.
- **Clinical Timeline:** Raw conversational dialog is **not** leaked into `timeline.ts`; timeline receives only high-level summary events (`cbt_session`, `reframe_log`, `jpmr_session`).
- **Retention / Deletion Policy:** Indefinite retention; no automated purge or data-retention TTL exists.

---

## 17. Offline / Failure Behavior

| Scenario | Behavior | Evaluation |
| :--- | :--- | :--- |
| **Gemini Unavailable / Offline** | `fetchGeminiWithFallback` catches error $\rightarrow$ invokes `handleMockResponse` | **PASS (Graceful offline CBT)** |
| **Mixkit CDN Blocked / Offline** | `VideoView` fails to load $\rightarrow$ displays static black rectangle | **FAIL (P1 defect)** |
| **Device TTS Offline** | `expo-speech` synthesizes using local OS engine | **PASS (Works offline)** |
| **App Closed During CBT** | Session state preserved in `cbtSessions`; resumes upon return | **PASS** |
| **App Closed During JPMR** | In-progress state saved in device `SecureStore`; prompts resume | **PASS (Device only)** |

---

## 18. Accessibility / Device Compatibility

- **Reduced Motion:** Breathing circle animations in `reframe.tsx` and `emotion-map.tsx` do not respect `AccessibilityInfo.isReduceMotionEnabled()`.
- **Screen Readers:** Key circular controls in `jpmr.tsx` lack `accessibilityLabel` and `accessibilityHint`.
- **Safe Area Insets:** Consistently applied across `reframe.tsx`, `jpmr.tsx`, and `tools.tsx` via `useSafeAreaInsets()`.
- **Landscape / Tablet Layout:** Mobile layouts assume portrait orientation; video player uses fixed aspect ratio.

---

## 19. Duplicate / Legacy / Dead Code Audit

| Item | Classification | Rationale / Evidence |
| :--- | :--- | :--- |
| `assets/landing-page2.mp4` | UNREFERENCED / DEAD | 1.2 MB file not imported or referenced anywhere in codebase |
| `utils/microgoals.ts` | UNREFERENCED / DEAD | Outdated client goal generator with `Math.random` and triage branching; not imported |
| `convex/reframes.ts` -> `reframes` table | LEGACY | Fallback read-only; all new writes redirect to `reframeLogs` |
| Breathing in `reframe.tsx` vs `emotion-map.tsx` | DUPLICATE / SPLIT | Two independent unpersisted breathing animations with different timers |
| Grounding in `reframe.tsx` | EMBEDDED | Useful exercise trapped inside Support Mode with no standalone access |

---

## 20. Test Coverage

- **Total Test Suite:** 274 tests across 13 test files (100% passing).
- **CBT Coverage:** Extensive (52 tests in `convex/priority8.test.ts` covering session state, anti-repetition, safety escalation, bridge idempotency, stale sessions).
- **JPMR Coverage:** Minimal (only basic auth/timeline tests in `hardening.test.ts` and `timeline.test.ts`; zero tests for step sequencing, timer, or video states).
- **Breathing Coverage:** **0 tests.**
- **Grounding Coverage:** **0 tests.**
- **Media Player Failure Coverage:** **0 tests.**

---

## 21. Clinical Review Matrix

| Intervention | Technical Status | Student-Facing | Clinical Review Evidence | Licensing / Source | Action Required |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CBT Cognitive Restructuring** | Functional | Yes | Standard Beckian structure | Proprietary Prompt Engine | Review Distortion Prompts |
| **CBT Reframe Bridge** | Functional | Yes | Validated mapping | Internal Architecture | Complete |
| **JPMR Muscle Relaxation** | Partial (Video issue) | Yes | Standard Jacobson protocol | Public domain protocol; Mixkit videos | Replace Video Assets |
| **4-3-4 Breathing** | Functional (UI-only) | Yes | **None in repo** | Custom Animation | Clinical Review on Timing |
| **3-Min Guided Breathing** | Functional (UI-only) | Yes | **None in repo** | Custom Animation | Clinical Review on Timing |
| **5-4-3-2-1 Sensory Grounding** | Embedded UI-only | Yes | Standard crisis grounding | Proprietary SVG Icons | Elevate to Standalone Tool |
| **Free Writing** | Ephemeral | Yes | General expressive writing | Custom TextInput | Add Discard Warning |

---

## 22. P9-A — Engineering Ready

Tasks that can be executed immediately without clinical or legal policy blockers:
1. **Secure `convex/jpmrVideos.ts` (P0):** Add authentication and admin/counselor role checks to `clearAllJpmrVideos`, `generateUploadUrl`, and `saveVideoRecord`.
2. **Delete Dead Assets:** Remove unreferenced `assets/landing-page2.mp4` and unreferenced `utils/microgoals.ts`.
3. **Fix JPMR Provenance:** Wire `sourceType`, `attemptId`, and `triageId` from session context into `jpmr.tsx` $\rightarrow$ `api.jpmrLogs.create`.
4. **Implement Video Player Fallback:** In `jpmr.tsx`, handle video buffering/error states gracefully: display an animated anatomical illustration or Mitra avatar breathing state when video fails or is offline, rather than a black rectangle.
5. **Accessibility Fixes:** Add `isReduceMotionEnabled()` checks for breathing and pulse animations; add screen reader labels.

---

## 23. P9-B — Product Decisions Required

1. **Standalone Grounding Tool:** Should 5-4-3-2-1 Sensory Grounding be elevated to a top-level card on the Tools tab (`/tools/grounding`), or remain exclusively inside Reframe Support Mode?
2. **Unified Breathing Tool:** Should the separate breathing implementations in `reframe.tsx` and `emotion-map.tsx` be consolidated into a single canonical Breathing Tool with customizable durations (1 min, 3 min, 5 min)?
3. **Intervention Logging for Breathing & Grounding:** Should new tables `breathingLogs` and `groundingLogs` be added to track student engagement, duration, and tension deltas?

---

## 24. P9-C — Clinical Review Required

1. **Breathing Timing Ratios:** Clinical approval of breathing cycles: 4-7-8 (relaxing) vs 4-4-4 (box) vs 4-3-4 (current).
2. **JPMR Tensing Durations:** Clinical review of 5-second tension hold and 8-second release across all 15 muscle groups.
3. **CBT Distortion Clarification Options:** Formal clinical sign-off on the 6 student-friendly thinking style descriptors.

---

## 25. P9-D — Content / Licensing Review Required

1. **Mixkit Stock Video Replacement:** The 15 Mixkit preview URLs must be replaced with either:
   - Self-hosted / bundled anatomical SVG/Lottie animations (recommended for zero network dependency and zero legal risk), or
   - Formally licensed and locally bundled MP4 video demonstrations.

---

## 26. P9-E — Later Roadmap

1. **Audio Guiding Voiceovers:** Studio-recorded human therapist audio files for breathing and meditation (belong to P10+).
2. **Mitra 3D Interactive Avatar:** Full lip-synced somatic coaching (belong to P10+).

---

## 27. Findings by Severity

### P0 — Safety / Security Blocker
- **`convex/jpmrVideos.ts` Unauthorized Mutations:** `clearAllJpmrVideos`, `generateUploadUrl`, and `saveVideoRecord` are publicly accessible without authentication, allowing anyone to delete all video storage files.

### P1 — Major Functional & Data-Integrity Issues
- **JPMR Video "Black Rectangle" Defect:** Remote streaming from Mixkit preview URLs causes real-device video display failure, especially when offline or throttled.
- **Zero Breathing & Grounding Persistence:** Breathing and Grounding sessions create no records in Convex; student effort is not tracked or rewarded.
- **JPMR Provenance Disconnected:** `jpmr.tsx` omits `sourceType`, `attemptId`, and `triageId` when submitting session logs.

### P2 — Important Product / Engineering Issues
- **Fragmented Breathing Code:** Three divergent breathing implementations across tools.
- **Trapped Sensory Grounding:** 5-4-3-2-1 Grounding is hidden inside Reframe Support Mode without a standalone route.
- **Unreferenced Dead Assets:** `landing-page2.mp4` (1.2 MB) and `utils/microgoals.ts` linger in the codebase.

### P3 — Minor Issues / Polish
- **Accessibility:** Missing reduced-motion checks on breathing animations; missing screen-reader labels on JPMR controls.
- **TTS Fallback Polish:** Improve `expo-speech` pronunciation on non-standard Android TTS engines.

---

## 28. Recommended Priority 9 Implementation Sequence

1. **Step 2 (Security & Provenance Hardening):**
   - Secure `convex/jpmrVideos.ts` with authentication and role authorization.
   - Wire complete provenance (`sourceType`, `attemptId`, `triageId`) into `jpmr.tsx`.
   - Remove dead asset `landing-page2.mp4` and dead file `utils/microgoals.ts`.
2. **Step 3 (Media Architecture & JPMR Video Fallback):**
   - Eliminate fragile Mixkit preview hotlinking.
   - Implement resilient video loading state, buffering spinner, and SVG/Mitra demonstration fallback in `jpmr.tsx`.
3. **Step 4 (Breathing Tool Consolidation & Persistence):**
   - Consolidate breathing logic into a canonical, reusable component.
   - Create schema table `breathingLogs` with pre/post ratings and provenance.
4. **Step 5 (Sensory Grounding Elevation):**
   - Create standalone, interactive 5-4-3-2-1 Grounding tool accessible from Tools Hub.
   - Add completion logging and haptic feedback.
5. **Step 6 (Counselor Dashboard Visibility & Final Verification):**
   - Expose breathing and grounding completions in Counselor Dashboard.
   - Full Vitest, TypeScript, and device regression verification.

---

## 29. Test / Build Baseline

- **Vitest:** 274 / 274 passing (13 test files)
- **TypeScript:** `npx tsc --noEmit` clean (0 errors)
- **Dashboard:** `npm run build --prefix dashboard` clean (0 errors)

---

## 30. Final Audit Status

# **AUDIT COMPLETE — READY FOR P9 IMPLEMENTATION**

The audit of Priority 9 is fully executed. All architectural boundaries, media assets, security vulnerabilities, and clinical dependencies have been mapped and cataloged.
No code modifications were made during this audit step. Awaiting user direction to begin Priority 9 Step 2.
