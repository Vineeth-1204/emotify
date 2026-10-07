# AI-3 Step 5: Action Router Implementation & Verification Report

## 1. Status
**CLOSED / VERIFIED COMPLETE**
- **Action Router Architecture**: Implemented with strict fail-closed security gating.
- **AI Recommendation $\neq$ Action Execution Principle**: Fully enforced. The LLM only recommends allowlisted capability keys; backend and mobile router validate and map them to verified existing handlers.
- **Safety Compatibility**: CRISIS safety state blocks all arbitrary and wellness recommendations, permitting only `none` or `open_counsellor_request`.
- **Vitest Suite**: 51/51 test files passing, 894/894 tests passing (33 new Action Router tests added, 0 regressions).
- **TypeScript**: Clean (`npx tsc --noEmit` passed with 0 errors).
- **Dashboard**: Production build clean (`vite v8.0.13` built in 733ms).

---

## 2. Initial Action Architecture Audit
Prior to Step 5, the Emoty companion backend (`convex/companion.ts:generateAIResponse`) returned a structured response contract containing an `action` object (`{ type: "..." }`). However:
1. **No Client Navigation Execution**: The client chat UI (`app/(auth)/tools/companion.tsx`) merely displayed text, only providing a hardcoded button for the legacy `breathing_support` quick-action.
2. **Missing Authoritative Dispatcher**: There was no static, deterministic mapping from allowlisted capability types to verified Expo Router routes.
3. **Potential Parameter Injection Gap**: Without a validation firewall, an LLM hallucination or an adversarial prompt returning unexpected fields (such as `route`, `function`, `userId`, `sessionId`) could risk being consumed downstream.
4. **Safety Disconnect**: No server-side check guaranteed that wellness actions were blocked when the student's safety state was elevated or in crisis.

---

## 3. Existing Action Allowlist
The action allowlist is strictly frozen to the 11 capabilities defined in `convex/emotyContract.ts` (`EMOTY_ACTION_TYPES`):
- `none`
- `open_emotion_map`
- `show_today_goal`
- `start_today_goal`
- `start_breathing`
- `start_grounding`
- `start_jpmr`
- `start_reframe`
- `start_cbt`
- `open_counsellor_request`
- `show_check_in`

No arbitrary action types, new verbs, or unapproved actions were added.

---

## 4. Final Action Router Architecture

```
STUDENT PROMPT
      ↓
SERVER SAFETY GATE (emotySafety: classifyServerSafety)
      ↓
CONTEXT MANAGER (emotyContext: getAuthoritativeEmotyContext)
      ↓
MODULAR PROMPT ENGINE (emotyIntent: buildModularEmotyPrompt)
      ↓
GEMINI API (generateContent with responseMimeType="application/json")
      ↓
STRUCTURED CONTRACT VALIDATOR (emotyContract: validateEmotyResponse)
      ↓
CONVERSATIONAL GUARDRAILS (emotyIntent: enforceConversationalGuardrails)
      ↓
ACTION ROUTER FIREWALL (emotyActionRouter: validateAndResolveAction)
  • Allowlist check
  • Reject arbitrary keys (route, function, userId, sessionId, URLs)
  • Enforce Safety State constraints (CRISIS permits only none / open_counsellor_request)
  • Fail closed to { type: "none" } on any anomaly
      ↓
CONVEX ACTION COMPLETION & LOGGING (aiCompanionLogs)
      ↓
MOBILE CLIENT (app/(auth)/tools/companion.tsx)
  • Receives validated { type, label? }
  • Renders explicit user Action CTA button below assistant bubble
  • User confirms tap → invoke resolveActionNavigation(action, safetyState)
  • Expo Router navigates to verified static application route
```

---

