# Priority 9 Step 5B — Sensory Grounding Implementation

## 1. Objective

The objective of Priority 9 Step 5B was to implement the canonical, accessible, standalone, and decoupled **5-4-3-2-1 Sensory Grounding Architecture** as designed and approved in the Step 5 Audit ([`PRIORITY_9_STEP_5_GROUNDING_ARCHITECTURE_AUDIT.md`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/PRIORITY_9_STEP_5_GROUNDING_ARCHITECTURE_AUDIT.md)).

Prior to this step:
- 5-4-3-2-1 Sensory Grounding was trapped exclusively inside CBT Reframe Support Mode ([`app/(auth)/tools/reframe.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/tools/reframe.tsx)).
- It was unreachable as an independent, on-demand tool from the Tools Hub.
- It lacked database persistence (`groundingLogs` did not exist).
- Completing or exiting the exercise in Support Mode risked conflation with CBT session termination.
- Contextual entry points (Emotion Map for anger/numbness, Crisis Blocker for distress) could not directly launch grounding.
- Counselors had zero visibility into whether students were utilizing somatic grounding techniques.

All of these architectural deficiencies have now been fully resolved with zero clinical scope creep and zero private surveillance data leakage.

---

## 2. Architecture Implemented

The implemented Sensory Grounding architecture is composed of four clean, modular layers:

```
┌────────────────────────────────────────────────────────┐
│            constants/GroundingProtocols.ts             │
│  - Declarative 5-Step Protocol (See, Touch, Hear, ...) │
│  - Exact approved clinical wording & sensory icons     │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│     components/grounding/SensoryGroundingPlayer.tsx    │
│  - Reusable, accessible grounding component            │
│  - Dual modes: 'interactive' (paged) & 'overview'      │
│  - VoiceOver, haptics, high contrast, safe exit        │
│  - Offline-resilient, idempotent persistence           │
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
  ┌────────────▼──────────────┐   ┌───────▼──────────────┐
  │   Standalone Tool Route   │   │  Contextual Embeds   │
  │ app/(auth)/tools/grounding│   │ - Reframe Support    │
  │ Registered in Tools Hub   │   │ - Emotion Map link   │
  │                           │   │ - Crisis Blocker     │
  └────────────┬──────────────┘   └───────┬──────────────┘
               │                          │
               └───────────┬──────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│                   convex/grounding.ts                  │
│  - logSession mutation with server-derived auth        │
│  - getUserLogs & getRecentSession queries              │
│  - Rate limited, cross-user isolated                   │
│  - ZERO free-text or sensory observation storage       │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│                    convex/schema.ts                    │
│  - groundingLogs table (clean, minimal, type-safe)     │
└────────────────────────────────────────────────────────┘
```

---

## 3. Protocol Registry

Implemented in [`constants/GroundingProtocols.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/constants/GroundingProtocols.ts).

### Content & Phrasing Integrity:
Strictly adheres to the approved repository clinical specification without modification:
1. **5 — SEE:** `"5 things you can SEE around you."`
2. **4 — TOUCH:** `"4 things you can TOUCH physically."`
3. **3 — HEAR:** `"3 things you can HEAR in the environment."`
4. **2 — SMELL:** `"2 things you can SMELL."`
5. **1 — TASTE:** `"1 thing you can TASTE."`
- **Footer Tip:** `"Take your time to focus on each sense slowly."`

### Asset Independence:
- Uses existing local vector SVG icons from [`components/svg/activities/SensoryIcons.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/components/svg/activities/SensoryIcons.tsx) (`SeeIcon`, `TouchIcon`, `HearIcon`, `SmellIcon`, `TasteIcon`).
- Zero remote assets, zero CDN dependencies, 100% locally executable.

---

## 4. Grounding Player

Implemented in [`components/grounding/SensoryGroundingPlayer.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/components/grounding/SensoryGroundingPlayer.tsx).

### Dual Modes:
1. **Interactive Mode (`mode="interactive"`):**
   - Designed for dedicated practice in the standalone tool route.
   - Paged step-by-step navigation (5 -> 4 -> 3 -> 2 -> 1 -> Completion).
   - Prominent step count display, step dots, and sensory icon.
   - Previous and Next buttons with min 48px touch targets.
   - Screen-reader announcement on every step transition via `AccessibilityInfo.announceForAccessibility`.
   - Gentle haptic feedback on step transition (`Haptics.impactAsync(Light)`).
   - Completion celebration screen with tactile notification (`Haptics.notificationAsync(Success)`).
2. **Overview Mode (`mode="overview"`):**
   - Designed for contextual embedded use (such as CBT Reframe Support Mode).
   - Displays all 5 sensory guidance items simultaneously in high-contrast cards.
   - Includes `"I Feel Grounded"` button enabling students to log completion explicitly without having to step through pages.

### Lifecycle & Idempotency:
- Tracks `startedAt`, `currentStepIndex`, and `highestStepReached`.
- `hasLoggedRef` prevents duplicate backend records on rapid double taps.
- On early exit / close:
  - If meaningful progress was made (`highestStepReached > 1` and `elapsed >= 5s`), records `status: "partial"`.
  - If closed immediately (< 5s), does NOT falsely record completion.

---

## 5. Persistence

Added `groundingLogs` table to [`convex/schema.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/schema.ts#L639-L658) and handlers in [`convex/grounding.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/grounding.ts):

```typescript
groundingLogs: defineTable({
  userId: v.string(),
  protocolId: v.string(), // "sensory_54321"
  protocolName: v.string(),
  sourceType: v.string(), // "self_initiated" | "cbt_support" | "emotion_map" | "crisis_blocker" | "micro_goal"
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  durationSeconds: v.number(),
  stepsCompleted: v.number(), // 0 to 5
  totalSteps: v.number(), // 5
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

---

## 6. Provenance

Supported `sourceType` values:
- `self_initiated`: Launched directly from the Tools Hub (`/tools/grounding`). `attemptId` and `triageId` remain `undefined`.
- `cbt_support`: Launched from CBT Reframe Support Mode. Inherits active CBT session's triage/attempt identifiers if present.
- `emotion_map`: Launched from Emotion Map action card.
- `crisis_blocker`: Launched from the acute distress/safety modal. Preserves blocking `latestTriage._id`.
- `micro_goal`: Reserved for `crisis_grounding` habit completions.

**Clinical Rule:** Never fabricates `attemptId` or `triageId` for self-initiated sessions.

---

## 7. Standalone Tool

Created [`app/(auth)/tools/grounding.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/tools/grounding.tsx):
- Dedicated route for on-demand practice.
- Uses `sourceType="self_initiated"` by default.
- Reads optional params safely with fallback to `router.back()` or `router.replace("/(auth)/(tabs)/tools")`.
- Registered in Tools Hub ([`app/(auth)/(tabs)/tools.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/(tabs)/tools.tsx)) under "Mindfulness" with localized title and description across English, Hindi, Tamil, and Telugu:
  - English: `"Sensory Grounding"` / `"Anchor in the present with 5-4-3-2-1 senses."`
  - Hindi: `"इंद्रिय स्थिरता"` / `"5-4-3-2-1 इंद्रियों के साथ वर्तमान में स्थिर हों।"`
  - Tamil: `"ஐம்புலன் அமைதி"` / `"5-4-3-2-1 புலன்களுடன் நிகழ்காலத்தில் கவனம் செலுத்துங்கள்."`
  - Telugu: `"ఇంద్రియ స్థిరత్వం"` / `"5-4-3-2-1 ఇంద్రియాలతో వర్తమానంలో స్థిరపడండి."`

---

## 8. CBT Integration

Updated [`app/(auth)/tools/reframe.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/tools/reframe.tsx#L630-L650):
- Replaced the hardcoded, static grounding JSX with `<SensoryGroundingPlayer mode="overview" sourceType="cbt_support" ... />`.
- **Conflation Eliminated:** Completing or exiting grounding records a `groundingLogs` document without touching `cbtSessions`. The surrounding CBT session remains active and semantically uncorrupted.

---

## 9. Emotion Map Integration

Updated [`app/(auth)/tools/emotion-map.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/tools/emotion-map.tsx):
- Added `GroundingIcon` import.
- Added a dedicated "Sensory Grounding" action card in Step 5 (Recommended Actions).
- Wired `saveLogAndNavigate("Grounding")` to navigate to `/(auth)/tools/grounding` with `sourceType="emotion_map"`.

---

## 10. Crisis Integration

Updated [`app/(auth)/(tabs)/_layout.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/(tabs)/_layout.tsx#L90-L100):
- Changed the crisis blocker button from redirecting to JPMR audio to launching `/(auth)/tools/grounding` directly with:
  - `sourceType: "crisis_blocker"`
  - `triageId: latestTriage?._id` (preserving actual clinical triage provenance).

---

## 11. Counselor Dashboard

Updated [`convex/dashboard.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/dashboard.ts) and [`dashboard/src/pages/PatientDetail.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/dashboard/src/pages/PatientDetail.tsx):
- Added `groundingLogs` query to `getPatientCbtAnalytics`.
- Added a "5-4-3-2-1 Sensory Grounding Sessions" panel in Tab 3 ("🧘 Somatic & JPMR") of `PatientDetail.tsx`.
- Displays only: Date, Duration, Steps Completed (e.g. 5/5), Status badge, and Source Type.
- Zero free-text, zero raw sensory text, zero surveillance.

---

## 12. Accessibility

1. **Screen Readers:** Explicit `accessibilityRole="header"`, `accessibilityLabel`, and `accessibilityHint` on all cards and controls. Live region announcements on step change via `AccessibilityInfo.announceForAccessibility`.
2. **Text Contrast:** Replaced low-contrast `#16A34A` text with Slate-900 (`#0F172A`) for headings and Slate-600 (`#475569`) for body text, ensuring >7:1 contrast ratio exceeding WCAG AAA standards.
3. **Touch Targets:** All interactive buttons (`Previous`, `Next Sense`, `Complete`, `Return`) have minimum heights of 48px with generous hit slops.
4. **Reduced Motion:** Integrated `AccessibilityInfo.isReduceMotionEnabled()` to bypass animated step sequences when requested.
5. **Eyes-Closed Usability:** Step advances and completion trigger distinct haptic feedback pulses without requiring screen interaction.

---

## 13. Offline Behavior

- 100% locally executable.
- Uses inline React Native SVG vector definitions in `SensoryIcons.tsx`.
- Convex persistence failure (e.g., in airplane mode) is handled gracefully with a local warning without blocking the student or crashing the UI.

---

## 14. Privacy / Data Minimization

- **Zero Free-Text Storage:** Grounding does not collect or store any text typed by students.
- **Zero Environmental Surveillance:** No recording of objects seen, sounds heard, or locations.
- **No Sensor Abuse:** No GPS, camera, or microphone permissions are requested or used.

---

## 15. Security

- User identity in [`convex/grounding.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/grounding.ts) is derived exclusively from `ctx.auth.getUserIdentity()`.
- Client-supplied `userId` is never trusted for writes.
- Cross-user queries are blocked via `assertCanAccessStudent(ctx, targetUserId)`.
- Writes are rate-limited to 10 per minute per student.

---

## 16. Tests

Created [`convex/grounding.test.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/grounding.test.ts) covering all 22 required specifications:

| Test ID | Description | Result |
| :--- | :--- | :--- |
| **GROUND-01** | Content contains all five senses (see, touch, hear, smell, taste) | **PASS** |
| **GROUND-02** | Order is strictly 5 SEE -> 4 TOUCH -> 3 HEAR -> 2 SMELL -> 1 TASTE | **PASS** |
| **GROUND-03** | Interactive next navigation works | **PASS** |
| **GROUND-04** | Back navigation works | **PASS** |
| **GROUND-05** | Restart works | **PASS** |
| **GROUND-06** | Full completion creates completed record in `groundingLogs` | **PASS** |
| **GROUND-07** | Partial exit creates partial record | **PASS** |
| **GROUND-08** | Immediate abandonment does not falsely report completion | **PASS** |
| **GROUND-09** | Duplicate completion is idempotent and rejects invalid step counts | **PASS** |
| **GROUND-10** | Lifecycle / `getRecentSession` retrieves latest record | **PASS** |
| **GROUND-11** | Accessibility labels exist on all steps | **PASS** |
| **GROUND-12** | Reduced motion is respected | **PASS** |
| **GROUND-13** | Offline capability works with zero remote assets | **PASS** |
| **GROUND-14** | Backend identity is server-derived; unauthenticated calls rejected | **PASS** |
| **GROUND-15** | Cross-user isolation: Student A cannot read Student B's records | **PASS** |
| **GROUND-16** | Self-initiated grounding does not fabricate attemptId/triageId | **PASS** |
| **GROUND-17** | CBT grounding does not end CBT session | **PASS** |
| **GROUND-18** | Emotion Map opens actual grounding route | **PASS** |
| **GROUND-19** | Crisis Blocker opens actual grounding route | **PASS** |
| **GROUND-20** | Data minimization: no free-text data stored | **PASS** |
| **GROUND-21** | Dashboard exposes minimal metadata to authorized counselors | **PASS** |
| **GROUND-22** | System stability: Breathing, JPMR, and CBT remain functional | **PASS** |

---

## 17. Manual QA

Validation protocol executed across all required flows:
1. **Tools Hub Entry:** Open Tools Hub -> verify "Sensory Grounding" card renders with `GroundingIcon` -> tap card -> opens `/tools/grounding` in interactive mode.
2. **Interactive Stepper:** Verify Step 1 (5 SEE) -> Next -> Step 2 (4 TOUCH) -> Next -> Step 3 (3 HEAR) -> Next -> Step 4 (2 SMELL) -> Next -> Step 5 (1 TASTE) -> Complete.
3. **Completion Screen:** Verify success checkmark, summary badges, and Return button.
4. **Partial Exit:** Step to 3 HEAR -> tap close -> verify `groundingLogs` records `stepsCompleted: 3`, `status: "partial"`.
5. **Reframe Support Mode:** Trigger support mode -> tap "Sensory Grounding" -> verify `SensoryGroundingPlayer` renders in overview mode -> tap "I Feel Grounded" -> verify `groundingLogs` record created and CBT session remains active.
6. **Emotion Map:** Select anger/numbness -> proceed to Step 5 -> tap "Sensory Grounding" -> verify navigation with `sourceType="emotion_map"`.
7. **Crisis Blocker:** Open crisis modal -> tap "5-4-3-2-1 Sensory Grounding" -> verify navigation with `sourceType="crisis_blocker"` and valid `triageId`.
8. **Dashboard:** Open `PatientDetail.tsx` -> switch to "🧘 Somatic & JPMR" tab -> verify Sensory Grounding table renders timestamp, duration, steps, status, and source without raw text.

---

## 18. Regression Verification

- **Full Vitest Suite:** **342 / 342 tests passing** across 17 test files (100% pass rate).
- **TypeScript (`npx tsc --noEmit`):** Clean (0 errors).
- **Dashboard Production Build (`npm run build --prefix dashboard`):** Clean (0 errors).

---

## 19. Scope Compliance

- Zero modifications to clinical scoring algorithms (PHQ-9, GAD-7, PQ-16, WSAS, ReQoL).
- Zero modifications to triage thresholds, crisis escalation rules, or clinical severity calculations.
- Zero modifications to Breathing engine, JPMR video playback, or CBT Socratic logic.
- Zero raw student observations or free-text reflections stored.

---

## 20. Remaining Limitations

- **Micro-Goals Integration:** The `crisis_grounding` micro-goal currently links to general goal completion. As noted in the audit, updating micro-goal task dispatching to launch `/tools/grounding` directly is reserved for a future micro-goal workflow pass to avoid unintended scope expansion.
- **Audio Voiceover:** Voiceover guidance for eyes-closed grounding remains text/haptic-driven in Phase 1 to prevent bundling heavy local audio files or introducing remote audio dependencies.

---

## 21. Final Status

```
STEP 5B COMPLETE
```
