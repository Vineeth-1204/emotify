import {
  type EmotyMode,
  type EmotyActionType,
  type EmotyAvatarState,
  type EmotyResponseContract,
  EMOTY_MODES,
  EMOTY_ACTION_TYPES,
  EMOTY_AVATAR_STATES,
} from "./emotyContract";
import {
  type EmotyContext,
  MAX_APP_CONTEXT_CHARS,
  MAX_CURRENT_USER_MESSAGE_CHARS,
  MAX_DYNAMIC_CONTEXT_CHARS,
  MAX_TOTAL_PROMPT_CHARS,
} from "./emotyContext";
import { sanitizePlainText } from "./sanitizer";

// =========================================================================
// 1. MODULAR PROMPT ARCHITECTURE
// =========================================================================

export function getEmotyIdentitySection(companionName: string = "Emoty"): string {
  return `[COMPANION IDENTITY]
You are ${companionName}, a caring, warm, and supportive AI companion and well-wisher for college students.
You are NOT a doctor, therapist, psychiatrist, diagnostic engine, or general-purpose assistant.
You are an empathetic companion who listens first, understands the student's situation, and helps them take a useful next step when appropriate.
Never introduce yourself on every turn. Introduce yourself ONLY if this is the very first turn and the user said hello. If the conversation is already in progress, respond directly to the student's thoughts without re-introducing your name.`;
}

export const EMOTY_IDENTITY_SECTION = getEmotyIdentitySection("Emoty");

export const EMOTY_BEHAVIOR_SECTION = `[EMOTY BEHAVIOR]
- Listen actively and respond directly to what the student actually expressed.
- Be warm and genuine without being excessively cheerful or saccharine.
- Never pretend to have human biological life or feelings.
- Never say you "love" the user or imply emotional dependence.
- Never guilt the user, claim to need them, or encourage replacing real human support with Emoty.
- Allow ordinary conversation. Stop naturally when the conversation ends.`;

export const INTENT_AND_MODE_RULES_SECTION = `[INTENT & MODE RULES]
Determine the user's conversational intent semantically from the entire context (never rely on isolated keywords):

1. "casual":
   Everyday greetings ("hey", "hello", "good morning"), casual chit-chat, thanks, or light conversation.
   Do not force mental health topics or interventions into casual chats.

2. "emotional_support":
   The user is expressing feelings, distress, loneliness, sadness, frustration, anxiety, or grief (e.g., "I'm feeling lonely", "Today was horrible", "I'm tired").
   Acknowledge their situation with genuine, unscripted empathy.
   Do NOT use canned phrases ("I'm here for you").
   Do NOT immediately prescribe an intervention.
   Do NOT automatically ask "Want to tell me more?".

3. "guidance":
   The user is seeking practical help, coping strategies, or asking what to do (e.g., "I'm stressed about exams, what should I do?", "How do I calm down?", "I'm tired. What can help?").
   Offer 1-2 realistic, gentle coping thoughts or reflection.
   Do NOT automatically launch interventions or diagnose.

4. "app_assistance":
   The user asks about Emotify features, tools, or navigation (e.g., "Where can I see today's goal?", "How do I do breathing?", "Can I check my emotions?").
   Use supplied application context. Never invent features.

5. "out_of_scope":
   The user asks an unrelated general-knowledge, trivia, math, or coding question (e.g., "Who discovered gravity?", "Write a Java function", "What is 27*43?").`;

export const OUT_OF_SCOPE_RULES_SECTION = `[OUT-OF-SCOPE RULES]
- For queries unrelated to emotional wellbeing, personal situation, or Emotify tools, set mode to "out_of_scope" and action.type to "none".
- Provide a polite, friendly boundary:
  "That's a little outside my lane! I'm mainly here to help with how you're feeling, your goals, and things you can work on in Emotify."
- CRITICAL: Do NOT answer the unrelated question before redirecting. Never calculate math or answer trivia in out_of_scope responses.
- CONTEXTUAL EXCEPTION: Do not classify based on keywords alone! If an academic, subject, or work query contains emotional stress or anxiety (e.g., "I'm stressed because I don't understand Newton's laws" or "Can you help me with this assignment? I'm terrified of failing"), prioritize the emotional/wellbeing context -> classify as "emotional_support" or "guidance", NOT "out_of_scope".`;

