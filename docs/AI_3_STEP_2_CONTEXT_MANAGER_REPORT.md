# EMOTY AI REWORK — AI-3 STEP 2 REPORT
## Context Manager Foundation

**Execution Date:** 2026-10-04  
**Status:** COMPLETE & VERIFIED  
**Baseline Test Count (Step 1A):** 805 / 805 passing across 47 test files  
**New Test Count (Step 2):** 820 / 820 passing across 48 test files (+15 new context tests, 0 regressions)  
**TypeScript (`tsc --noEmit`):** CLEAN (0 errors)  
**Dashboard Production Build:** CLEAN (`vite v8.0.13` built in 680ms)  

---

### Executive Summary

AI-3 Step 2 establishes the server-side Context Manager for Emoty AI, providing Google Gemini with a small, controlled, purpose-built context object rather than raw database dumps.

Key Achievements:
1. Created [convex/emotyContext.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/emotyContext.ts) implementing a type-safe `EmotyContext` contract across four context layers:
   - **Layer A (Conversation):** Up to 12 recent messages, user messages <= 600 chars, assistant messages <= 800 chars, aggregate conversation <= 6000 chars, built newest-to-oldest and formatted chronologically.
   - **Layer B (User/App):** Preferred name (<= 50 chars), age cohort (`"13-18"` or `"19-24"`), language (<= 30 chars), today's goal (<= 120 chars), current emotion (<= 60 chars), and recent intervention (type <= 60 chars, status <= 30 chars).
   - **Layer C (Current App State):** Strict allowlist of valid screens (`"home" | "companion" | "emotion_map" | "reframe" | "cbt" | "recovery_plan" | "counsellor_request" | "check_in" | "unknown"`), normalizing invalid or unprovided values to `"unknown"`.
   - **Layer D (Safety State):** Reserved field defaulting strictly to `"normal"` without clinical scoring inference.
2. Implemented exact context budgets:
   - Maximum dynamic context <= 9,500 characters.
   - Maximum complete prompt <= 12,000 characters.
   - Current user message bounded to <= 2,000 characters.
   - App/user context block bounded to <= 1,500 characters.
3. Completely excluded raw clinical screenings (PHQ-9, GAD-7, PQ-16), scores, counselor notes, counselor requests, and clinical timelines from context assembly.
4. Integrated context formatting into [convex/companion.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/companion.ts), cleanly separating base behavioral instructions, authoritative context rules, app context, bounded conversation history, and current user message.
5. Added client compatibility in [app/(auth)/tools/companion.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/tools/companion.tsx) passing `screen: "companion"`.
6. Verified with 15 dedicated unit and integration tests in [convex/emotyContext.test.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/emotyContext.test.ts), 820/820 passing tests across the repo, clean TypeScript, and clean dashboard build.

---

### 1. Context Manager Architecture

```text
User Message + Client Screen ("companion")
                     ↓
       Authenticated Convex Action
        (api.companion.generateAIResponse)
                     ↓
          Run Authoritative Query
     (api.emotyContext.getAuthoritativeEmotyContext)
                     ↓
   ┌──────────────────────────────────────────────────┐
   │ Fetch Authenticated Student Data Only:          │
   │ • users: alias / first name, ageCohort          │
   │ • dailyCheckins / emotionLogs: currentEmotion   │
   │ • microGoals: todayGoal (title, status)         │
   │ • breathing/grounding/reframe/jpmr/cbt: recent  │
   │ • aiCompanionLogs: up to 12 bounded messages    │
   └──────────────────────────────────────────────────┘
                     ↓
    Strict Normalization & Exact Budget Truncation
                     ↓
               EmotyContext
                     ↓
        formatEmotyContextPrompt
    (Separated into distinct labeled sections)
                     ↓
               Google Gemini
  (generationConfig: { responseMimeType: "application/json" })
                     ↓
            EmotyResponseContract
```

---

### 2. Context Contract

Defined in [convex/emotyContext.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/emotyContext.ts):

