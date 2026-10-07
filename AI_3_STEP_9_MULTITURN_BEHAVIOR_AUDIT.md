# EMOTIFY AI-3 STEP 9: MULTI-TURN DIALOGUE BEHAVIORAL AUDIT

## 1. Executive Summary & Purpose
This audit analyzes Mitra's multi-turn conversational behavior across the server-side dialogue pipeline (`convex/companion.ts`, `convex/emotyContext.ts`, `convex/emotyIntent.ts`, `convex/emotyMemory.ts`, `convex/emotySafety.ts`, and `convex/emotyContract.ts`). 

The objective is to identify concrete behavioral gaps in multi-turn dialogues (turns 3 to 10) where repetitive phrasing, unsolicited follow-up questions, refusal disregard, or awkward topic transitions degrade conversational quality.

---

## 2. In-Depth Behavioral Audit Across the 14 Dimensions

### 1. Multi-Turn History
- **Implementation:** `convex/emotyContext.ts` builds conversation history using `buildConversationContext(messagesNewestFirst)` taking up to 12 messages or 6000 total characters. Messages are reversed into chronological order (`oldest -> newest`) and presented as `[RECENT CONVERSATION]`.
- **Status:** **Working as Intended**. The chronological ordering and message budget provide solid grounding.
- **Observed Gap:** While recent messages are present, there is no higher-level contextual summary of recent conversational turns (e.g. what Mitra asked in the previous turn).

### 2. Repeated Questions
- **Implementation:** `enforceConversationalGuardrails` checks `/\?/g` and limits the output to at most one question per single turn.
- **Observed Gap (Concrete Defect):** There is **zero cross-turn deduplication** of questions. If Mitra asks *"What is on your mind?"* in Turn 1, and the user answers *"My assignments are piling up"*, in Turn 2 Mitra often falls back to asking another generic variant: *"What is stressing you out about college?"* or *"Tell me what feels hardest?"*. Mitra must recognize when a question was already answered and advance the dialogue rather than re-questioning.

### 3. Topic Changes
- **Implementation:** The prompt provides conversation context in `[RECENT CONVERSATION]`, but lacks explicit topic transition directives.
- **Observed Gap (Concrete Defect):** When a student discusses an emotional issue in Turns 1–3 and then abruptly shifts in Turn 4 (e.g., *"Anyway, what are you doing today?"* or *"Do you like music?"*), the assistant frequently clings to the prior emotional context (e.g., *"I'm just here thinking about how stressed you are with your exams, but to answer your question..."*). Current user intent must take immediate precedence without dragging the student back into past distress.

### 4. User Refusal ("No", "I'm okay", "Leave it")
- **Implementation:** `determineSemanticIntent` in `convex/emotyIntent.ts` classifies messages as `casual`, `emotional_support`, `guidance`, `app_assistance`, or `out_of_scope`.
- **Observed Gap (Concrete Defect):** When Mitra offers an exercise or asks an exploratory question and the student replies *"No, I'm okay"*, *"No thanks"*, or *"Leave it"*, the system does not recognize a conversational refusal or boundary. As a result, the model may attempt to offer alternative tools (e.g., *"If you don't want breathing, how about journaling?"*) or probe further (*"Are you sure? Tell me why you feel that way."*). Mitra must respect user refusal immediately with graceful acceptance and zero pressure.

### 5. Short Answers ("Yeah", "Okay", "Nope", "Fine")
- **Implementation:** Short answers pass through `determineSemanticIntent`.
- **Observed Gap (Concrete Defect):** A short response like *"Yeah"* or *"Nope"* in response to a Mitra query is often treated in isolation as a new conversational prompt rather than an answer to Mitra's preceding question. The model either treats it as a greeting or abruptly asks another question.

### 6. Emotional Statements Without Intervention Request
- **Implementation:** In `emotyIntent.ts`:
  - `isPureEmotion` check (`sad`, `lonely`, `tired`, `exhausted`) in `enforceConversationalGuardrails` sets `action: { type: "none" }`.
- **Status:** **Partially Protected**. The action router is guarded from recommending tools on pure emotional statements.
- **Observed Gap:** The conversational reply itself sometimes still verbally suggests tools in natural language (e.g., *"Sounds like you're exhausted. You should do a 5-minute breathing exercise"*), even if the structured action field was suppressed. Verbal prompting must match the non-prescriptive stance.

### 7. Casual Conversation
- **Implementation:** Everyday greetings and casual remarks map to `mode: "casual"`, `action: "none"`, `avatarState: "happy"|"calm"`.
- **Status:** **Working as Intended**. No clinical interventions or screening triggers occur during casual chats.

### 8. Preference Injection
- **Implementation:** Active non-sensitive preferences from `emotyMemories` are injected under `[USER PREFERENCES & CONTEXT]`.
- **Status:** **Working as Intended**.
- **Observed Gap:** Prompt needs reinforcement to ensure the model does not meta-reference its memory (e.g., *"Since you told me you like short answers, here is a short answer"*).

