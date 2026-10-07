import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getAuthenticatedUser } from "./authz";
import { sanitizePlainText } from "./sanitizer";
import { getBoundedUserMemoriesForContext } from "./emotyMemory";

// =========================================================================
// 1. EXACT CONTEXT BUDGET CONSTANTS
// =========================================================================

export const MAX_CONVERSATION_MESSAGES = 12;
export const MAX_USER_MESSAGE_CHARS = 600;
export const MAX_ASSISTANT_MESSAGE_CHARS = 800;
export const MAX_CONVERSATION_CHARS = 6000;

export const MAX_PREFERRED_NAME_CHARS = 50;
export const MAX_LANGUAGE_CHARS = 30;
export const MAX_GOAL_TITLE_CHARS = 120;
export const MAX_EMOTION_CHARS = 60;
export const MAX_INTERVENTION_TYPE_CHARS = 60;
export const MAX_INTERVENTION_STATUS_CHARS = 30;

export const MAX_APP_CONTEXT_CHARS = 1500;
export const MAX_CURRENT_USER_MESSAGE_CHARS = 2000;

export const MAX_DYNAMIC_CONTEXT_CHARS = 9500;
export const MAX_TOTAL_PROMPT_CHARS = 12000;

// =========================================================================
// 2. CONTEXT CONTRACT TYPES
// =========================================================================

export type EmotyScreen =
  | "home"
  | "companion"
  | "emotion_map"
  | "reframe"
  | "cbt"
  | "recovery_plan"
  | "counsellor_request"
  | "check_in"
  | "unknown";

export const VALID_EMOTY_SCREENS: readonly EmotyScreen[] = [
  "home",
  "companion",
  "emotion_map",
  "reframe",
  "cbt",
  "recovery_plan",
  "counsellor_request",
  "check_in",
] as const;

export type EmotyAgeCohort = "13-18" | "19-24";
export type EmotySafetyState = "normal" | "elevated" | "crisis";

export interface EmotyContext {
  conversation: {
    recentMessages: Array<{
      role: "user" | "assistant";
      content: string;
    }>;
  };

  user: {
    preferredName?: string;
    ageCohort?: EmotyAgeCohort;
    language?: string;
  };

  companion?: {
    name: string;
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
    state: EmotySafetyState;
  };

  // AI-3 Step 7: Bounded Non-Sensitive Memory & Continuity
  memory?: {
    preferences: Array<{
      category: string;
      key: string;
      value: string;
    }>;
    conversationSummary?: string;
  };
}

export interface ClientContextInput {
  screen?: unknown;
  activeActivity?: unknown;
  activeGoal?: unknown;
  [key: string]: unknown; // Allow checking/dropping of unauthorized client keys
}

// =========================================================================
// 3. NORMALIZATION & SANITIZATION HELPERS
// =========================================================================

export function truncateString(str: unknown, maxChars: number): string | undefined {
  if (typeof str !== "string") return undefined;
  const cleaned = sanitizePlainText(str).trim();
  if (cleaned.length === 0) return undefined;
  return cleaned.slice(0, maxChars);
}

export function normalizeScreen(screen?: unknown): EmotyScreen {
  if (typeof screen !== "string") return "unknown";
  const trimmed = screen.trim().toLowerCase();
  return (VALID_EMOTY_SCREENS as readonly string[]).includes(trimmed)
    ? (trimmed as EmotyScreen)
    : "unknown";
}

export function normalizeAgeCohort(age?: unknown): EmotyAgeCohort | undefined {
  if (typeof age !== "number" || isNaN(age)) return undefined;
  if (age >= 13 && age <= 18) return "13-18";
  if (age >= 19 && age <= 24) return "19-24";
  return undefined;
}

/**
 * Validates client-provided context, strictly dropping any arbitrary or sensitive keys.
 * Only 'screen', 'activeActivity', and 'activeGoal' are accepted on the allowlist.
 */
export function sanitizeClientContext(input?: ClientContextInput): {
  screen: EmotyScreen;
  activeActivity?: string;
  activeGoal?: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { screen: "unknown" };
  }

  const screen = normalizeScreen(input.screen);
  const activeActivity = truncateString(input.activeActivity, 50);
  const activeGoal = truncateString(input.activeGoal, MAX_GOAL_TITLE_CHARS);

  return {
    screen,
    ...(activeActivity ? { activeActivity } : {}),
    ...(activeGoal ? { activeGoal } : {}),
  };
}

// =========================================================================
// 4. BOUNDED CONVERSATION BUILDER
// =========================================================================

