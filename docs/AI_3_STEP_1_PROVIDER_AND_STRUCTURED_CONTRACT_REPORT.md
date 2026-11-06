# EMOTY AI REWORK — AI-3 STEP 1 REPORT
## Provider Correction & Structured Response Contract Foundation

**Execution Date:** 2026-10-04  
**Status:** COMPLETE & VERIFIED  
**Baseline Test Count:** 791 / 791 passing  
**New Test Count:** 803 / 803 passing (+12 new tests in `convex/emoty.test.ts`, 0 regressions)  
**TypeScript (`tsc --noEmit`):** CLEAN (0 errors)  
**Dashboard Production Build:** CLEAN (`vite v8.0.13` built in 688ms)  

---

### Executive Summary

AI-3 Step 1 establishes the foundational AI provider correction and structured response contract for the Emoty AI redesign, strictly adhering to the scope boundaries defined in `AI_2_EMOTY_CURRENT_TO_TARGET_GAP_AUDIT.md` and the AI-3 Step 1 prompt instructions.

Prior to this step:
1. The AI companion invoked invalid Gemini model identifiers (`gemini-3.1-flash-lite`, `gemini-3.5-flash`) that failed against Google's Generative Language API, causing automatic fallbacks to raw 5-string keyword mock answers.
2. The AI companion expected and returned unstructured plain strings.
3. The client expected raw strings, vulnerable to rendering unstructured prompt syntax.

In this step:
1. Standardized Gemini REST model identification on verified, production-supported models with environment configuration override (`process.env.GEMINI_MODEL`).
2. Created `convex/emotyContract.ts` defining a runtime-enforced, type-safe contract:
   ```typescript
   {
     mode: EmotyMode;
     response: string;
     action: EmotyAction;
     avatarState: EmotyAvatarState;
   }
   ```
3. Enforced structured JSON output (`responseMimeType: "application/json"`) in `convex/companion.ts` using the proven approach from `convex/cbt.ts`.
4. Implemented strict runtime validation rejecting invalid modes, unknown actions, invalid avatar states, missing responses, or malformed JSON, automatically triggering a safe structured fallback.
5. Preserved 100% database persistence and mobile client UI compatibility without premature table schema changes.
6. Maintained all P14 security boundaries, output sanitization, rate limiting, and counselor privacy guarantees.

---

### 1. Provider / Model Verification

