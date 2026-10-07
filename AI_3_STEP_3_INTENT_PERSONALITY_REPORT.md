# AI-3 Step 3: Intent, Conversational Reasoning & Personality Foundation Report

## 1. Intent Architecture

The conversational reasoning pipeline moves Emoty from a brittle keyword bot to a contextual, intent-first AI companion. 

### Conceptual Pipeline
```text
User message
     ↓
Understand meaning & conversational context
     ↓
Determine conversational intent (semantic classification)
     ↓
Understand emotional context & distress signals
     ↓
Determine what would genuinely help (reflection vs coping vs boundary)
     ↓
Select response mode ("casual" | "emotional_support" | "guidance" | "app_assistance" | "out_of_scope")
     ↓
Apply conversational guardrails (max 1 question, no action execution claims, pure emotions -> action: none)
     ↓
Generate natural structured JSON contract
```

The system is implemented in `convex/emotyIntent.ts` and integrated cleanly into `convex/companion.ts`.

---

## 2. Mode Definitions

The 5 modes defined in `convex/emotyContract.ts` are strictly maintained:

1. **`casual`**: Everyday conversation, greetings ("Hey", "Good morning"), casual comments ("That was funny"), and light appreciation ("Thanks"). No unsolicited mental health or intervention redirects.
2. **`emotional_support`**: User expressions of loneliness, exhaustion, sadness, frustration, grief, or distress ("I'm feeling lonely", "Today was horrible", "I'm tired"). Emoty responds with sincere, unscripted validation without canned empathy phrases ("I'm here for you") or forced interventions.
3. **`guidance`**: Practical requests for coping strategies, direction, or advice ("I'm stressed about exams, what should I do?", "How do I calm down?", "I keep procrastinating because I'm anxious"). Offers 1–2 practical coping suggestions or reflection points.
4. **`app_assistance`**: Direct questions regarding Emotify tools, screens, or features ("Where can I see today's goal?", "How do I do breathing?", "Can I check my emotions?"). Grounded strictly in available capabilities.
5. **`out_of_scope`**: Unrelated general knowledge, trivia, coding, or math ("Who discovered gravity?", "Write a Java program", "What is 27 × 43?"). Handled with a friendly boundary redirecting back to wellbeing and Emotify.

---

## 3. Personality Rules

- **Identity**: Emoty is a warm, thoughtful AI companion and well-wisher for college students. It is NOT a therapist, doctor, diagnostic engine, or general-purpose query engine.
- **Empathetic & Genuine**: Listens first, responds directly to what the student shared, and avoids robotic boilerplate.
- **Clear Boundaries**:
  - Never claims biological life or emotions.
  - Never says it "loves" the user or implies emotional dependence ("I need you").
  - Never guilts the user into returning or replacing human connections (friends, counselors).
  - Never pretends certainty about mental states or diagnoses psychiatric disorders.

---

## 4. Out-of-Scope Behavior

- Out-of-scope queries produce:
  ```json
  {
    "mode": "out_of_scope",
    "response": "That's a little outside my lane! I'm mainly here to help with how you're feeling, your goals, and things you can work on in Emotify.",
    "action": { "type": "none" },
    "avatarState": "idle"
  }
  ```
- **Never Answers Trivia First**: Emoty does NOT compute the math or answer trivia before redirecting (e.g. will NOT say "27*43 is 1161, but how are you?").
- **Contextual Academic Exception**: Queries involving academic subjects combined with emotional distress (e.g., "I'm stressed because I don't understand Newton's laws" or "Can you help me understand this assignment? I'm really anxious about failing") prioritize the student's distress and are classified as `emotional_support` or `guidance`, NOT `out_of_scope`.

---

## 5. Context Usage

Emoty utilizes the bounded server-side `EmotyContext` built in Step 2:
- Context is integrated naturally into the prompt without feature advertising.
- If context shows a pending breathing goal and current emotion `stressed`, Emoty may gently reference it only if relevant to what the student asked.
- Unprompted feature dumps and unsolicited recommendations are disallowed.

---

## 6. Prompt Architecture

The Gemini prompt in `convex/emotyIntent.ts` is structured into modular, maintainable sections:

```text
1.  [EMOTY IDENTITY]
2.  [EMOTY BEHAVIOR]
3.  [INTENT & MODE RULES]
4.  [OUT-OF-SCOPE RULES]
5.  [CONVERSATIONAL STYLE]
6.  [SAFETY BOUNDARY]
7.  [AVAILABLE APP CAPABILITIES & ACTION RULES]
8.  [QUICK ACTION GUIDANCE] (if supplied)
9.  [CURRENT APP CONTEXT]
10. [RECENT CONVERSATION]
11. [CURRENT USER MESSAGE]
12. [RESPONSE CONTRACT]
```

Total prompt length remains safely bounded under 12,000 characters.

---

## 7. Follow-Up-Question Behavior

