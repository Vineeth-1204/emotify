# EMOTIFY AI-3 STEP 7: MEMORY & PERSONALIZATION ARCHITECTURE REPORT

## 1. Status
**Status:** COMPLETED & LOCKED (All Gates Passed)  
**Date:** October 4, 2026  
**Implementation Phase:** AI-3 Step 7 — Memory & Personalization Architecture  

---

## 2. Existing Memory Architecture Found
Prior to AI-3 Step 7, Mitra/Emoty possessed:
- **Level 1 (Temporary Conversation):** Supported in `convex/emotyContext.ts` via recent messages query (`getRecentMessages`), bounded to 10 messages for short-term conversational context.
- **Level 4 (Authoritative App State):** Distributed across Convex authoritative tables (`dailyCheckins`, `microGoals`, `triages`, `safetyAlerts`, `counselorRequests`, etc.).
- **Missing Gap (Levels 2 & 3):** No dedicated, bounded table or validation gate existed for cross-session continuity or persistent non-sensitive preferences. Chat history alone was being referenced, with no structured barrier separating personal preferences from clinical logs or medical disclosures.

---

## 3. Schema Changes
Created a dedicated Convex table `emotyMemories` in [convex/schema.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/schema.ts) with zero vector/embedding/RAG overhead:
```typescript
emotyMemories: defineTable({
  userId: v.string(),
  category: v.union(
    v.literal("communication_preference"),
    v.literal("support_preference"),
    v.literal("routine_preference"),
    v.literal("goal_preference"),
    v.literal("chosen_name"),
    v.literal("conversation_summary"),
  ),
  key: v.string(),
  value: v.string(),
  source: v.optional(v.union(v.literal("explicit_user_statement"), v.literal("system_inferred"), v.literal("user_action"))),
  active: v.boolean(),
  expiresAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_userId_and_category", ["userId", "category"])
  .index("by_userId_and_key", ["userId", "key"])
  .index("by_userId_and_active", ["userId", "active"])
```

---

## 4. Allowed Memory Categories
Categories are strictly constrained by a frozen allowlist:
1. `communication_preference`: e.g. `concise_responses`, `detailed_explanations`, `casual_tone`, `formal_tone`.
2. `support_preference`: e.g. `breathing_exercises`, `grounding_exercises`, `journaling_prompts`, `listening_mode`.
3. `routine_preference`: e.g. `morning_routine`, `evening_routine`, `midday_pause`.
4. `goal_preference`: e.g. `small_steps`, `structured_milestones`.
5. `chosen_name`: preferred non-sensitive chosen name / handle.
6. `conversation_summary`: compact non-clinical summary of previous discussions (bounded to 250 characters, temporary/expirable).

Any candidate outside this allowlist or without an allowed key is **strictly rejected**.

---

## 5. Rejected / Sensitive Categories & Policy Gate
A deterministic server-side policy gate (`validateMemoryCandidate`) rejects any candidate matching any of the following patterns:
- **Suicide & Self-Harm / Crisis:** `suicide`, `kill myself`, `self-harm`, `cutting`, `overdose`, `end my life`.
- **Clinical Diagnoses & Psychiatric Terms:** `depression`, `anxiety disorder`, `bipolar`, `schizophrenia`, `ptsd`, `adhd`, `ocd`, `anorexia`, `bulimia`, `psychosis`.
- **Screening Tools & Quantitative Scores:** `phq-9`, `gad-7`, `pq-16`, `screening score`, `assessment score`.
- **Triage & Risk Classifications:** `triage`, `high risk`, `severe risk`, `moderate risk`, `clinical alert`.
- **Counselor Notes & Clinical Relationships:** `counselor note`, `therapist note`, `psychiatrist`, `session notes`, `clinical notes`.
- **Medications & Pharmacotherapy:** `medication`, `antidepressant`, `ssri`, `lexapro`, `zoloft`, `prozac`, `adderall`, `dosage`, `prescription`.
- **Safety Alerts & Crisis Flags:** `safety alert`, `crisis alert`, `escalation flag`.

**Fail-Closed Semantics:** If any candidate string contains sensitive clinical keywords or exceeds string limits (key ≤ 50 chars, value ≤ 250 chars), the policy gate immediately returns `allowed: false` with a specific rejection reason.

---