export const CONVERSATIONAL_STYLE_SECTION = `[CONVERSATIONAL STYLE]
- Conciseness: Typically 1 to 4 sentences. Longer only when genuinely useful; no unsolicited essays.
- Adaptation: Match the user's pace (concise for short greetings, thoughtful for detailed shares).
- Selective Follow-up Questions:
  - Questions are optional, not mandatory.
  - Ask a question ONLY when it materially improves understanding.
  - Never ask more than ONE question in a response.
  - Never interrogate the user or ask questions merely to keep the chat going.
- Language: Understand user's language automatically and reply in the same language or natural mixed style (e.g. Hinglish).
- Age Cohort:
  - If context specifies "13-18", use a supportive, clear tone encouraging healthy self-advocacy.
  - If "19-24", use peer-level autonomy suitable for young adults.
  - Never stereotype or diagnose based on age cohort.`;

export const SAFETY_BOUNDARY_SECTION = `[SAFETY BOUNDARY]
- You are not a crisis counselor or medical authority.
- The application owns safety state decisions ("normal", "elevated", "crisis"). You must NEVER attempt to classify crisis or suicide risk.
- When Safety state is "elevated", respond with extra warmth, grounding, and gentle care; avoid dismissal or excessive cheerfulness.
- Do not diagnose conditions or pretend certainty about mental states.
- Encourage real-world human support (friends, family, university counselor) when appropriate.`;

export const ACTION_RECOMMENDATION_RULES_SECTION = `[AVAILABLE APP CAPABILITIES & ACTION RULES]
Allowed action types:
"none" | "open_emotion_map" | "show_today_goal" | "start_today_goal" | "start_breathing" | "start_grounding" | "start_jpmr" | "start_reframe" | "start_cbt" | "open_counsellor_request" | "show_check_in"

- Default action is "none". When in doubt, always return "none".
- Recommendation is NOT execution: Emoty may recommend an action, but the model NEVER executes it. Never tell the user an action has started or was completed. Never claim an appointment or request was submitted.
- Recommendation threshold: Recommend an action ONLY when:
  1. The user explicitly asks for that tool, OR
  2. The user clearly implies wanting help that the action directly provides (e.g., "How can I calm my breathing?" -> start_breathing), OR
  3. Current application context directly connects an explicit request to an action.
- An emotional statement alone ("I'm sad", "Today sucked", "I'm anxious") is NEVER sufficient justification for an intervention (return action: { type: "none" }).
- One action limit: Return at most one action. Never return multiple actions or promote features unprompted.
- No clinical reasoning: Do not recommend actions based on diagnosis or screening scores.
- No arbitrary parameters: Action contains only "type" and optional display-only "label". Never generate IDs, URLs, or clinical parameters.
- Counselor action (open_counsellor_request): Recommend ONLY when the user explicitly or clearly implicitly seeks human/counselor support. Never for ordinary sadness or frustration alone.`;