- **Questions are Optional**: A follow-up question is not mandatory. Emoty can comfortably acknowledge a situation with a supportive statement without interrogating.
- **Strict Single Question Limit**: Guardrails strictly prevent multiple question marks in a single response, enforcing at most ONE relevant question when it materially helps understanding.
- No repetitive interrogation or forced "Want to tell me more?" phrasing.

---

## 8. Intervention-Selection Behavior & Action Boundaries

- **Recommendation is NOT Execution**: Emoty may suggest or recommend a wellness action, but the model NEVER executes it.
- **Claim Neutralization**: Guardrails disarm any model attempts to claim execution (e.g., "I have started your breathing exercise" is transformed to "You can start your breathing exercise").
- **Pure Emotional Statements**: Expressions like "Today was horrible" or "I'm sad" return `action: { type: "none" }`. Emotional expression alone does not justify triggering an intervention.
- **Allowlist Enforced**: Action types are strictly limited to the 11 allowlisted types (`none`, `open_emotion_map`, `show_today_goal`, `start_today_goal`, `start_breathing`, `start_grounding`, `start_jpmr`, `start_reframe`, `start_cbt`, `open_counsellor_request`, `show_check_in`).
- **Counselor Escalation**: `open_counsellor_request` is recommended only when the user explicitly or clearly implicitly seeks human/counselor support.

---

## 9. Client-Context Trust Boundaries

- **Authoritative Database Context**: User preferred name, age cohort, active goal, database current emotion, recent intervention status are authoritative application facts.
- **Client UI Context**: Active screen, client-passed activeActivity, and client-passed activeGoal are treated purely as UI state / hints.
- Client UI context is NEVER treated as clinical proof of diagnosis, risk level, triage, or completed interventions.

---

## 10. Files Changed

1. `convex/emotyIntent.ts` (NEW): Modular prompt builder, semantic intent analyzer, and conversational guardrail enforcer.
2. `convex/companion.ts` (MODIFIED): Integrated `buildModularEmotyPrompt` and `enforceConversationalGuardrails` into `generateAIResponse`.
3. `convex/emotyIntent.test.ts` (NEW): Test suite covering `INTENT-01` through `INTENT-20`.

---

## 11. Tests Added

A comprehensive 20-test suite in `convex/emotyIntent.test.ts`:
- **INTENT-01**: Casual greeting → `casual`
- **INTENT-02**: Ordinary conversation → `casual`
- **INTENT-03**: Emotional expression → `emotional_support`
- **INTENT-04**: Emotional statement with request for help → `guidance`
- **INTENT-05**: Practical wellbeing question → `guidance`
- **INTENT-06**: Emotify feature question → `app_assistance`
- **INTENT-07**: Unrelated factual question → `out_of_scope`
- **INTENT-08**: Unrelated programming question → `out_of_scope`
- **INTENT-09**: Academic question containing emotional context → `emotional_support` / `guidance`
- **INTENT-10**: Same emotion ("tired") with different intents produces different modes
- **INTENT-11**: Emotional statement does not automatically trigger an intervention (`action: none`)
- **INTENT-12**: Follow-up question is optional rather than mandatory
- **INTENT-13**: More than one follow-up question is prevented
- **INTENT-14**: Out-of-scope response does not answer the unrelated question
- **INTENT-15**: Model cannot invent unavailable app features (Action type allowlist)
- **INTENT-16**: Model cannot claim an action was completed
- **INTENT-17**: Client `activeGoal` and UI context are not treated as clinical truth
- **INTENT-18**: Age cohort affects permitted communication context without psychological assumptions
- **INTENT-19**: Structured response contract remains valid
- **INTENT-20**: Authentication, rate-limit, and security behavior remains intact

---

## 12. Full Test Count

- **Previous Baseline (Step 2)**: 820 tests passed across 48 test files.
- **New Baseline (Step 3)**: **840 tests passed across 49 test files** (100% pass rate, 0 regressions).

---

## 13. TypeScript Result

Command: `npx tsc --noEmit`
Result: Clean (Exit code 0, 0 errors).

---

## 14. Dashboard Build Result

Command: `cd dashboard && npm run build`
Result: Clean (Vite production build completed successfully in 4.37s).

---

## 15. Known Limitations

- **Action Router Execution Deferred**: The model may recommend an action, but client-side execution routing is deferred to later architecture steps.
- **Server Crisis Gate Deferred**: Step 3 focuses on intent and conversational reasoning. The dedicated multi-tier clinical safety architecture and counselor escalation gates belong strictly to Step 4.

---

## 16. Explicit Confirmation: Step 4+ Were NOT Implemented

- Server-side crisis gate was **NOT** implemented.
- Clinical safety-state inference was **NOT** implemented.
- Counselor alerts pipeline was **NOT** modified.
- Action router execution was **NOT** implemented.
- Avatar redesign was **NOT** implemented.
- Mitra → Emoty global UI rename was **NOT** performed.
- Persistent memory, embeddings, and RAG were **NOT** implemented.