### 9. Current Intent Precedence
- **Implementation:** `emotyIntent.ts` includes the rule:  
  *"PRIORITY OVERRIDE: Current user request always overrides past preferences."*
- **Status:** **Working as Intended**.

### 10. Action Recommendations
- **Implementation:** Guardrail 3 neutralizes claims of execution (e.g., *"I have started your breathing session"* -> *"You can start your breathing session"*).
- **Status:** **Working as Intended**. Action router strictly enforces valid types and non-clinical routing.

### 11. Safety Transitions
- **Implementation:** `classifyServerSafety` is executed synchronously on every single user turn in `convex/companion.ts` before any AI execution.
- **Status:** **Authoritative and Robust**. If Turn 1 is casual, Turn 2 is distress, and Turn 3 is a suicide/self-harm disclosure, Turn 3 is immediately trapped by the server gate, creating a deduplicated alert and returning `getControlledCrisisResponse()` with Gemini 100% suppressed.

### 12. Conversation Ending ("Thanks, that's all", "Bye", "Good night")
- **Implementation:** The prompt states *"Stop naturally when the conversation ends"*.
- **Observed Gap (Concrete Defect):** In practice, the model routinely appends an obligatory closing question (*"Is there anything else I can assist you with today?"* or *"Let me know if you need more help!"*). When a user says *"Thanks, that's all"*, Mitra should provide a brief, warm farewell without any follow-up question.

### 13. Repeated Acknowledgements
- **Implementation:** `INTENT_AND_MODE_RULES_SECTION` instructs *"Do NOT use canned phrases ('I'm here for you')"*.
- **Observed Gap (Concrete Defect):** In multi-turn dialogue, the model frequently starts every single turn with predictable formulaic empathy markers:  
  - Turn 1: *"I hear you, and that sounds really hard."*  
  - Turn 2: *"I completely understand, that must be overwhelming."*  
  - Turn 3: *"I hear how difficult that is for you."*  
  Mitra needs instructions to acknowledge dynamically and vary conversational cadence across turns, speaking like an authentic friend rather than an empathy template.

### 14. Context-Window Limits
- **Implementation:** Strict character bounds in `convex/emotyContext.ts`:
  - `MAX_CONVERSATION_MESSAGES = 12`
  - `MAX_USER_MESSAGE_CHARS = 600`
  - `MAX_ASSISTANT_MESSAGE_CHARS = 800`
  - `MAX_CONVERSATION_CHARS = 6000`
  - `MAX_DYNAMIC_CONTEXT_CHARS = 9500`
  - `MAX_TOTAL_PROMPT_CHARS = 12000`
- **Status:** **Working as Intended**. Rock-solid bounds prevent token overflow or latency spikes.

---

## 3. Concrete Behavioral Defects Identified for Step 9
1. **Defect A: Follow-up Over-Questioning:** The assistant adds an interrogative sentence to almost every response, making the student feel probed.
2. **Defect B: Refusal Disregard:** Saying *"No, I'm fine"* or *"Leave it"* does not gracefully close the inquiry or topic; the model often re-prompts or offers another tool.
3. **Defect C: Conversational Closing Drag:** Saying *"Thanks, that's all"* triggers *"How else can I help?"* instead of a clean, warm exit.
4. **Defect D: Formulaic Acknowledgement Loops:** Consecutive turns start with almost identical empathetic opening phrases.
5. **Defect E: Topic Clinging:** Switching from exam stress to casual chit-chat does not cleanly drop the previous distress topic.
6. **Defect F: Verbal Tool Prescriptions on Pure Emotional Statements:** Suggesting tools verbally in the response text even when `action.type` was correctly defaulted to `none`.

---

## 4. Proposed Modular Enhancements (Phases 3–7)
1. **Multi-Turn Dynamics Rules in `emotyIntent.ts`**:
   - Add explicit directives for:
     - Refusal handling (`USER DECLINING` -> acknowledge, accept, zero pressure, no alternative tool).
     - Conversation closing (`CONVERSATION CLOSING` -> warm farewell, zero follow-up question, no tool).
     - Topic transition (`TOPIC SHIFT` -> follow new subject immediately, drop past distress).
     - Repetition prevention (vary conversational openings, do not start every turn with *"I hear you..."*).
     - Selective questioning (do NOT ask a question if user just provided an answer, declined, or closed).
2. **Deterministic Contextual Refinement in `enforceConversationalGuardrails`**:
   - If user input indicates closure (*"that's all"*, *"bye"*, *"good night"*, *"that'll be all"*), strip trailing question marks from response.
   - If user input indicates refusal (*"no, i'm okay"*, *"no thanks"*, *"leave it"*, *"don't want to"*), ensure response does not contain tool prompts or follow-up questions.
   - Ensure verbal tool recommendations are not made when `action.type === "none"` and user did not ask for a tool.

---

## 5. Audit Conclusion
The underlying foundational architecture (Steps 1–8) is completely sound. The required multi-turn polish can be achieved cleanly through targeted modular prompt rules and conversational guardrails in `convex/emotyIntent.ts` without introducing new tables, external dependencies, or complex state machines.