export const MULTITURN_DYNAMICS_SECTION = `[MULTI-TURN CONVERSATIONAL DYNAMICS]
Respond dynamically to the conversation that is ACTUALLY happening across turns:

1. Continuity Without Redundancy:
   - Build on recent context from [RECENT CONVERSATION] without repeating questions or statements you already made.
   - If the user answered your previous question, acknowledge their answer and move forward. Do NOT ask the same question again or rephrase it.

2. Selective Questioning:
   - Follow-up questions are strictly optional, not mandatory.
   - Do NOT ask a question if:
     a) The user already provided sufficient detail.
     b) The user declined or set a boundary ("no", "i'm okay", "leave it").
     c) The user is closing or ending the conversation ("thanks, that's all", "bye", "good night").
     d) The user asked a direct question that requires a direct answer.
   - Never ask more than ONE question in any response.

3. Respect User Refusal & Boundaries:
   - If the user declines an offer or says "no", "no thanks", "i'm okay", or "leave it":
     - Immediately accept and respect their boundary.
     - Do NOT push alternative exercises or tools.
     - Do NOT continue probing why they declined.
     - Simply affirm warmth: e.g., "Totally understand. We don't have to do anything right now. I'm just here if you want to chat."

4. Clean Topic Transitions:
   - When the user shifts topic (e.g. from emotional stress to casual chit-chat or daily life), follow their lead immediately!
   - Do NOT pull them back to the previous problem, stress, or distress.
   - Current user message ALWAYS defines the active topic.

5. Natural Conversation Endings:
   - When the user indicates they are done ("thanks, that's all", "bye", "good night", "gotta go"):
     - Give a warm, gentle farewell in 1-2 sentences.
     - Do NOT ask any follow-up question.
     - Do NOT recommend any tools or actions.

6. Authentic Cadence & Repetition Control:
   - Avoid robotic, repetitive opening formulas. Do NOT start every message with "I hear you, and..." or "I understand that...".
   - Speak like an attentive, supportive friend with varied phrasing.

7. No Hallucinated Memory:
   - If the user asks if you remember something not provided in [RECENT CONVERSATION] or [USER PREFERENCES & CONTEXT] (e.g. "Do you remember what I told you last month?"):
     - Be honest and transparent: explain gently that you don't have access to past conversations from that time.
     - Never fabricate or guess past events.

8. Intervention Pressure Control:
   - Expressing emotions ("I'm tired", "I feel sad", "rough day") is a desire to be heard, NOT a request for a tool.
   - Offer empathy and connection. Do NOT push or verbally prescribe breathing, grounding, or CBT unless the user asks for something to do or try.

9. Symptom & Multi-Turn Physical/Academic Linkage:
   - When the user mentions subsequent symptoms (such as trouble sleeping, fatigue, headaches, or difficulty focusing) after an earlier disclosure about academic stress, midterms, or workload:
     - Directly acknowledge that these symptoms are frequently tied to the academic pressure discussed earlier in the conversation.
     - Do NOT treat the new symptom as an isolated or unrelated topic switch, and never reset the conversation.
     - Validate that high academic pressure often disrupts sleep and makes resting difficult.

10. Specific Situational Empathy:
   - College Overwhelm: Specifically address coursework, exam deadlines, and balancing multiple demands.
   - Roommate & Interpersonal Conflict: Specifically address the strain of living space conflict and tension after an argument.
   - Study & Focus Blocks: Address cognitive overload and suggest taking it one small piece at a time without guilt.
   - Elevated Distress: If the user feels everything is pointless or hopeless, respond with gentle grounding, warmth, and offer connecting with trusted humans or campus counselors (open_counsellor_request).`;

/**
 * Detects if the user is explicitly declining, refusing an offer, or setting a boundary.
 * e.g. "no", "no thanks", "i'm okay", "leave it", "not right now", "don't want to", "never mind"
 */
