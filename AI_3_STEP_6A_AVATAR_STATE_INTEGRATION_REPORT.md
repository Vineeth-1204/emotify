# AI-3 Step 6A: Avatar State & Behavior Integration Report

## 1. Status
**CLOSED / VERIFIED COMPLETE**
- **Avatar State & Behavior Architecture**: Unified into a single authoritative presentation resolver (`common/avatarPresentation.ts:resolveAvatarPresentationState`).
- **Avatar as Presentation Layer**: The avatar is strictly decoupled from authority—it cannot make clinical assessments, alter safety classifications, or trigger action executions.
- **Visual Design Untouched**: No artwork, SVG paths, image assets, 3D models, or character designs were modified. Visual replacement is strictly deferred to Step 6B.
- **Vitest Test Suite**: 52/52 test files passed, 918/918 tests passed (24 new avatar integration tests, 0 regressions).
- **TypeScript**: Clean (`npx tsc --noEmit` exited with code 0).
- **Dashboard**: Production build clean (`vite v8.0.13` built in 732ms).

---

## 2. Complete Avatar Architecture Audit
Prior to Step 6A, the avatar system exhibited several architectural fragmentation patterns across the mobile application:
1. **`MitraAvatar.tsx` Component**:
   - Implemented an animated SVG vector character supporting 13 states: `idle`, `listening`, `thinking`, `calm`, `happy`, `sad`, `worried`, `angry`, `tired`, `breathing`, `encouraging`, `celebrating`, `supportive`.
   - Contained ad-hoc normalization of legacy alias props (`neutral` $\rightarrow$ `idle`, `grounding` $\rightarrow$ `calm`).
2. **`AvatarContext.tsx`**:
   - Managed React state `[avatarState, setInternalAvatarState] = useState<AvatarState>('idle')`.
   - Used an arbitrary numeric priority map (`PRIORITY_LEVELS` from 1 to 5) that attempted to guard safety state, but was decoupled from the AI-3 safety tiers (`normal`, `elevated`, `crisis`).
3. **`companion.tsx` Local Computation**:
   - Re-implemented an independent, unshared `currentMitraState` `useMemo` that inspected `isListening`, `isSpeaking`, `isAiLoading`, and local `isSafetyActive`.
4. **`app/(auth)/(tabs)/index.tsx` (Student Home)**:
   - Contained multiple direct calls: `if (card.backendCode === "happy") setAvatarState("happy") else if (...)`.
   - If a student tapped a mood card while in distress, this could overwrite safety-appropriate states.
5. **AI-3 Context/Mode/Action Disconnect**:
   - Step 3 conversational modes (`emotional_support`, `guidance`, `app_assistance`, etc.) and Step 5 actions (`start_breathing`, etc.) had no formal presentation mapping to the avatar.

---

## 3. Existing Avatar States
The approved set of avatar states is strictly frozen to the 13 verified states defined in `convex/emotyContract.ts` and `components/avatar/MitraAvatar.tsx`:
1. `idle`
2. `listening`
3. `thinking`
4. `calm`
5. `happy`
6. `sad`
7. `worried`
8. `angry`
9. `tired`
10. `breathing`
11. `encouraging`
12. `celebrating`
13. `supportive`

*No clinical or diagnostic states (such as `depressed`, `suicidal`, `anxious`, `therapist`) were introduced.*

---

## 4. Existing Avatar Decision Sources
Audit revealed four distinct entities previously deciding avatar state independently:
1. **`AvatarContext.setAvatarState`** (via numeric `PRIORITY_LEVELS`).
2. **`companion.tsx` `currentMitraState`** (via manual inline cascading ternaries).
3. **`index.tsx` Home Mood Cards & Check-in** (via manual `if-else` branch assignments).
4. **Gemini raw LLM response** (returning unvalidated `avatarState` strings).

All four sources have now been unified through `resolveAvatarPresentationState`.

---

## 5. State Precedence Rules
The resolver implements a deterministic 6-tier architectural hierarchy:

```
TIER 1: CRISIS / Safety State (Unconditionally 'supportive')
   ↓
TIER 2: ELEVATED Safety State ('supportive', or 'breathing'/'listening' if active)
   ↓
TIER 3: Active Validated Application State ('thinking', 'listening', 'speaking', 'breathing', 'celebrating')
   ↓
TIER 4: Validated Action Recommendation ('breathing', 'supportive', 'encouraging', etc.)
   ↓
TIER 5: Emoty Conversational Mode ('emotional_support' -> 'supportive', 'guidance' -> 'thinking', etc.)
   ↓
TIER 6: Explicit Validated Avatar State (validated against allowlist)
   ↓
TIER 7: User Emotion under Normal Conditions ('happy' -> 'happy', 'calm' -> 'calm', etc.)
   ↓
TIER 8: Default Fallback Base State ('calm' or 'idle')
```