```typescript
export interface EmotyContext {
  conversation: {
    recentMessages: Array<{
      role: "user" | "assistant";
      content: string;
    }>;
  };

  user: {
    preferredName?: string;
    ageCohort?: "13-18" | "19-24";
    language?: string;
  };

  app: {
    screen: EmotyScreen;
    todayGoal?: {
      title: string;
      status: "not_started" | "in_progress" | "completed";
    };
    currentEmotion?: string;
    recentIntervention?: {
      type: string;
      status?: string;
    };
    activeActivity?: string;
    activeGoal?: string;
  };

  safety: {
    state: "normal" | "elevated" | "crisis";
  };
}
```

---

### 3. Every Context Field & Authoritative Source

| Field | Type / Range | Authoritative DB Source | Logic / Derivation |
| :--- | :--- | :--- | :--- |
| `user.preferredName` | `string` (<= 50 chars) | `users.alias` or `users.full_name` | Uses `user.alias` if non-empty; otherwise first word of `user.full_name`. Truncated to 50 chars. |
| `user.ageCohort` | `"13-18" \| "19-24"` | `users.age` | Normalized: `13-18` if age is 13..18; `19-24` if age is 19..24; otherwise `undefined`. Exact age and DOB are **never** passed. |
| `user.language` | `string` (<= 30 chars) | Client argument `language` | Validated allowlist (`"en" \| "hi" \| "ta" \| "te"`). Defaults to `"en"`. |
| `app.screen` | `EmotyScreen` | Client argument `screen` / `clientContext.screen` | Validated against allowlist of 8 screens. Unrecognized or missing values normalize strictly to `"unknown"`. |
| `app.todayGoal` | `{ title, status }` | `microGoals` table | Matches student's goals where `date === todayStr` or `createdAt >= startOfDay`. Status mapped to `"not_started" \| "in_progress" \| "completed"`. Title <= 120 chars. |
| `app.currentEmotion` | `string` (<= 60 chars) | `dailyCheckins.mood` / `emotionLogs` | Matches today's `dailyCheckins` mood; falls back to newest `emotionLogs.strongestEmotion` or `emotionLogs.emotion`. Truncated to 60 chars. |
| `app.recentIntervention` | `{ type, status }` | Most recent record across: `breathingLogs`, `groundingLogs`, `reframeLogs`, `jpmrLogs`, `cbtSessions` | Compares timestamps across the 5 tables for the student; selects the newest completed/partial intervention. Type <= 60 chars, status <= 30 chars. |
| `app.activeActivity` | `string` (<= 50 chars) | `clientContext.activeActivity` | Allowlisted client activity string, sanitized and truncated to 50 chars. |
| `app.activeGoal` | `string` (<= 120 chars) | `clientContext.activeGoal` | Allowlisted client goal string, sanitized and truncated to 120 chars. |
| `conversation.recentMessages` | Array of `{ role, content }` | `aiCompanionLogs` table | Queries student's messages ordered by `createdAt desc`. Bounded to 12 messages, user <= 600 chars, assistant <= 800 chars, total conversation <= 6,000 chars. Chronological order. |
| `safety.state` | `"normal" \| "elevated" \| "crisis"` | Context Manager default | Reserved field defaulting strictly to `"normal"`. No clinical inference performed in Step 2. |

---

### 4. Fields Intentionally Excluded

To protect student privacy and clinical boundaries:
- **NO Raw Questionnaire Data:** PHQ-9, GAD-7, and PQ-16 responses are never read or passed.
- **NO Screening Scores:** Total scores, item 9 flags, and clinical severity levels are omitted.
- **NO Counselor Private Notes:** Counselor review notes, notes on requests, and internal notes are omitted.
- **NO Counselor Chat / Request Transcripts:** Private requests and counselor communications remain segregated.
- **NO Clinical Timeline:** Events in `clinicalTimelines` are excluded.
- **NO Internal Authorization Data:** User roles (`admin`, `counsellor`), password hashes, and biometric tokens are omitted.
- **NO System Metadata / Secrets:** API keys, session tokens, and database `_id` values are excluded.

---

### 5. Client-Provided Fields & Backend Validation