## 5. Action Validation Rules
Implemented in `convex/emotyActionRouter.ts:validateAndResolveAction`:
1. **Structural Object Check**: Rejects `null`, `undefined`, numbers, strings, arrays, or non-object payloads.
2. **Static Allowlist Verification**: `rawAction.type` must be present in `EMOTY_ACTION_TYPES`.
3. **No Arbitrary Parameters**: Allowed keys are strictly `new Set(["type", "label"])`. Any payload containing keys such as `route`, `function`, `url`, `sessionId`, `counsellorId`, `goalId`, or `userId` is rejected and fails closed.
4. **Sanitized Display Labels**: Optional `label` must be a string, stripped of HTML tags, trimmed, and capped at 100 characters.
5. **Safety State Enforcement**:
   - **`crisis`**: Only `none` and `open_counsellor_request` are permitted. Any wellness action (e.g. `start_breathing`, `start_cbt`) returned during crisis is blocked and replaced with `{ type: "none" }`.
   - **`elevated`**: Somatic and grounding wellness tools are permitted, but arbitrary parameters remain strictly forbidden.
   - **`normal`**: All 11 allowlisted actions are permitted when unparameterized.
6. **Fail-Closed Guarantee**: Any validation failure logs the rejection reason and safely returns `{ valid: false, fallbackAction: { type: "none" }, resolved: ACTION_ROUTE_MAP.none }`.

---

## 6. Action $\rightarrow$ Existing-Flow Mapping
All actions map statically to verified repository Expo Router routes without intermediate dynamic string interpolation:

| Emoty Action Type | Mapped Application Route | Execution Kind | Description / Target Screen |
| :--- | :--- | :--- | :--- |
| `none` | `null` | `none` | No navigation; conversational response only |
| `open_emotion_map` | `/(auth)/tools/emotion-map` | `navigation` | Interactive Somatic Emotion Heatmap |
| `show_today_goal` | `/(auth)/tools/mitra-goal` | `navigation` | View active daily micro-goal |
| `start_today_goal` | `/(auth)/tools/mitra-goal` | `navigation` | Launch micro-goal execution |
| `start_breathing` | `/(auth)/tools/breathing` | `navigation` | Paced somatic breathing exercise |
| `start_grounding` | `/(auth)/tools/grounding` | `navigation` | 5-4-3-2-1 sensory grounding exercise |
| `start_jpmr` | `/(auth)/tools/jpmr` | `navigation` | Progressive Muscle Relaxation module |
| `start_reframe` | `/(auth)/tools/reframe` | `navigation` | Guided CBT thought reframe journal |
| `start_cbt` | `/(auth)/tools/reframe` | `navigation` | Interactive CBT thought discovery |
| `open_counsellor_request` | `/(auth)/tools/appointments` | `navigation` | Verified campus counselor request portal |
| `show_check_in` | `/(auth)/(tabs)` | `navigation` | Home dashboard for daily check-in |

---

## 7. Server / Client Responsibility Split

### Server (`convex/companion.ts`, `convex/emotyActionRouter.ts`)
- Authenticates the student caller via Clerk session identity.
- Enforces daily message rate limits and input sanitization.
- Performs authoritative safety classification (`normal`, `elevated`, `crisis`).
- Queries bounded context through Context Manager.
- Validates Gemini LLM JSON response against `EmotyResponseContract`.
- Validates candidate action via `validateAndResolveAction`.
- Replaces any unauthorized, malformed, or safety-violating action with `{ type: "none" }`.
- Persists only clean plain text to `aiCompanionLogs`.

### Client (`app/(auth)/tools/companion.tsx`)
- Receives the validated structured action `{ type, label? }`.
- Tracks active non-`none` actions associated with assistant messages (`actionByMessageId`).
- Presents an explicit, clean CTA button below the message bubble (e.g. "Breathing Exercise", "Counselor Support").
- When the user taps the CTA, executes `resolveActionNavigation(action, safetyState)` to retrieve `{ pathname: AppRoute }`.
- Invokes `router.push(target.pathname)`.
- Never executes raw route strings, script evaluation, function names, or direct database mutations from the LLM.

---