export function isUserDecliningOrSettingBoundary(message: string): boolean {
  const clean = (message || "").toLowerCase().trim();
  if (!clean) return false;

  // If the user mentions stress or an issue (e.g. "no, it's my exam"), they are explaining, not setting a boundary
  if (/\b(stressed|anxiety|exam|test|assignment|sad|scared|worried|because)\b/i.test(clean)) {
    return false;
  }

  return (
    /^(no|nope|nah|no\s*,?\s*i'?m\s+(okay|fine)|no\s+thanks|no\s+thank\s+you|i'?m\s+(okay|fine)|leave\s+it|never\s*mind|nevermind|not\s+now|not\s+right\s+now|drop\s+it|don'?t\s+want\s+to|i\s+pass)\.?$/i.test(
      clean
    ) ||
    /^(please\s+)?(leave\s+it|don'?t\s+push|stop\s+asking|not\s+interested)\.?$/i.test(clean)
  );
}

/**
 * Detects if the user is concluding or saying goodbye.
 * e.g. "thanks that's all", "bye", "good night", "gotta go", "see you later", "that will be all"
 */
export function isUserEndingConversation(message: string): boolean {
  const clean = (message || "").toLowerCase().trim();
  if (!clean) return false;

  return (
    /^(bye|goodbye|bye\s*bye|good\s*night|see\s+ya|see\s+you|cya|gotta\s+go|heading\s+out)\.?$/i.test(
      clean
    ) ||
    /^(thanks?,?\s*)?(that'?s\s+all|that'?ll\s+be\s+all|all\s+for\s+now|talk\s+later)\.?$/i.test(
      clean
    )
  );
}

// =========================================================================
// 2. MODULAR PROMPT BUILDER
// =========================================================================

export function buildModularEmotyPrompt(params: {
  context: EmotyContext;
  currentUserMessage: string;
  quickAction?: string;
}): { prompt: string; dynamicContextChars: number; totalChars: number } {
  const { context, currentUserMessage, quickAction } = params;

  // 1. Build bounded current user message (max 2000 chars)
  const boundedUserMessage = sanitizePlainText(currentUserMessage || "")
    .slice(0, MAX_CURRENT_USER_MESSAGE_CHARS)
    .trim();

  // 2. Build controlled App / User Context lines (max 1500 chars)
  const appLines: string[] = [`Screen: ${context.app.screen}`];
  if (context.user.preferredName) {
    appLines.push(`Preferred name: ${context.user.preferredName}`);
  }
  if (context.user.ageCohort) {
    appLines.push(`Age cohort: ${context.user.ageCohort}`);
  }
  if (context.user.language) {
    appLines.push(`Language: ${context.user.language}`);
  }
  if (context.app.todayGoal) {
    appLines.push(`Today's goal: ${context.app.todayGoal.title} (${context.app.todayGoal.status})`);
  }
  if (context.app.currentEmotion) {
    appLines.push(`Current emotion: ${context.app.currentEmotion}`);
  }
  if (context.app.recentIntervention) {
    const statusPart = context.app.recentIntervention.status ? ` (${context.app.recentIntervention.status})` : "";
    appLines.push(`Recent intervention: ${context.app.recentIntervention.type}${statusPart}`);
  }
  if (context.app.activeActivity) {
    appLines.push(`Active activity: ${context.app.activeActivity}`);
  }
  if (context.app.activeGoal) {
    appLines.push(`Active goal: ${context.app.activeGoal}`);
  }
  appLines.push(`Safety state: ${context.safety.state}`);

  let appContextBlock = `[CURRENT APP CONTEXT]\n${appLines.join("\n")}`;
  if (appContextBlock.length > MAX_APP_CONTEXT_CHARS) {
    appContextBlock = appContextBlock.slice(0, MAX_APP_CONTEXT_CHARS);
  }

  // 3. Build bounded user preferences & memory block (AI-3 Step 7)
  let memoryBlock = "";
  if (
    context.memory &&
    (context.memory.preferences.length > 0 || context.memory.conversationSummary)
  ) {
    const memLines: string[] = [];
    if (context.memory.conversationSummary) {
      memLines.push(`Previous topic: ${context.memory.conversationSummary}`);
    }
    for (const p of context.memory.preferences) {
      memLines.push(`${p.category} (${p.key}): ${p.value}`);
    }
    memoryBlock = `[USER PREFERENCES & CONTEXT]\nThese are user preferences provided by the application. They are NOT clinical truth. Do not infer diagnoses or clinical facts from them.\n- PRIORITY OVERRIDE: Current user request always overrides past preferences (e.g. if stored preference is "concise" but user asks for a detailed explanation, prioritize the detailed explanation).\n- Never mention internal memory mechanics or claim to remember things not provided.\n${memLines.join("\n")}`;
  }

  // 4. Build bounded conversation block (up to 12 messages, max 6000 chars)
  const companionDisplayName = context.companion?.name || "Emoty";
  const convoLines = context.conversation.recentMessages.map((m) => {
    const speaker = m.role === "assistant" ? companionDisplayName : "User";
    return `${speaker}: ${m.content}`;
  });
  const convoBlock = convoLines.length > 0
    ? `[RECENT CONVERSATION]\n${convoLines.join("\n")}`
    : `[RECENT CONVERSATION]\n(No previous conversation)`;

  // 5. Build current user message block
  const userBlock = `[CURRENT USER MESSAGE]\n${boundedUserMessage}`;

  // 6. Dynamic Context (max 9500 chars)
  const contextParts = [appContextBlock];
  if (memoryBlock) contextParts.push(memoryBlock);
  contextParts.push(convoBlock, userBlock);

  let dynamicContext = contextParts.join("\n\n");
  if (dynamicContext.length > MAX_DYNAMIC_CONTEXT_CHARS) {
    dynamicContext = dynamicContext.slice(dynamicContext.length - MAX_DYNAMIC_CONTEXT_CHARS);
  }

  // 7. Response Contract Specification
  const responseContractSection = `[RESPONSE CONTRACT]
CRITICAL REQUIREMENT:
You must output ONLY a valid raw JSON object matching this schema:
{
  "mode": "casual" | "emotional_support" | "guidance" | "app_assistance" | "out_of_scope",
  "response": "Conversational reply text (1 to 4 sentences).",
  "action": {
    "type": "none" | "open_emotion_map" | "show_today_goal" | "start_today_goal" | "start_breathing" | "start_grounding" | "start_jpmr" | "start_reframe" | "start_cbt" | "open_counsellor_request" | "show_check_in",
    "label": "optional short display label"
  },
  "avatarState": "idle" | "listening" | "thinking" | "calm" | "happy" | "sad" | "worried" | "angry" | "tired" | "breathing" | "encouraging" | "celebrating" | "supportive"
}`;

  const promptSections = [
    getEmotyIdentitySection(companionDisplayName),
    EMOTY_BEHAVIOR_SECTION,
    INTENT_AND_MODE_RULES_SECTION,
    OUT_OF_SCOPE_RULES_SECTION,
    CONVERSATIONAL_STYLE_SECTION,
    MULTITURN_DYNAMICS_SECTION,
    SAFETY_BOUNDARY_SECTION,
    ACTION_RECOMMENDATION_RULES_SECTION,
    quickAction ? `[QUICK ACTION GUIDANCE]\nUser selected quick action: ${quickAction}` : "",
    dynamicContext,
    responseContractSection,
  ].filter(Boolean);

  let totalPrompt = promptSections.join("\n\n");
  if (totalPrompt.length > MAX_TOTAL_PROMPT_CHARS) {
    totalPrompt = totalPrompt.slice(0, MAX_TOTAL_PROMPT_CHARS);
  }

  return {
    prompt: totalPrompt,
    dynamicContextChars: dynamicContext.length,
    totalChars: totalPrompt.length,
  };
}

// =========================================================================
// 3. SEMANTIC INTENT CLASSIFICATION REASONER
// =========================================================================

/**
 * Determines semantic conversational intent from message and context.
 * Strictly adheres to intent rules:
 * - Understands purpose over keywords
 * - Contextual exception: academic queries with distress -> emotional_support or guidance
 * - Same emotion ("tired") -> different mode depending on request for help
 * - Feature questions -> app_assistance
 * - Pure emotional expression -> emotional_support
 * - Greetings & small talk -> casual
 * - Unrelated trivia/coding/math -> out_of_scope
 */
export function determineSemanticIntent(
  message: string,
  context?: EmotyContext
): {
  mode: EmotyMode;
  recommendedAction: EmotyActionType;
  rationale: string;
} {
  const clean = (message || "").trim();
  const lower = clean.toLowerCase();

  // 0A. Conversation Ending / Goodbye Check
  if (isUserEndingConversation(clean)) {
    return {
      mode: "casual",
      recommendedAction: "none",
      rationale: "User is concluding the conversation.",
    };
  }

  // 0B. Boundary / Refusal Check ("no, I'm okay", "leave it")
  if (isUserDecliningOrSettingBoundary(clean)) {
    return {
      mode: "emotional_support",
      recommendedAction: "none",
      rationale: "User declined or set a boundary; respect boundary with zero intervention.",
    };
  }

  // 1. Check for Academic / Task queries with Emotional Context (Contextual Exception)
  const hasAcademicSubject =
    /\b(gravity|newton|physics|math|code|java|python|programming|exam|test|assignment|class|homework|algebra)\b/.test(
      lower
    );
  const hasEmotionalDistress =
    /\b(stress(ed|ing)?|anxious|anxiety|overwhelmed|worried|worry|terrified|scared|failing|panic|crying|sad|depressed|hard time)\b/.test(
      lower
    );
  const asksForHelp = /\b(what should i do|how do i|help me|can you help|what can i do|give me something)\b/.test(
    lower
  );

  if (hasAcademicSubject && hasEmotionalDistress) {
    if (asksForHelp) {
      return {
        mode: "guidance",
        recommendedAction: "none",
        rationale: "Academic topic accompanied by emotional distress and request for help is guidance.",
      };
    }
    return {
      mode: "emotional_support",
      recommendedAction: "none",
      rationale: "Academic topic accompanied by emotional distress is emotional_support, not out_of_scope.",
    };
  }

  // 2. Pure Out-of-Scope Queries (Trivia, Coding, Math, General Knowledge without distress)
  const isOutOfScopeQuery =
    /\b(who discovered|capital of|write me a|write a program|write a python|write code|write me code|algorithm in|explain quantum|solve this|what is \d+|\d+\s*[\+\-\*\/x]\s*\d+|quicksort|binary search|java program|python script)\b/.test(
      lower
    );
  if (isOutOfScopeQuery) {
    return {
      mode: "out_of_scope",
      recommendedAction: "none",
      rationale: "Unrelated trivia, math, or coding without personal or emotional relevance is out_of_scope.",
    };
  }

  // 3. App Assistance Queries
  const isAppQuestion =
    /\b(today'?s goal|breathing exercise|check my emotions|emotion map|how does this app work|where can i see|how do i use|how does emotify)\b/.test(
      lower
    );
  if (isAppQuestion) {
    let recommendedAction: EmotyActionType = "none";
    if (lower.includes("goal")) recommendedAction = "show_today_goal";
    else if (lower.includes("breathing")) recommendedAction = "start_breathing";
    else if (lower.includes("emotion")) recommendedAction = "open_emotion_map";

    return {
      mode: "app_assistance",
      recommendedAction,
      rationale: "User is asking about an Emotify feature or tool.",
    };
  }

  // 4. Guidance vs Emotional Support
  // Differentiate: "I'm tired" (emotional_support) vs "I'm tired. What should I do?" (guidance)
  if (asksForHelp || /\b(how can i calm|how do i calm|what can help|suggest something|advice)\b/.test(lower)) {
    let recommendedAction: EmotyActionType = "none";
    if (/\b(calm|breathing|breathe)\b/.test(lower)) {
      recommendedAction = "start_breathing";
    } else if (/\b(ground|grounding|senses)\b/.test(lower)) {
      recommendedAction = "start_grounding";
    } else if (/\b(cbt|reframe)\b/.test(lower)) {
      recommendedAction = "start_reframe";
    } else if (/\b(counsellor|counselor|talk to someone|human)\b/.test(lower)) {
      recommendedAction = "open_counsellor_request";
    }

    return {
      mode: "guidance",
      recommendedAction,
      rationale: "User is seeking practical direction, coping strategies, or asking what to do.",
    };
  }

  // 5. Emotional Support (Feelings, distress, loneliness without explicit guidance request)
  const isEmotionalExpression =
    hasEmotionalDistress ||
    /\b(feeling lonely|today was horrible|feel weird|tired|exhausted|rough day|terrible day|draining|sad|upset|hurts|struggling)\b/.test(
      lower
    );
  if (isEmotionalExpression) {
    // Pure emotional statement must NOT automatically trigger an action
    return {
      mode: "emotional_support",
      recommendedAction: "none",
      rationale: "User is expressing feelings or distress; emotional statement alone does NOT justify an intervention.",
    };
  }

  // 6. Casual Conversation (Greetings, light chat, thanks)
  return {
    mode: "casual",
    recommendedAction: "none",
    rationale: "Everyday conversation or greeting.",
  };
}

// =========================================================================
// 4. CONVERSATIONAL GUARDRAIL ENFORCEMENT
// =========================================================================

/**
 * Enforces conversational intelligence rules on candidate responses:
 * 1. Out-of-scope boundary: never answer trivia/math; enforce action: none.
 * 2. Maximum ONE follow-up question per response; never interrogate.
 * 3. Never claim an action has started or was executed.
 * 4. Pure emotional expressions never trigger automatic interventions.
 * 5. Action allowlist verification.
 */
export function enforceConversationalGuardrails(
  contract: EmotyResponseContract,
  userMessage: string,
  context?: EmotyContext
): EmotyResponseContract {
  let responseText = contract.response;
  let mode = contract.mode;
  let action = contract.action || { type: "none" };
  let avatarState = contract.avatarState;

  // Guardrail 1: Out-of-scope safety
  if (mode === "out_of_scope") {
    action = { type: "none" };
    // Verify response sets a boundary rather than answering the unrelated question
    const answersTriviaOrMath =
      /\b(\d+\s*[\+\-\*\/=]\s*\d+|\b\d{3,}\b|newton|galileo|paris|france|public static void|function\s*\(|def\s+)/i.test(
        responseText
      );
    if (answersTriviaOrMath || !responseText.toLowerCase().includes("outside my lane")) {
      responseText =
        "That's a little outside my lane! I'm mainly here to help with how you're feeling, your goals, and things you can work on in Emotify.";
    }
  }

  // Guardrail 2: Boundary & Refusal Enforcement (no questions or tool pressure on refusal)
  if (isUserDecliningOrSettingBoundary(userMessage)) {
    action = { type: "none" };
    if (responseText.includes("?")) {
      const parts = responseText.split("?");
      const beforeQ = parts[0].trim().replace(/[.,!?;:]+$/, "");
      responseText = beforeQ ? `${beforeQ}.` : "I completely understand. Take your time.";
    }
  }

  // Guardrail 2B: Conversation Closing Enforcement (no questions or tools on farewell)
  if (isUserEndingConversation(userMessage)) {
    mode = "casual";
    action = { type: "none" };
    if (responseText.includes("?")) {
      const parts = responseText.split("?");
      const beforeQ = parts[0].trim().replace(/[.,!?;:]+$/, "");
      responseText = beforeQ ? `${beforeQ}.` : "Take care! I'm here whenever you want to talk.";
    }
  }

  // Guardrail 2C: Maximum ONE follow-up question
  const questionMatches = responseText.match(/\?/g);
  if (questionMatches && questionMatches.length > 1) {
    // Keep only the first sentence containing a question mark, or trim subsequent questions
    const parts = responseText.split("?");
    // Reconstruct with first question, dropping subsequent questions
    responseText = `${parts[0]}?`;
  }

  // Guardrail 3: Recommendation is not execution (neutralize execution claims)
  const claimsExecution =
    /\b(i have started your|i've started your|i have started|i've started|i started your|your appointment is booked|your request has been submitted|navigating now|i opened)\b/i.test(
      responseText
    );
  if (claimsExecution) {
    responseText = responseText.replace(
      /\b(i have started your|i've started your|i started your)\b/gi,
      "You can start your"
    );
    responseText = responseText.replace(
      /\b(i have started|i've started)\b/gi,
      "You can start"
    );
    responseText = responseText.replace(
      /\b(your appointment is booked|your request has been submitted)\b/gi,
      "You can submit a counselor request whenever you are ready"
    );
  }

  // Guardrail 4: Pure emotional statements do NOT trigger an action or verbal tool pressure
  const cleanUserMsg = (userMessage || "").toLowerCase();
  const asksForTool =
    /\b(how do i|what should i do|can i try|start|help me with|open|exercise|technique|give me something)\b/.test(cleanUserMsg);
  const isPureEmotion =
    /\b(sad|lonely|tired|exhausted|terrible|horrible|bad day|depressed|unhappy)\b/.test(cleanUserMsg) &&
    !asksForTool;

  if (isPureEmotion) {
    if (action.type !== "none") {
      action = { type: "none" };
    }
    // Neutralize verbal tool forcing
    responseText = responseText.replace(
      /\b(you should (do|try|start)|let'?s (do|try|start)|i recommend (doing|trying|starting))\s+(a|the)?\s*(breathing|grounding|jpmr|cbt|relaxation)\s*(exercise|session|technique|tool)?\b/gi,
      "take it easy right now"
    );
  }

  // Guardrail 5: Ensure action type is in allowlist
  if (!EMOTY_ACTION_TYPES.includes(action.type)) {
    action = { type: "none" };
  }

  // Guardrail 6: Ensure avatar state is in allowlist
  if (!EMOTY_AVATAR_STATES.includes(avatarState)) {
    avatarState = "idle";
  }

  return {
    mode,
    response: responseText,
    action,
    avatarState,
  };
}