The client can provide:
```typescript
{
  screen?: string;
  clientContext?: {
    screen?: string;
    activeActivity?: string;
    activeGoal?: string;
  }
}
```

#### Validation Enforcement:
1. `normalizeScreen()`: Checks whether `screen` is in `VALID_EMOTY_SCREENS` (`home`, `companion`, `emotion_map`, `reframe`, `cbt`, `recovery_plan`, `counsellor_request`, `check_in`). Any other value (e.g. arbitrary routes or attacks) normalizes to `"unknown"`.
2. `sanitizeClientContext()`: Extracts ONLY the allowlisted keys (`screen`, `activeActivity`, `activeGoal`). Any arbitrary keys injected by the client (such as `triage: "low"`, `risk: "none"`, `counsellorNote: "..."`, or `role: "admin"`) are **completely stripped**.
3. Student Identity Isolation: The client cannot specify a `userId` to retrieve another student's context. `getAuthoritativeEmotyContext` derives the student identity exclusively from `ctx.auth.getUserIdentity()`.

---

### 6. Exact Context Budget Enforcement

| Budget Constant | Value | Enforcement Mechanism |
| :--- | :---: | :--- |
| `MAX_CONVERSATION_MESSAGES` | **12** | `rawMessages.take(13)`, filtered for current message, capped at 12 items. |
| `MAX_USER_MESSAGE_CHARS` | **600** | User messages sliced to 600 characters before inclusion. |
| `MAX_ASSISTANT_MESSAGE_CHARS` | **800** | Assistant messages sliced to 800 characters before inclusion. |
| `MAX_CONVERSATION_CHARS` | **6,000** | Aggregate characters accumulated newest-to-oldest; loop breaks when budget is reached. |
| `MAX_PREFERRED_NAME_CHARS` | **50** | `truncateString(name, 50)` |
| `MAX_LANGUAGE_CHARS` | **30** | `truncateString(lang, 30)` |
| `MAX_GOAL_TITLE_CHARS` | **120** | `truncateString(title, 120)` |
| `MAX_EMOTION_CHARS` | **60** | `truncateString(emotion, 60)` |
| `MAX_INTERVENTION_TYPE_CHARS` | **60** | `truncateString(type, 60)` |
| `MAX_INTERVENTION_STATUS_CHARS` | **30** | `truncateString(status, 30)` |
| `MAX_APP_CONTEXT_CHARS` | **1,500** | Serialized `[CURRENT APP CONTEXT]` block sliced to 1,500 characters. |
| `MAX_CURRENT_USER_MESSAGE_CHARS` | **2,000** | Current user message sliced to 2,000 characters. |
| `MAX_DYNAMIC_CONTEXT_CHARS` | **9,500** | Total dynamic context (app + convo + user msg) bounded to 9,500 characters. |
| `MAX_TOTAL_PROMPT_CHARS` | **12,000** | Total prompt sent to Gemini bounded to 12,000 characters. |

---

### 7. Prompt Integration

In [convex/companion.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/companion.ts), the prompt is assembled into four clearly delineated sections:

```text
[EMOTY BEHAVIOR INSTRUCTIONS]
You are Emoty, a caring AI companion and well-wisher.
...
CRITICAL REQUIREMENT:
You must output ONLY a valid raw JSON object matching this schema:
...

Context Rules:
- Values provided in [CURRENT APP CONTEXT] and [RECENT CONVERSATION] are application-provided facts.
- Do not invent missing values.
- Do not claim an action was completed unless confirmed by application context.
- Do not invent goals, appointments, counselor interactions, or clinical information.

[CURRENT APP CONTEXT]
Screen: companion
Preferred name: Alex
Age cohort: 19-24
Language: en
Today's goal: Drink 2L Water (not_started)
Current emotion: hopeful
Recent intervention: Box Breathing 4-4-4-4 (completed)
Safety state: normal

[RECENT CONVERSATION]
User: I was feeling overwhelmed earlier.
Emoty: I am glad you took a moment to breathe. How are you feeling now?

[CURRENT USER MESSAGE]
Much better, thank you!
```

---

### 8. Security & Privacy Boundaries Preserved