## 8. Safety Interaction
The Action Router strictly enforces the safety tiering established in Step 4:
- **`CRISIS`**:
  - Gemini is never invoked during self-directed crisis.
  - The controlled crisis response explicitly provides `open_counsellor_request`.
  - Even if an LLM response or simulated payload specifies `start_breathing` or `start_cbt` during crisis, `validateAndResolveAction` intercepts and blocks it.
- **`ELEVATED`**:
  - Permitted somatic wellness actions (`start_breathing`, `start_grounding`, `start_jpmr`, `open_counsellor_request`) can be recommended, but cannot carry execution parameters.
- **`NORMAL`**:
  - Standard conversational support with optional capability recommendations.
  - `none` is standard and does not force an intervention.

---

## 9. Counsellor-Request Handling
`open_counsellor_request` is treated as a high-security navigational pointer:
- Maps exclusively to `/(auth)/tools/appointments`.
- Rejects any client-provided or LLM-provided `counsellorId`, `appointmentId`, or `timestamp`.
- The actual creation of counselor requests, assignment, and alerting remains governed by the existing authenticated mutations in `convex/counsellorRequests.ts` and `convex/appointments.ts`.

---

## 10. CBT / Reframe / Goal / Check-in Protections
- **CBT**: Cannot accept `sessionId`, `step`, or `score`.
- **Reframe**: Cannot inject arbitrary `content` or override CBT instructions.
- **Goals**: Cannot fabricate `goalId`, `points`, or `status`.
- **Check-in**: Cannot fabricate `checkInId` or `moodScore`.
All operational IDs and session states are authoritatively retrieved from the Convex database on the respective screens, never trusted from AI payloads.

---

## 11. Failure / Fail-Closed Behavior
On encountering:
- An unknown action type (e.g. `start_hypnosis`)
- An unexpected parameter (e.g. `{ malicious: true }`)
- Missing action data (`null` / `undefined`)
- An action prohibited under the current safety state (e.g. wellness tool during `crisis`)

The Action Router:
1. Sets `valid: false`.
2. Emits an audit warning in server logs.
3. Sets `fallbackAction: { type: "none" }` and `resolved.route: null`.
4. The conversational text response remains intact for the student.
5. No client crash, no error banner, and no unintended navigation occurs.

---

## 12. Security Tests
Four specific malicious AI payload attacks were implemented and verified in `convex/emotyActionRouter.test.ts`:

1. **Arbitrary Navigation Injection**:
   ```json
   { "action": { "type": "navigate", "route": "/admin" } }
   ```
   $\rightarrow$ Result: Rejected (`valid: false`), fails closed to `{ type: "none" }`, route resolves to `null`.
2. **Arbitrary Function Execution**:
   ```json
   { "action": { "type": "execute", "function": "deleteUser" } }
   ```
   $\rightarrow$ Result: Rejected (`valid: false`), fails closed to `{ type: "none" }`, route resolves to `null`.
3. **Session Hijacking / Tampering**:
   ```json
   { "action": { "type": "start_cbt", "sessionId": "someone-elses-session" } }
   ```
   $\rightarrow$ Result: Rejected (`valid: false`), fails closed to `{ type: "none" }`, route resolves to `null`.
4. **Counselor Spoofing**:
   ```json
   { "action": { "type": "open_counsellor_request", "counsellorId": "attacker-controlled-id" } }
   ```
   $\rightarrow$ Result: Rejected (`valid: false`), fails closed to `{ type: "none" }`, route resolves to `null`.

---

## 13. Files Changed
1. **`convex/emotyActionRouter.ts`** *(NEW)*: Authoritative static action route map (`ACTION_ROUTE_MAP`), action validator (`validateAndResolveAction`), and navigation resolver (`resolveActionNavigation`).
2. **`convex/companion.ts`** *(MODIFIED)*: Integrated `validateAndResolveAction` into `generateAIResponse` across crisis, offline fallback, and Gemini candidate flows.
3. **`app/(auth)/tools/companion.tsx`** *(MODIFIED)*: Added `actionByMessageId` state to track validated actions, and rendered confirmed action CTA buttons below AI messages that dispatch via `resolveActionNavigation`.
4. **`convex/emotyActionRouter.test.ts`** *(NEW)*: Comprehensive test suite for ACTION-01 to ACTION-29 and Section 19 security exploits.