---

## 6. Safety $\rightarrow$ Avatar Mapping
- **`CRISIS`**:
  - Unconditionally forces `supportive`.
  - Overrides casual mode, user emotion (even if user says "happy"), Home state, and Gemini raw output.
- **`ELEVATED`**:
  - Defaults to `supportive`.
  - Allows `breathing` if active somatic pacing is engaged, or `listening`/`thinking` during live voice interaction.
  - Rejects ordinary emotional celebration or happy states while in elevated distress.
- **`NORMAL`**:
  - Standard conversational presentation flowing through modes, actions, and user emotion.

---

## 7. Emoty Mode $\rightarrow$ Avatar Mapping
The Step 3 conversational reasoning modes map to the existing 13-state vocabulary:
- `emotional_support` $\rightarrow$ `supportive`
- `guidance` $\rightarrow$ `thinking`
- `app_assistance` $\rightarrow$ `encouraging`
- `casual` $\rightarrow$ `calm`
- `out_of_scope` $\rightarrow$ `calm`

---

## 8. Action $\rightarrow$ Avatar Interaction
A validated action recommendation from the Action Router presents the appropriate character posture without executing the action:
- `start_breathing` $\rightarrow$ `breathing`
- `open_counsellor_request` $\rightarrow$ `supportive`
- `show_today_goal` / `start_today_goal` $\rightarrow$ `encouraging`
- `start_grounding` / `start_jpmr` $\rightarrow$ `calm`
- `start_reframe` / `start_cbt` $\rightarrow$ `thinking`
- `open_emotion_map` / `show_check_in` $\rightarrow$ `listening`
- `none` $\rightarrow$ passes through to lower tiers.

*The avatar is strictly a presentation layer. It cannot trigger Expo navigation or invoke mutations.*

---

## 9. User Emotion $\rightarrow$ Avatar Interaction
Under normal safety conditions, user-logged emotions provide ambient character empathy:
- `happy` / `good` $\rightarrow$ `happy`
- `calm` / `peaceful` $\rightarrow$ `calm`
- `sad` / `low` $\rightarrow$ `listening` (attentive, supportive posture)
- `worried` / `heavy` / `anxious` $\rightarrow$ `listening`
- `angry` $\rightarrow$ `listening` (non-judgmental active listening)
- `tired` $\rightarrow$ `calm`

*User emotions never alter safety classification and never override CRISIS or ELEVATED states.*

---

## 10. Home / Companion / CBT / Reframe Integration
1. **Companion (`companion.tsx`)**:
   - `currentMitraState` delegates directly to `resolveAvatarPresentationState`.
   - Incorporates voice recognition (`listening`), audio playback (`speaking`), and generation latency (`thinking`).
2. **Student Home (`(tabs)/index.tsx`)**:
   - Mood card taps and morning check-in delegate to `resolveAvatarPresentationState({ userEmotion: ... })`.
3. **CBT & Reframe (`reframe.tsx`, `appointments.tsx`, `microgoals.tsx`)**:
   - Milestone celebrations (`celebrating`) and guided discovery (`thinking`) pass through the single resolver.
4. **`MitraAvatar.tsx`**:
   - Normalizes any raw prop through `resolveAvatarPresentationState({ explicitAvatarState: rawState })`.

---

## 11. Server / Client Responsibility Split
- **Server (`convex/companion.ts`)**:
  - Enforces safety state (`normal`, `elevated`, `crisis`).
  - Normalizes `contract.avatarState` using `resolveAvatarPresentationState` before persisting to `aiCompanionLogs` and returning to client.
- **Client (`context/AvatarContext.tsx`, `components/avatar/MitraAvatar.tsx`)**:
  - Consumes already-authoritative safety states and validated contract fields.
  - Dynamically computes UI visual presentation state.
  - Renders SVG animation with reduced-motion accessibility support.

---

## 12. Duplicated State Logic Removed
- Removed ad-hoc ternary chains in `companion.tsx`.
- Removed manual `if/else` ladders setting `setAvatarState` in `(tabs)/index.tsx`.
- Consolidated prop alias normalization (`neutral`, `grounding`) out of component inline ternaries into `common/avatarPresentation.ts`.

---