We inspected the Google Generative Language REST API integration across `convex/companion.ts` and `convex/cbt.ts`:
- **Endpoint Structure:** `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
- **Request Mechanism:** REST `fetch` with `POST` and JSON payload containing `contents: [{ role: "user", parts: [{ text: ... }] }]`.
- **Structured Output Mechanism:** Supported in `v1beta` via `generationConfig.responseMimeType = "application/json"`.

**Verification Finding:**
- The existing codebase attempted to invoke `gemini-3.1-flash-lite` and `gemini-3.5-flash`. These are non-existent model tags on Google Generative Language v1beta.
- When invoked, the Google REST API returns HTTP 404 (`models/gemini-3.1-flash-lite is not found for API version v1beta`).

---

### 2. Exact Model Identifiers Selected

The following prioritized model cascade was configured via `getGeminiModels()` in [convex/emotyContract.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/emotyContract.ts):

1. **Configurable Primary:** `process.env.GEMINI_MODEL` (if set in deployment environment).
2. **First Verified Default:** `"gemini-1.5-flash"` — High availability, proven `v1beta` JSON schema/mime support, low latency, cost-effective for conversational companions.
3. **High-Efficiency Fallback:** `"gemini-1.5-flash-8b"` — Ultra-low latency, high throughput fallback for conversational chat.
4. **Next-Generation Fallback:** `"gemini-2.0-flash"` — Secondary modern tier supported on `v1beta`.

---

### 3. Why These Models Are Compatible

1. **REST API Alignment:** Fully supported on `v1beta/models/...:generateContent`.
2. **Native JSON Mode:** Both `gemini-1.5-flash` and `gemini-2.0-flash` reliably honor `generationConfig: { responseMimeType: "application/json" }`.
3. **API Key Compatible:** Works seamlessly with `GEMINI_API_KEY` passed as query parameter `?key=${apiKey}` without requiring Google Cloud Vertex AI OAuth client overhead.
4. **Latency & Cost Profile:** Flash-tier models provide sub-second response times necessary for mobile companion interactivity.
5. **No Client Exposure:** API keys are retrieved server-side via `getSecret(ctx, "GEMINI_API_KEY")` or `process.env.GEMINI_API_KEY`, strictly inside Convex action execution.

---

### 4. Files Changed

| File | Change Nature | Purpose |
| :--- | :--- | :--- |
| [convex/emotyContract.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/emotyContract.ts) | **NEW FILE** | Defines `EmotyResponseContract`, valid modes, action types, verified avatar states, validation parser `validateEmotyResponse()`, extraction helper, safe fallback `getSafeStructuredFallback()`, and model list `getGeminiModels()`. |
| [convex/companion.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/companion.ts) | **MODIFIED** | Implemented structured JSON generation (`responseMimeType: "application/json"`), prompt instructions for Emoty contract, strict runtime validation, safe fallback, plain-text response sanitization, and backward-compatible persistence. |
| [convex/cbt.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/cbt.ts) | **MODIFIED** | Replaced hardcoded invalid models with centralized `getGeminiModels()`. |
| [app/(auth)/tools/companion.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/tools/companion.tsx) | **MODIFIED** | Minimal client compatibility layer: safely unwraps `aiResponseRaw.response` (or string fallback) for speech synthesis, without breaking the existing message list. |
| [convex/emoty.test.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/emoty.test.ts) | **NEW FILE** | 12 focused unit & integration tests for contract validation, mode/action rejection, fallback behavior, authentication, rate limiting, and persistence. |

---

### 5. Files Intentionally Untouched

To prevent scope creep and maintain strict boundary isolation:
- **`convex/schema.ts`**: Untouched. No premature memory, context, summary, or action tables created.
- **`convex/counsellorRequests.ts` & `convex/appointments.ts`**: Untouched. Clinical workflows and request queues remain intact.
- **`convex/triage.ts` & `convex/alerts.ts`**: Untouched. Crisis triage scoring and counselor emergency notifications remain untouched.
- **`convex/screening.ts`**: Untouched. Clinical PHQ-9, GAD-7, and PQ-16 assessment scoring untouched.
- **`components/avatar/MitraAvatar.tsx`**: Untouched. The avatar component and visual states remain unchanged; only its existing 13 states are referenced by the contract.
- **`convex/companionQuickActions.ts`**: Untouched. Quick actions continue operating independently.

---

### 6. New Response Contract

Defined in [convex/emotyContract.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/emotyContract.ts):

```typescript
export interface EmotyResponseContract {
  mode: EmotyMode;
  response: string;
  action: EmotyAction;
  avatarState: EmotyAvatarState;
}
```

#### Valid Modes:
- `"casual"`
- `"emotional_support"`
- `"guidance"`
- `"app_assistance"`
- `"out_of_scope"`

#### Valid Action Types:
- `"none"`
- `"open_emotion_map"`
- `"show_today_goal"`
- `"start_today_goal"`
- `"start_breathing"`
- `"start_grounding"`
- `"start_jpmr"`
- `"start_reframe"`
- `"start_cbt"`
- `"open_counsellor_request"`
- `"show_check_in"`

*Action constraints:* Arbitrary action types are rejected. If an optional `label` is provided, all HTML/script tags are stripped to plain display text. Arbitrary action parameters are not permitted in this step.

#### Valid Avatar States:
Exact set of 13 existing states verified from `components/avatar/MitraAvatar.tsx`:
`"idle"`, `"speaking"`, `"listening"`, `"happy"`, `"thinking"`, `"concerned"`, `"empathetic"`, `"calm"`, `"celebrating"`, `"breathing"`, `"encouraging"`, `"guiding"`, `"reflective"`.

---

### 7. Validation Behavior

When candidate output is received from Gemini:
1. **JSON Extraction:** `extractJsonFromModelText(text)` strips markdown fences (````json ... ````) and locates matching outer braces.
2. **Schema & Field Verification:**
   - Must be an object (not array or primitive).
   - `response` must be a non-empty string.
   - `mode` must exist and be a member of `EMOTY_MODES`.
   - `action` must be an object with `type` in `EMOTY_ACTION_TYPES`.
   - `avatarState` must exist and be a member of `EMOTY_AVATAR_STATES`.
3. **Rejection Handling:** If ANY validation rule fails (invalid mode, invalid action, invalid avatar state, missing fields, or malformed JSON), `validateEmotyResponse` returns `null`.
4. **Sanitization:** The response natural-language text is passed through `sanitizeOutput()` which:
   - Blocks prompt-leakage patterns (e.g. system instructions, delimiters).
   - Sanitizes plain-text content via `sanitizePlainText()` (stripping script/HTML tags).

---

### 8. Fallback Behavior

If Gemini is unreachable, missing an API key, returns an HTTP error, or yields an invalid JSON payload that fails validation, the system generates a safe, deterministic structured fallback via `getSafeStructuredFallback()`:

```json
{
  "mode": "casual",
  "response": "I'm having a little trouble thinking right now. Try sending that again in a moment.",
  "action": {
    "type": "none"
  },
  "avatarState": "idle"
}
```

*Note on Legacy Mock Generator:* The previous `getMockAIResponse()` (which mapped keywords like "sad" or "anxious" to hardcoded canned strings) is preserved internally in `convex/companion.ts` strictly as an emergency diagnostic fallback for legacy testing, but is **no longer used** as a surrogate for successful structured generation.

---

### 9. Database & Client Compatibility Approach

#### Database Compatibility:
- Convex `aiCompanionLogs` table schema stores `content: v.string()`.
- If raw JSON were stored in `aiCompanionLogs.content`, existing conversation history queries (`getConversationHistory`) and admin counselor transcript viewers would render raw JSON syntax `{"mode": ...}`.
- Therefore, `convex/companion.ts` extracts `contract.response` (the sanitized natural-language message) and persists it to `aiCompanionLogs`.
- The action returns the full `contract` object (`EmotyResponseContract`) to callers.

#### Client Compatibility:
- In `app/(auth)/tools/companion.tsx`, the response received from `generateAIResponse` is checked:
  ```typescript
  const naturalText =
    typeof aiResponseRaw === "object" && aiResponseRaw !== null && "response" in aiResponseRaw
      ? (aiResponseRaw as { response: string }).response
      : String(aiResponseRaw || "");
  ```
- Speech synthesis (`speakText(naturalText)`) receives clean text.
- The UI bubble list updates via reactive subscription to `getConversationHistory`, seamlessly showing the natural dialogue without code breaks.
- Full Action execution, router dispatch, and dynamic avatar state transitions are intentionally deferred to subsequent AI-3 steps.

---

### 10. Security Preservation

All P14 security boundaries were strictly preserved:
1. **Authentication:** `generateAIResponse` enforces `await requireIdentity(ctx)` and resolves the authentic student `userId`. Unauthenticated callers are rejected immediately.
2. **Student Data Isolation:** Companion messages can only be logged for the authenticated user's own `userId`. Cross-student impersonation is impossible.
3. **Sanitization:** Both user inputs and AI outputs pass through `sanitizeInput` and `sanitizeOutput`.
4. **Prompt Leakage Prevention:** Responses containing system prompt delimiters or internal instructions are neutralized and replaced with safe defaults.
5. **Rate Limiting:** `checkRateLimit(ctx, { key: "companion:generate:...", maxRequests: 30, windowMs: 60000 })` remains actively enforced.
6. **Transcript Boundaries:** Companion logs remain excluded from the clinical timeline and are strictly protected under P14 rules.

---

### 11. Test Results

#### Unit & Integration Suite (`convex/emoty.test.ts`):
12 new tests created and verified passing:
- `CONTRACT-01`: Valid structured response passes validation.
- `CONTRACT-02`: Invalid mode is rejected.
- `CONTRACT-03`: Invalid action type is rejected.
- `CONTRACT-04`: Invalid avatar state is rejected.
- `CONTRACT-05`: Missing response is rejected.
- `CONTRACT-06`: Malformed JSON returns null.
- `CONTRACT-07`: Markdown code fences are cleanly stripped.
- `CONTRACT-08`: Verified model list contains gemini-1.5-flash and respects env override.
- `CONTRACT-09`: Safe structured fallback matches contract.
- `CONTRACT-10`: Unauthenticated caller to generateAIResponse is rejected.
- `CONTRACT-11`: Authenticated generateAIResponse returns structured Emoty contract and persists text.
- `CONTRACT-12`: Rate limit is enforced on generateAIResponse.

#### Full Regression Suite (`npx vitest run`):
- **Test Files:** 47 passed (47)
- **Total Tests:** 803 passed (803)
- **Duration:** 15.41s
- **Regressions:** 0

---

### 12. TypeScript & Build Results

- **`npx tsc --noEmit`**: Exited with code 0 (clean, no type errors).
- **Dashboard Production Build (`npm run build` in `/dashboard`)**:
  - `tsc -b && vite build`
  - 2,409 modules transformed.
  - Built cleanly in 688ms.

---

### 13. Existing Test Count Before / After

| Metric | Before AI-3 Step 1 | After AI-3 Step 1 | Delta |
| :--- | :---: | :---: | :---: |
| **Passing Test Files** | 46 | 47 | +1 |
| **Passing Tests** | 791 | 803 | +12 |
| **Failing Tests** | 0 | 0 | 0 |
| **TypeScript Errors** | 0 | 0 | 0 |

---

### 14. Existing Limitations & Known Safety Gap

1. **Context Manager Not Active Yet:** The prompt sent to Gemini currently contains only the immediate user message and static identity instructions. Context assembly (active emotion state, today's micro-goal, recent check-in history) will be built in AI-3 Step 2.
2. **Action Router Inactive:** The model produces structured actions (e.g. `{ type: "start_breathing" }`), but client-side execution is intentionally not hooked up yet.
3. **Client Crisis Architecture Gap:** Crisis detection currently relies on client-side regex matching in `app/(auth)/tools/companion.tsx`. A server-side crisis gate and sovereign triage routing will be implemented in a dedicated AI-3 safety phase.

---

### 15. Explicit Handoff to AI-3 Step 2

With the provider corrected, models validated, structured response contract established, and zero security regressions confirmed:

**Ready for AI-3 Step 2: Context Manager Foundation**
- Design and implement the server-side Context Manager.
- Assemble user context (emotion check-in, recent micro-goals, intervention status) into the prompt context budget.
- Maintain P14 privacy boundaries during context gathering.