---

## 14. Tests Added
33 new tests in `convex/emotyActionRouter.test.ts`:
- `ACTION-01`: `none` performs no action.
- `ACTION-02`: `open_emotion_map` resolves to existing Emotion Map flow.
- `ACTION-03`: `show_today_goal` resolves correctly.
- `ACTION-04`: `start_today_goal` resolves correctly.
- `ACTION-05`: `start_breathing` resolves correctly.
- `ACTION-06`: `start_grounding` resolves correctly.
- `ACTION-07`: `start_jpmr` resolves correctly.
- `ACTION-08`: `start_reframe` resolves correctly.
- `ACTION-09`: `start_cbt` resolves correctly.
- `ACTION-10`: `open_counsellor_request` resolves correctly.
- `ACTION-11`: `show_check_in` resolves correctly.
- `ACTION-12`: Unknown action type is rejected.
- `ACTION-13`: Arbitrary route cannot be executed.
- `ACTION-14`: Arbitrary function name cannot be executed.
- `ACTION-15`: Arbitrary action parameters are rejected safely.
- `ACTION-16`: Client-provided userId cannot influence execution ownership.
- `ACTION-17`: CRISIS cannot execute arbitrary Gemini wellness actions.
- `ACTION-18`: CRISIS controlled response remains compatible with Step 4.
- `ACTION-19`: ELEVATED action behavior respects safety constraints.
- `ACTION-20`: `none` does not force an intervention.
- `ACTION-21`: Missing action falls back safely.
- `ACTION-22`: Invalid structured response cannot reach execution.
- `ACTION-23`: Missing route/handler does not crash the conversation.
- `ACTION-24`: Counsellor request only opens the existing request flow.
- `ACTION-25`: CBT action cannot modify CBT session state directly.
- `ACTION-26`: Reframe action cannot inject arbitrary reframe content.
- `ACTION-27`: Goal actions cannot fabricate goal IDs.
- `ACTION-28`: Check-in action cannot fabricate check-in IDs.
- `Section 19 Security 1`: Malicious route injection fails closed.
- `Section 19 Security 2`: Malicious function execution fails closed.
- `Section 19 Security 3`: Malicious CBT sessionId spoofing fails closed.
- `Section 19 Security 4`: Malicious counsellorId injection fails closed.
- `ACTION-29`: Integration test - `generateAIResponse` respects Action Router boundaries.

---

## 15. Full Test Result
Ran full Vitest test suite:
```
Test Files  51 passed (51)
Tests       894 passed (894)
Duration    16.46s
```
*0 failures, 0 regressions across all 51 test suites.*

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
✓ built in 733ms
Exit code: 0
```

---

## 18. Known Limitations
1. **Local-Only Ephemeral CTA State**: In `companion.tsx`, action CTA buttons are displayed for actions received in the active session. Past messages from prior days in `aiCompanionLogs` store conversational text without persisted action metadata (by architectural design to keep chat log schema lightweight and backwards-compatible).
2. **Client Route Availability**: All 11 actions map to existing Expo Router paths. If any subroute path is renamed in future mobile app refactors, `AppRoute` union and `ACTION_ROUTE_MAP` will catch it at compile time through TypeScript.

---

## 19. Confirmation of Out-of-Scope Items
As strictly mandated:
- **NO** avatar redesign was performed.
- **NO** global renaming of Mitra to Emoty was done in the UI.
- **NO** persistent memory, embeddings, or RAG were added.
- **NO** proactive reminders were added.
- **NO** clinical scoring or triage changes were made.
- **NO** new questionnaire or clinical algorithms were introduced.
- **NO** counselor dashboard redesign was performed.
- **NO** autonomous background actions were implemented.
All modifications were strictly constrained to AI-3 Step 5 (Action Router).