## 13. Files Changed
1. **`common/avatarPresentation.ts`** *(NEW)*: Authoritative presentation state resolver, state validation, normalization, and typing.
2. **`convex/emotyAvatar.ts`** *(NEW)*: Re-export module allowing backend Convex functions and tests to consume the avatar presentation layer.
3. **`components/avatar/MitraAvatar.tsx`** *(MODIFIED)*: Replaced inline state coercion with `resolveAvatarPresentationState`.
4. **`context/AvatarContext.tsx`** *(MODIFIED)*: Updated `setAvatarState` to enforce state resolution and safety invariants through the resolver.
5. **`app/(auth)/tools/companion.tsx`** *(MODIFIED)*: Refactored `currentMitraState` `useMemo` to delegate to `resolveAvatarPresentationState`.
6. **`app/(auth)/(tabs)/index.tsx`** *(MODIFIED)*: Refactored mood check-in and card selection to resolve avatar state through `resolveAvatarPresentationState`.
7. **`convex/companion.ts`** *(MODIFIED)*: Server normalizes `contract.avatarState` using `resolveAvatarPresentationState` prior to returning.
8. **`convex/emotyAvatar.test.ts`** *(NEW)*: Full test suite for AVATAR-01 through AVATAR-25.

---

## 14. Tests Added
24 new tests in `convex/emotyAvatar.test.ts`:
- `AVATAR-01`: Exactly the 13 approved avatar states remain valid.
- `AVATAR-02`: No arbitrary or clinical avatar state is accepted into allowlist.
- `AVATAR-03`: NORMAL produces ordinary/default presentation.
- `AVATAR-04`: ELEVATED produces supportive presentation (or somatic breathing if active).
- `AVATAR-05`: CRISIS overrides ordinary avatar presentation.
- `AVATAR-06`: CRISIS cannot be overridden by user emotion.
- `AVATAR-07`: CRISIS cannot be overridden by Home state or action.
- `AVATAR-08`: CRISIS cannot be overridden by Gemini avatar output.
- `AVATAR-09`: Emotional-support mode maps to an existing supportive state.
- `AVATAR-10`: Guidance mode maps to thoughtful/thinking state.
- `AVATAR-11`: Casual mode maps to an existing ordinary state (calm).
- `AVATAR-12`: App-assistance mode maps to an existing helpful state (encouraging).
- `AVATAR-13`: Out-of-scope mode does not create a clinical/safety state.
- `AVATAR-14`: Action recommendation presentation does not execute navigation through the avatar.
- `AVATAR-15`: Avatar resolver is pure and cannot execute database mutations.
- `AVATAR-16`: User emotion does not determine clinical safety.
- `AVATAR-17`: Client-provided safety state cannot override server state.
- `AVATAR-18`: Avatar resolver is strictly deterministic.
- `AVATAR-19`: Unknown avatar state fails safely to an existing default.
- `AVATAR-20`: Existing Home avatar behavior remains functional under normal conditions.
- `AVATAR-21`: Existing companion avatar behavior remains functional.
- `AVATAR-22`: Existing CBT/Reframe avatar behavior remains functional.
- `AVATAR-23`: No arbitrary Gemini-generated avatar state reaches UI.
- `AVATAR-24`: No avatar state creates or modifies clinical data.
- `AVATAR-25`: Convex `generateAIResponse` normalizes `avatarState` across safety tiers.

---

## 15. Full Test Result
Ran full Vitest test suite:
```
Test Files  52 passed (52)
Tests       918 passed (918)
Duration    17.20s
```
*0 failures, 0 regressions across all 52 test files.*

---

## 16. TypeScript Result
Ran `npx tsc --noEmit`:
```
Exit code: 0
Output: Clean (0 errors)
```

---

## 17. Dashboard Build Result
Ran `cd dashboard && npm run build`:
```
vite v8.0.13 building client environment for production...
transforming...✓ 2409 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.61 kB │ gzip:   0.38 kB
dist/assets/index-DdWuBgig.css   21.35 kB │ gzip:   4.82 kB
dist/assets/index-CXtXhzIA.js   921.43 kB │ gzip: 247.79 kB
✓ built in 732ms
Exit code: 0
```

---

## 18. Known Limitations
1. **Client-side Animations**: Animations remain bounded by React Native's native driver (`breathAnim`, `bounceAnim`, `swayAnim`).
2. **Ephemeral Mood State**: Emotion-to-avatar mapping applies to the active view session. When the app reloads, the avatar loads from user preferences and triage status, keeping the schema clean and non-clinical.

---

## 19. Confirmation of Artwork Invariant
- **NO avatar artwork was modified.**
- **NO SVG paths, colors, hairstyles, clothing, facial vectors, or visual assets were touched.**
- **NO image files were generated or edited.**

---

## 20. Confirmation of Step 6B Invariant
- **Step 6B (Avatar Visual Replacement) was NOT implemented.**
- Execution stopped strictly at Step 6A (Avatar State & Behavior Integration).