## 6. Persistence Flow
```
User Message
   ↓
[companion.ts / UI action]
   ↓
detectMemoryCandidate(userMessage)  (Deterministic allowlisted candidate extractor)
   ↓
validateMemoryCandidate(candidate)  (Server-Authoritative Policy Gate)
   ↓ (if allowed === false -> silently or safely discard)
recordUserPreference({ category, key, value }) (Authenticated Convex Mutation)
   ↓
Deduplication Check (by_userId_and_key)
   ↓ (Update existing active row OR Insert new row)
emotyMemories Table
   ↓
Future Context Manager queries via getBoundedUserMemoriesForContext
   ↓
Injected into Mitra Prompt with Strict Bounded Budget
```

**Zero LLM Write Autonomy:** Gemini cannot output JSON or SQL or function calls that arbitrarily write or alter database memories. The server determines whether an explicit preference statement matches allowlisted patterns and passes the candidate through the policy gate.

---

## 7. Authorization Model
- Every query (`listUserMemories`) and mutation (`recordUserPreference`, `deactivateUserMemory`, `deleteUserMemory`, `clearAllUserMemories`) retrieves the caller identity strictly via `ctx.auth.getUserIdentity()`.
- Client-provided `userId` parameters are **never accepted or trusted**.
- Cross-user memory queries and updates are impossible: every database lookup filters strictly on `user.subject`. An unauthorized caller attempting to deactivate or delete another user's memory receives an immediate authorization error.

---

## 8. Deduplication Strategy
To prevent uncontrolled database growth across repeated interactions:
- When `recordUserPreference` runs, it queries `emotyMemories` using the index `.withIndex("by_userId_and_key", (q) => q.eq("userId", userId).eq("key", key))`.
- If an existing entry exists with the exact same category and key:
  - If the value matches: It updates `updatedAt` and ensures `active = true` (idempotent).
  - If the value differs (e.g. user previously preferred `concise` and now requests `detailed`): It updates the value in-place, refreshes `updatedAt`, and marks `active = true`.
- Zero duplicate rows are created for the same user and preference key.

---

## 9. Context Manager Integration
In [convex/emotyContext.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/emotyContext.ts):
- Added `memory` field to `EmotyContext` containing `activePreferences` and optional `recentConversationSummary`.
- Implemented `getBoundedUserMemoriesForContext(ctx, userId)`:
  - Queries active memories for the user.
  - Filters out expired memories (`expiresAt < now`).
  - Strict budget enforcement: Max 5 items, max 500 total characters.
- Formats memories cleanly under a dedicated `[USER PREFERENCES & CONTEXT]` section in the system prompt.

---

## 10. Modular Prompt Integration
In [convex/emotyIntent.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/emotyIntent.ts) and [convex/emotyContext.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/emotyContext.ts):
Added explicit behavioral rules to the prompt:
1. `USER PREFERENCES ARE NOT CLINICAL FACTS:` "These are non-sensitive preferences provided by the application. Do not infer clinical conditions, symptoms, or diagnoses from them."
2. `NATURAL CONVERSATIONAL USE:` "Adapt tone or pace seamlessly without referencing internal systems or stating 'according to my memory'."
3. `CURRENT USER INTENT PRECEDENCE:` "Current user request ALWAYS takes precedence over stored preferences. (Example: If stored preference says 'prefers concise responses' but user asks 'explain in detail', provide a detailed explanation)."
4. `NO HALLUCINATED MEMORIES:` "Do not claim to remember facts, dates, or details that are not provided in this context."

---