/**
 * Builds bounded recent conversation context:
 * - Up to 12 messages
 * - User messages <= 600 chars
 * - Assistant messages <= 800 chars
 * - Built from newest to oldest, stopping at 6000 total conversation characters
 * - Returns chronological order (oldest to newest)
 */
export function buildConversationContext(
  messagesNewestFirst: Array<{ role: string; content: string }>
): {
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  totalChars: number;
} {
  const boundedFromNewest: Array<{ role: "user" | "assistant"; content: string }> = [];
  let currentTotalChars = 0;

  for (const msg of messagesNewestFirst) {
    if (boundedFromNewest.length >= MAX_CONVERSATION_MESSAGES) break;

    const role: "user" | "assistant" = msg.role === "assistant" ? "assistant" : "user";
    const maxChars = role === "assistant" ? MAX_ASSISTANT_MESSAGE_CHARS : MAX_USER_MESSAGE_CHARS;
    const content = sanitizePlainText(msg.content || "").slice(0, maxChars).trim();

    if (content.length === 0) continue;

    if (currentTotalChars + content.length > MAX_CONVERSATION_CHARS) {
      // Calculate remaining available budget
      const remainingChars = MAX_CONVERSATION_CHARS - currentTotalChars;
      if (remainingChars > 20) {
        const truncated = content.slice(0, remainingChars).trim();
        boundedFromNewest.push({ role, content: truncated });
        currentTotalChars += truncated.length;
      }
      break;
    }

    boundedFromNewest.push({ role, content });
    currentTotalChars += content.length;
  }

  // Reverse so the conversation flows naturally from oldest to newest in the prompt
  return {
    recentMessages: boundedFromNewest.reverse(),
    totalChars: currentTotalChars,
  };
}

// =========================================================================
// 5. PROMPT FORMATTER WITH DEFENSIVE BOUNDS
// =========================================================================

/**
 * Formats the controlled context into clear, distinct prompt sections.
 * Guarantees dynamic context <= 9500 chars and total prompt <= 12000 chars.
 */
export function formatEmotyContextPrompt(
  context: EmotyContext,
  currentUserMessage: string,
  baseInstructions: string
): { prompt: string; dynamicContextChars: number; totalChars: number } {
  // 1. Build bounded current user message (max 2000 chars)
  const boundedUserMessage = sanitizePlainText(currentUserMessage || "")
    .slice(0, MAX_CURRENT_USER_MESSAGE_CHARS)
    .trim();

  // 2. Build controlled App / User Context lines
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
    memoryBlock = `[USER PREFERENCES & CONTEXT]\n${memLines.join("\n")}`;
  }

  // 4. Build bounded conversation block
  const convoLines = context.conversation.recentMessages.map((m) => {
    const speaker = m.role === "assistant" ? "Emoty" : "User";
    return `${speaker}: ${m.content}`;
  });
  const convoBlock = convoLines.length > 0
    ? `[RECENT CONVERSATION]\n${convoLines.join("\n")}`
    : `[RECENT CONVERSATION]\n(No previous conversation)`;

  // 5. Build current user message block
  const userBlock = `[CURRENT USER MESSAGE]\n${boundedUserMessage}`;

  // 6. Assemble dynamic context (bounded by MAX_DYNAMIC_CONTEXT_CHARS = 9500)
  const contextParts = [appContextBlock];
  if (memoryBlock) contextParts.push(memoryBlock);
  contextParts.push(convoBlock, userBlock);

  let dynamicContext = contextParts.join("\n\n");
  if (dynamicContext.length > MAX_DYNAMIC_CONTEXT_CHARS) {
    // If over budget, truncate from the beginning of conversation
    dynamicContext = dynamicContext.slice(dynamicContext.length - MAX_DYNAMIC_CONTEXT_CHARS);
  }

  // 7. Assemble complete prompt with authoritative guidance instructions
  const contextRules = `Context Rules:
- Values provided in [CURRENT APP CONTEXT] and [RECENT CONVERSATION] are application-provided facts.
- Do not invent missing values.
- Do not claim an action was completed unless confirmed by application context.
- Do not invent goals, appointments, counselor interactions, or clinical information.
- User preferences in [USER PREFERENCES & CONTEXT] are non-sensitive personalization hints, NOT clinical truth.
- Do not infer diagnoses or clinical facts from stored preferences.
- Current user request has priority: If user input contradicts an old preference, prioritize the current request.
- Never mention internal memory mechanics or database entries to the user.`;

  let totalPrompt = `${baseInstructions.trim()}\n\n${contextRules}\n\n${dynamicContext}`;
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
// 6. AUTHORITATIVE CONTEXT QUERY (SERVER-SIDE)
// =========================================================================