1. **Authentication:** `getAuthoritativeEmotyContext` requires `await ctx.auth.getUserIdentity()`. Unauthenticated queries throw immediately.
2. **Student Isolation:** Context queries resolve data solely using `identity.subject`. Client-provided user IDs are disregarded (`CONTEXT-13` verified).
3. **No Clinical Bleed:** Screenings, clinical triage, counselor transcripts, and admin notes are completely excluded (`CONTEXT-11` and `CONTEXT-12` verified).
4. **Input & Output Sanitization:** All strings are stripped of HTML tags, script tags, and injection markers via `sanitizePlainText`.
5. **Prompt Leakage Protection:** Responses containing system prompt markers are detected and replaced with safe fallbacks.
6. **Rate Limiting:** Companion generation rate limits (30 req/min) remain active.

---

### 9. Tests Added

15 new tests created in [convex/emotyContext.test.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/emotyContext.test.ts):
- `CONTEXT-01 & 14`: Minimal authenticated context builds successfully with missing optional fields.
- `CONTEXT-02`: Preferred name is included when available (alias preferred over full name).
- `CONTEXT-03`: Age cohort is normalized correctly (13-18, 19-24, invalid -> undefined).
- `CONTEXT-04`: Today's goal is included when available from authoritative `microGoals`.
- `CONTEXT-05`: Current emotion is included from `dailyCheckins` or `emotionLogs`.
- `CONTEXT-06`: Recent intervention is included only when authoritative data exists.
- `CONTEXT-07`: Recent conversation is bounded to max 12 messages and max 6,000 characters.
- `CONTEXT-08`: Oversized message content is truncated/bounded (user <= 600, assistant <= 800).
- `CONTEXT-09`: Invalid screen value is rejected or normalized to `unknown`.
- `CONTEXT-10`: Arbitrary client context is rejected (injected keys stripped).
- `CONTEXT-11`: Raw PHQ-9/GAD-7/PQ-16 data cannot enter the Emoty context.
- `CONTEXT-12`: Counselor/private clinical information cannot enter the Emoty context.
- `CONTEXT-13`: Another student's data cannot be retrieved through context construction.
- `CONTEXT-15`: Generated Gemini prompt contains controlled context rather than raw database objects.
- `CONTEXT-16`: Authenticated `generateAIResponse` operates with Context Manager and returns valid structured contract.

---

### 10. Complete Test Count & Verification Summary

| Suite / Verification | Result |
| :--- | :--- |
| **`convex/emotyContext.test.ts`** | **15 / 15 passed** (109ms) |
| **`convex/emoty.test.ts`** | **14 / 14 passed** (133ms) |
| **Full Vitest Test Suite (`npx vitest run`)** | **820 / 820 passed** across 48 test files (15.53s) |
| **Test Regressions** | **0 regressions** (805 passing in Step 1A → 820 passing in Step 2) |
| **TypeScript Compiler (`npx tsc --noEmit`)** | **Exit code 0** (0 type errors) |
| **Dashboard Production Build (`npm run build`)** | **Exit code 0** (`vite v8.0.13` built in 680ms) |

---

### 11. Known Limitations & Clean Staging for Step 3+

1. **Intent Classifier & Persona Not Redesigned:** Base behavior instructions remain at baseline; persona tuning and intent classification belong to AI-3 Step 3.
2. **Action Router Inactive:** The model outputs recommended actions, but client-side dispatch and execution are deferred to Step 3.
3. **Safety State Static:** `safety.state` is reserved and defaults to `"normal"`. The dedicated server-side crisis gate and sovereign triage routing belong to AI-3 Step 4.

---

### 12. Explicit Confirmation: Step 3+ NOT Implemented

Per strict instructions:
- **NO** intent classifier redesign.
- **NO** personality redesign or tone changes.
- **NO** out-of-scope routing.
- **NO** Action Router execution.
- **NO** server-side crisis architecture or alert modifications.
- **NO** avatar redesign or Mitra → Emoty renames.
- **NO** persistent memory, embeddings, vector database, or RAG.
- **NO** clinical reasoning or clinical scoring changes.
- **NO** counselor workflow modifications.