## 11. Tests Added
Created 20 dedicated unit and integration tests in [convex/emotyMemory.test.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/emotyMemory.test.ts):
- **MEMORY-01:** Allowed communication preference (`concise_responses`) is validated and stored.
- **MEMORY-02:** Allowed support preference (`breathing_exercises`) is validated and stored.
- **MEMORY-03:** Chosen-name preference (`preferred_name`) is validated and stored.
- **MEMORY-04:** Duplicate preference is updated in-place (deduplicated) rather than creating new rows.
- **MEMORY-05:** Temporary conversational fact ("I have an exam on Friday") is detected as temporary and rejected from permanent memory.
- **MEMORY-06:** Clinical/diagnostic content ("diagnosed with major depression") is strictly rejected by the policy gate.
- **MEMORY-07:** PHQ/GAD/PQ screening information ("PHQ-9 score is 18") is strictly rejected.
- **MEMORY-08:** Triage/risk classification ("high risk triage classification") is strictly rejected.
- **MEMORY-09:** Crisis and self-harm disclosure ("want to kill myself") is rejected from ordinary memory.
- **MEMORY-10:** Counselor and private clinical information ("counselor said to take meds") is rejected.
- **MEMORY-11:** Memory retrieval requires authenticated identity (`ctx.auth.getUserIdentity()`).
- **MEMORY-12:** Cross-user memory access fails and blocks modification of other users' memories.
- **MEMORY-13:** Gemini/model output cannot directly perform arbitrary memory mutations (fail-closed).
- **MEMORY-14:** Disallowed memory categories outside the frozen allowlist are rejected.
- **MEMORY-15:** Memory is strictly bounded (max 5 items, max 500 characters) before entering context.
- **MEMORY-16:** Current user request overrides an old preference in prompt directives.
- **MEMORY-17:** Memory does not alter safety state.
- **MEMORY-18:** Memory does not alter clinical triage state.
- **MEMORY-19:** Memory does not fabricate or invoke arbitrary AI actions.
- **MEMORY-20:** CRISIS state completely suppresses Gemini and produces zero memory writes.

---

## 12. Full Verification Results

### 12.1. Memory Unit Tests
```
✓ convex/emotyMemory.test.ts (20 tests passed)
```

### 12.2. All AI-3 Step 1–7 Tests
```
✓ convex/emoty.test.ts (14 tests)
✓ convex/emotyContext.test.ts (15 tests)
✓ convex/emotyIntent.test.ts (20 tests)
✓ convex/emotySafety.test.ts (21 tests)
✓ convex/emotyActionRouter.test.ts (33 tests)
✓ convex/emotyAvatar.test.ts (24 tests)
✓ convex/emotyAvatarVisual.test.ts (26 tests)
✓ convex/emotyMemory.test.ts (20 tests)
Total AI-3 suite: 173 tests passed (0 failures)
```

### 12.3. Full Project Vitest Suite
```
Test Files: 54 passed (54)
Tests:      964 passed (964)
Duration:   17.29s
```

### 12.4. TypeScript Check
```
Command: npx tsc --noEmit
Result: 0 errors
```

### 12.5. Counselor Dashboard Build
```
Command: npm run build (in dashboard)
Result: tsc -b && vite build
✓ 2409 modules transformed
✓ built in 883ms (exit code 0)
```

### 12.6. Android Release Build
```
Command: .\gradlew.bat assembleRelease (in android)
Result: BUILD SUCCESSFUL in 1m 4s (609 actionable tasks, exit code 0)
```

---

## 13. Files Changed
1. `convex/schema.ts` — Added dedicated `emotyMemories` table with compound indexes.
2. `convex/emotyMemory.ts` — New dedicated memory module with frozen allowlist, deterministic policy gate, preference detection, deduplication, and authenticated operations.
3. `convex/emotyContext.ts` — Extended `EmotyContext` with bounded memory context and prompt formatting.
4. `convex/emotyIntent.ts` — Updated prompt assembly with memory directives and current user intent override rule.
5. `convex/companion.ts` — Integrated memory candidate detection and bounded retrieval in conversational pipeline while preserving crisis suppression.
6. `convex/emotyMemory.test.ts` — New test suite covering MEMORY-01 through MEMORY-20.

---

## 14. Explicit Statement on Clinical Data Isolation
**AI MEMORY ≠ CLINICAL RECORD.**  
No clinical data, PHQ-9/GAD-7/PQ-16 responses or scores, psychiatric diagnoses, triage risk levels, safety alerts, counselor notes, or crisis disclosures have become or can become ordinary AI memory. All such disclosures are deterministically filtered and rejected by server-side policy gates before persistence.

---

## 15. Known Limitations
- Preference extraction currently detects explicit user phrasing (e.g. "I prefer...", "call me...", "I like breathing exercises"). Subtle, conversational nuance will be refined through user preference toggles in future steps.
- Temporary conversation summaries (Level 2) are defined and bounded with expiration support in schema, but full automatic summarization jobs across sessions will be hooked up when multi-session transcripts are archived.

---

## 16. Recommended Next Step
- Proceed to **AI-3 Step 8** (User Preference UI / Settings Integration or Multi-Turn Dialogue Polish), exposing user controls to review, toggle, or clear their stored preferences within their Profile settings.