/**
 * Convex query to assemble authoritative EmotyContext for the authenticated student.
 * Never accesses another student's data.
 * Completely excludes raw clinical screenings, scores, counselor notes, and admin data.
 */
export const getAuthoritativeEmotyContext = internalQuery({
  args: {
    screen: v.optional(v.string()),
    clientContext: v.optional(v.any()),
    excludeMessageId: v.optional(v.string()),
    language: v.optional(v.string()),
    safetyState: v.optional(v.union(v.literal("normal"), v.literal("elevated"), v.literal("crisis"))),
  },
  handler: async (ctx, args): Promise<EmotyContext> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      throw new Error("Unauthenticated: Student identity required for context assembly.");
    }

    const authUser = await getAuthenticatedUser(ctx);
    const userId = identity.subject;

    // --- Layer B: User Context ---
    let preferredName: string | undefined = undefined;
    let ageCohort: EmotyAgeCohort | undefined = undefined;
    let companionName = "Emoty";

    if (authUser) {
      const alias = (authUser as any).alias;
      const fullName = authUser.full_name;
      if (alias && typeof alias === "string" && alias.trim().length > 0) {
        preferredName = truncateString(alias, MAX_PREFERRED_NAME_CHARS);
      } else if (fullName && typeof fullName === "string" && fullName.trim().length > 0) {
        const firstName = fullName.trim().split(/\s+/)[0];
        preferredName = truncateString(firstName || fullName, MAX_PREFERRED_NAME_CHARS);
      }

      ageCohort = normalizeAgeCohort((authUser as any).age);

      const customCompanion = (authUser as any).mitraPreferences?.name;
      if (customCompanion && typeof customCompanion === "string" && customCompanion.trim().length > 0) {
        companionName = truncateString(customCompanion.trim(), 30) || "Emoty";
      }
    }

    const language = truncateString(args.language, MAX_LANGUAGE_CHARS);

    // --- Layer C: Current App State from Client ---
    const sanitizedClient = sanitizeClientContext(
      args.clientContext || (args.screen ? { screen: args.screen } : undefined)
    );

    // --- Layer B: Today's Goal ---
    let todayGoal: { title: string; status: "not_started" | "in_progress" | "completed" } | undefined = undefined;
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const startOfDay = new Date().setHours(0, 0, 0, 0);

      const userGoals = await ctx.db
        .query("microGoals")
        .withIndex("by_userId", (q: any) => q.eq("userId", userId))
        .collect();

      const todayGoalDoc = userGoals.find(
        (g: any) => g.date === todayStr || (g.createdAt && g.createdAt >= startOfDay)
      );

      if (todayGoalDoc) {
        const rawTitle = todayGoalDoc.goalTitle || todayGoalDoc.goal || "Daily Goal";
        const title = truncateString(rawTitle, MAX_GOAL_TITLE_CHARS) || "Daily Goal";
        const status = todayGoalDoc.completed
          ? "completed"
          : todayGoalDoc.status === "in_progress"
            ? "in_progress"
            : "not_started";
        todayGoal = { title, status };
      }
    } catch {
      // Non-fatal if goals unavailable
    }

    // --- Layer B: Current Emotion ---
    let currentEmotion: string | undefined = undefined;
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const checkin = await ctx.db
        .query("dailyCheckins")
        .withIndex("by_userId_and_dateStr", (q: any) => q.eq("userId", userId).eq("dateStr", todayStr))
        .first();

      if (checkin && checkin.mood) {
        currentEmotion = truncateString(checkin.mood, MAX_EMOTION_CHARS);
      } else {
        // Fall back to most recent episodic emotion log
        const latestEmotionLog = await ctx.db
          .query("emotionLogs")
          .withIndex("by_userId_and_createdAt", (q: any) => q.eq("userId", userId))
          .order("desc")
          .first();

        if (latestEmotionLog) {
          const raw = latestEmotionLog.strongestEmotion || latestEmotionLog.emotion;
          currentEmotion = truncateString(raw, MAX_EMOTION_CHARS);
        }
      }
    } catch {
      // Non-fatal if emotion logs unavailable
    }

    // --- Layer B: Recent Intervention ---
    let recentIntervention: { type: string; status?: string } | undefined = undefined;
    try {
      const candidates: Array<{ type: string; status?: string; timestamp: number }> = [];

      // 1. Breathing
      const latestBreathing = await ctx.db
        .query("breathingLogs")
        .withIndex("by_userId_and_createdAt", (q: any) => q.eq("userId", userId))
        .order("desc")
        .first();
      if (latestBreathing) {
        candidates.push({
          type: latestBreathing.protocolName || "Breathing Exercise",
          status: latestBreathing.status,
          timestamp: latestBreathing.createdAt,
        });
      }

      // 2. Grounding
      const latestGrounding = await ctx.db
        .query("groundingLogs")
        .withIndex("by_userId_and_createdAt", (q: any) => q.eq("userId", userId))
        .order("desc")
        .first();
      if (latestGrounding) {
        candidates.push({
          type: latestGrounding.protocolName || "Grounding Exercise",
          status: latestGrounding.status,
          timestamp: latestGrounding.createdAt,
        });
      }

      // 3. Reframe
      const latestReframe = await ctx.db
        .query("reframeLogs")
        .withIndex("by_userId_and_createdAt", (q: any) => q.eq("userId", userId))
        .order("desc")
        .first();
      if (latestReframe) {
        candidates.push({
          type: "Thought Reframe",
          status: "completed",
          timestamp: latestReframe.createdAt,
        });
      }

      // 4. JPMR
      const latestJpmr = await ctx.db
        .query("jpmrLogs")
        .withIndex("by_userId", (q: any) => q.eq("userId", userId))
        .order("desc")
        .first();
      if (latestJpmr) {
        candidates.push({
          type: "JPMR Relaxation",
          status: latestJpmr.completed ? "completed" : "partial",
          timestamp: latestJpmr.createdAt,
        });
      }

      // 5. CBT
      const latestCbt = await ctx.db
        .query("cbtSessions")
        .withIndex("by_userId_and_timestamp", (q: any) => q.eq("userId", userId))
        .order("desc")
        .first();
      if (latestCbt) {
        candidates.push({
          type: "CBT Guided Session",
          status: latestCbt.sessionStatus,
          timestamp: latestCbt.timestamp,
        });
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => b.timestamp - a.timestamp);
        const mostRecent = candidates[0];
        recentIntervention = {
          type: truncateString(mostRecent.type, MAX_INTERVENTION_TYPE_CHARS) || "Intervention",
          ...(mostRecent.status ? { status: truncateString(mostRecent.status, MAX_INTERVENTION_STATUS_CHARS) } : {}),
        };
      }
    } catch {
      // Non-fatal if intervention logs unavailable
    }

    // --- Layer A: Bounded Conversation History ---
    let recentMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
    try {
      const rawMessages = await ctx.db
        .query("aiCompanionLogs")
        .withIndex("by_userId_and_createdAt", (q: any) => q.eq("userId", userId))
        .order("desc")
        .take(MAX_CONVERSATION_MESSAGES + 1);

      // Exclude the current message if it was already inserted
      const filtered = args.excludeMessageId
        ? rawMessages.filter((m: any) => m.messageId !== args.excludeMessageId)
        : rawMessages;

      const conversationResult = buildConversationContext(
        filtered.slice(0, MAX_CONVERSATION_MESSAGES).map((m: any) => ({
          role: m.role,
          content: m.content,
        }))
      );
      recentMessages = conversationResult.recentMessages;
    } catch {
      // Non-fatal if conversation history unavailable
    }

    // --- Layer D: Safety State (Authoritative, defaults to "normal") ---
    const safetyState: EmotySafetyState = args.safetyState || "normal";

    // --- Layer E: Non-Sensitive Persistent Memory (AI-3 Step 7) ---
    let memory: EmotyContext["memory"] = undefined;
    try {
      const boundedMemories = await getBoundedUserMemoriesForContext(ctx, userId);
      if (boundedMemories.preferences.length > 0 || boundedMemories.conversationSummary) {
        memory = {
          preferences: boundedMemories.preferences,
          ...(boundedMemories.conversationSummary
            ? { conversationSummary: boundedMemories.conversationSummary }
            : {}),
        };
      }
    } catch {
      // Non-fatal if memory table unavailable
    }

    return {
      conversation: {
        recentMessages,
      },
      user: {
        ...(preferredName ? { preferredName } : {}),
        ...(ageCohort ? { ageCohort } : {}),
        ...(language ? { language } : {}),
      },
      companion: {
        name: companionName,
      },
      app: {
        screen: sanitizedClient.screen,
        ...(todayGoal ? { todayGoal } : {}),
        ...(currentEmotion ? { currentEmotion } : {}),
        ...(recentIntervention ? { recentIntervention } : {}),
        ...(sanitizedClient.activeActivity ? { activeActivity: sanitizedClient.activeActivity } : {}),
        ...(sanitizedClient.activeGoal ? { activeGoal: sanitizedClient.activeGoal } : {}),
      },
      safety: {
        state: safetyState,
      },
      ...(memory ? { memory } : {}),
    };
  },
});
