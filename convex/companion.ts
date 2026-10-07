import { v, ConvexError } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  getQuickActionFallback,
  getQuickActionModelGuidance,
  type CompanionQuickAction,
} from "./companionQuickActions";
import {
  validateEmotyResponse,
  getSafeStructuredFallback,
  extractJsonFromModelText,
  getGeminiModels,
  type EmotyResponseContract,
} from "./emotyContract";
import {
  formatEmotyContextPrompt,
  type EmotyContext,
} from "./emotyContext";
import {
  buildModularEmotyPrompt,
  enforceConversationalGuardrails,
} from "./emotyIntent";
import {
  classifyServerSafety,
  getControlledCrisisResponse,
  getControlledThirdPartyResponse,
} from "./emotySafety";
import { sanitizePlainText } from "./sanitizer";
import { validateAndResolveAction } from "./emotyActionRouter";
import { resolveAvatarPresentationState } from "./emotyAvatar";
import { detectMemoryCandidate } from "./emotyMemory";
import { buildStructuredFallbackResponse } from "./emotyFallback";

function sanitizeInput(input: string): string {
  // Limit length to 1000 characters
  let sanitized = input.slice(0, 1000);
  // Strip HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, "");
  // Remove simple injection patterns (quotes, escape chars)
  sanitized = sanitized.replace(/['"\\]/g, "");
  return sanitized.trim();
}

function sanitizeOutput(output: string): string {
  const lower = output.toLowerCase();
  // Detect potential system instruction leakage attempts
  if (
    lower.includes("systeminstruction") ||
    lower.includes("system instruction") ||
    lower.includes("you are a caring ai companion") ||
    lower.includes("you are emoty") ||
    lower.includes("critical: keep your responses") ||
    lower.includes("critical requirement:") ||
    lower.includes("system prompt")
  ) {
    return "I am here as your companion to support you. Let me know how I can help!";
  }
  return sanitizePlainText(output);
}


/** Get full conversation history for the authenticated patient */
export const getConversationHistory = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject;

    // Fetch from aiCompanionLogs table
    const aiLogs = await ctx.db
      .query("aiCompanionLogs")
      .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
      .order("asc")
      .collect();

    if (aiLogs.length > 0) {
      return aiLogs;
    }

    // Fallback/backward compatibility with companionMessages table
    const companionMsgs = await ctx.db
      .query("companionMessages")
      .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
      .order("asc")
      .collect();

    return companionMsgs.map((m) => ({ ...m, _id: m._id as any }));
  },
});

/** Fetch latest messages for context window (for Gemini action) */
export const getLatestMessages = query({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject;

    const aiLogs = await ctx.db
      .query("aiCompanionLogs")
      .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(args.limit);

    if (aiLogs.length > 0) {
      return aiLogs;
    }

    const companionMsgs = await ctx.db
      .query("companionMessages")
      .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(args.limit);

    return companionMsgs.map((m) => ({ ...m, _id: m._id as any }));
  },
});

/** Save a message (user or assistant) in Convex aiCompanionLogs and companionMessages */
export const createMessage = mutation({
  args: {
    messageId: v.string(),
    role: v.string(), // "user" | "assistant"
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;
    const createdAt = Date.now();

    // Insert into authoritative aiCompanionLogs table ONLY
    // Legacy companionMessages mirror is deprecated: writes are discontinued to prevent duplication
    const id = await ctx.db.insert("aiCompanionLogs", {
      messageId: args.messageId,
      userId,
      role: args.role,
      content: args.content,
      createdAt,
    });

    return id;
  },
});

/** Log a companion message with strict session ownership enforcement (remediates EMOT-SEC-11) */
export const logMessage = mutation({
  args: {
    messageId: v.optional(v.string()),
    userId: v.optional(v.string()),
    role: v.string(), // "user" | "assistant"
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      throw new Error("Unauthenticated: Valid session required to log companion messages.");
    }
    const callerId = identity.subject;

    // Caller cannot inject message into another student's conversation
    if (args.userId && args.userId !== callerId) {
      throw new Error("Unauthorized: Cannot inject messages into another user's chat log.");
    }

    // Inspect caller role: Counselors and Admins cannot inject messages into companion chat
    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", callerId))
      .first();

    let userRole = caller?.role;
    if (!userRole) {
      try {
        const u = await ctx.db.get(callerId as Id<"users">);
        if (u) userRole = u.role;
      } catch (e) { }
    }

    if (userRole === "counsellor" || userRole === "admin") {
      throw new Error("Unauthorized: Staff members cannot inject messages into student AI companion chat.");
    }

    const messageId = args.messageId || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const createdAt = Date.now();

    return await ctx.db.insert("aiCompanionLogs", {
      messageId,
      userId: callerId,
      role: args.role,
      content: args.content,
      createdAt,
    });
  },
});

/** Aliases for compatibility */
export const getMessages = getConversationHistory;

/** Delete all conversation history for the authenticated patient */
export const clearConversation = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const aiLogs = await ctx.db
      .query("aiCompanionLogs")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    for (const msg of aiLogs) {
      await ctx.db.delete(msg._id);
    }

    const companionMsgs = await ctx.db
      .query("companionMessages")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    for (const msg of companionMsgs) {
      await ctx.db.delete(msg._id);
    }

    return { success: true };
  },
});

export const clearHistory = clearConversation;

/** Count messages sent by this user today */
export const getTodayMessageCount = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;
    const userId = identity.subject;

    // Get timestamp for start of today in local system time
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startTimestamp = startOfToday.getTime();

    // Query messages sent by this user today from aiCompanionLogs
    let todayMessages = await ctx.db
      .query("aiCompanionLogs")
      .withIndex("by_userId_and_createdAt", (q) =>
        q.eq("userId", userId).gte("createdAt", startTimestamp)
      )
      .collect();

    if (todayMessages.length === 0) {
      const fallback = await ctx.db
        .query("companionMessages")
        .withIndex("by_userId_and_createdAt", (q) =>
          q.eq("userId", userId).gte("createdAt", startTimestamp)
        )
        .collect();
      todayMessages = fallback.map((m) => ({ ...m, _id: m._id as any }));
    }

    // Filter only messages sent by user ("user" role)
    const userMessagesCount = todayMessages.filter((msg) => msg.role === "user").length;
    return userMessagesCount;
  },
});

async function fetchGeminiWithFallback(
  apiKeys: string | string[],
  payload: any,
  timeoutMs = 12000
): Promise<{ json: any; model: string }> {
  const keys = (Array.isArray(apiKeys) ? apiKeys : [apiKeys]).filter((k): k is string => Boolean(k) && typeof k === "string");
  const models = getGeminiModels();
  let lastError: any = null;

  for (const apiKey of keys) {
    let keyFailedWithRateLimitOrAuth = false;
    for (const model of models) {
      if (keyFailedWithRateLimitOrAuth) break;

      for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (response.ok) {
            const json = await response.json();
            return { json, model };
          }

          const status = response.status;
          lastError = new Error(`Gemini API HTTP ${status} on ${model}`);
          if (status === 401 || status === 403 || status === 429) {
            console.warn(`Gemini API key hit rate limit/auth error (HTTP ${status}). Trying next key/fallback...`);
            keyFailedWithRateLimitOrAuth = true;
            break;
          } else if (status === 503 || status >= 500) {
            console.warn(`Gemini API ${model} returned HTTP ${status} (attempt ${attempt + 1}). Retrying...`);
            await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
            continue;
          } else {
            break; // Move to next model if 404
          }
        } catch (err: any) {
          clearTimeout(timeoutId);
          lastError = err;
          const isAbort = err.name === "AbortError" || err.message === "AbortError" || err.message?.includes("abort");
          if (isAbort) {
            console.warn(`Gemini API call timed out after ${timeoutMs}ms for model ${model}. Trying next model...`);
            break; // Don't retry on timeout — move to next model immediately
          } else {
            console.warn(`Gemini API call network error for model ${model}:`, err?.message || err);
            await new Promise((resolve) => setTimeout(resolve, 400));
          }
        }
      }
    }
  }

  throw lastError || new Error("All Gemini API keys and models failed");
}

/** Generate AI Response using Gemini API and save the response */
export const generateAIResponse = action({
  args: {
    userMessageId: v.string(),
    aiMessageId: v.string(),
    content: v.string(),
    screen: v.optional(v.string()),
    clientContext: v.optional(v.any()),
    quickAction: v.optional(v.union(
      v.literal("continue_conversation"),
      v.literal("breathing_support"),
      v.literal("reflection"),
      v.literal("gratitude"),
    )),
    language: v.optional(v.union(v.literal("en"), v.literal("hi"), v.literal("ta"), v.literal("te"))),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Unauthenticated");

    // Sanitize client input
    const sanitizedInputContent = sanitizeInput(args.content);

    // 1. Save user message first (immediate visual feedback on query)
    await ctx.runMutation(api.companion.createMessage, {
      messageId: args.userMessageId,
      role: "user",
      content: sanitizedInputContent,
    });

    // 2. SERVER SAFETY GATE: Authoritative deterministic check
    // CRITICAL SAFETY INVARIANT: Safety evaluation MUST run BEFORE rate-limit rejection.
    // An urgent crisis disclosure must NEVER be dropped or blocked by a rate limit.
    const safetyResult = classifyServerSafety(sanitizedInputContent);

    // CRISIS PATH: Explicit self-directed crisis -> MUST NOT call Gemini
    if (safetyResult.state === "crisis" && safetyResult.isSelfCrisis) {
      // Trigger deduplicated safety alert for counselors
      await ctx.runMutation(api.alerts.createSafetyAlertWithDeduplication, {
        type: "suicideRisk",
      });

      // Controlled safety response
      const crisisContract = getControlledCrisisResponse();
      const actionValidation = validateAndResolveAction(crisisContract.action, "crisis");
      crisisContract.action = actionValidation.valid ? actionValidation.action : { type: "none" };

      await ctx.runMutation(api.companion.createMessage, {
        messageId: args.aiMessageId,
        role: "assistant",
        content: crisisContract.response,
      });

      // Record safe telemetry
      try {
        await ctx.runMutation(api.emotyTelemetry.recordTelemetry, {
          durationMs: Date.now() - startTime,
          path: "crisis",
          mode: crisisContract.mode,
          actionType: crisisContract.action.type,
          avatarState: crisisContract.avatarState,
          safetyCategory: safetyResult.category,
          geminiCalled: false,
          geminiSuccess: false,
          fallbackUsed: false,
        });
      } catch (tErr) {
        console.warn("Safety telemetry write error:", tErr);
      }

      return crisisContract;
    }

    // THIRD-PARTY CONCERN PATH: Student reports friend in crisis -> Controlled supportive guidance
    if (safetyResult.category === "third_party") {
      const thirdPartyContract = getControlledThirdPartyResponse();
      await ctx.runMutation(api.companion.createMessage, {
        messageId: args.aiMessageId,
        role: "assistant",
        content: thirdPartyContract.response,
      });

      // Record safe telemetry
      try {
        await ctx.runMutation(api.emotyTelemetry.recordTelemetry, {
          durationMs: Date.now() - startTime,
          path: "third_party",
          mode: thirdPartyContract.mode,
          actionType: thirdPartyContract.action.type,
          avatarState: thirdPartyContract.avatarState,
          safetyCategory: safetyResult.category,
          geminiCalled: false,
          geminiSuccess: false,
          fallbackUsed: false,
        });
      } catch (tErr) {
        console.warn("Third-party telemetry write error:", tErr);
      }

      return thirdPartyContract;
    }

    // 3. SERVER-AUTHORITATIVE RATE LIMITING (Burst, Daily, Concurrency)
    // Non-crisis AI generation is strictly gated to protect student wellbeing and prevent abuse.
    const rateCheck = await ctx.runMutation(api.emotyRateLimiter.checkAndAcquireRateLimit);
    if (!rateCheck.allowed) {
      try {
        await ctx.runMutation(api.emotyTelemetry.recordTelemetry, {
          durationMs: Date.now() - startTime,
          path: "rate_limited",
          mode: "guidance",
          actionType: "none",
          avatarState: "calm",
          safetyCategory: safetyResult.category,
          geminiCalled: false,
          geminiSuccess: false,
          fallbackUsed: true,
          fallbackReason: "RATE_LIMITED",
          errorCode: rateCheck.reason,
        });
      } catch (tErr) {
        console.warn("Rate-limit telemetry write error:", tErr);
      }

      throw new ConvexError(rateCheck.message || "Rate limit exceeded. Please chat again shortly.");
    }

    try {
      // Deterministic non-sensitive memory candidate detection from user input (AI-3 Step 7)
      const memoryCandidate = detectMemoryCandidate(sanitizedInputContent);
      if (memoryCandidate) {
        try {
          await ctx.runMutation(api.emotyMemory.recordUserPreference, {
            category: memoryCandidate.category,
            key: memoryCandidate.key,
            value: memoryCandidate.value,
            source: memoryCandidate.source,
          });
        } catch (memErr) {
          console.warn("Memory candidate storage rejected by policy:", memErr);
        }
      }

      // Fetch authoritative, bounded Emoty context with server-derived safety state
      const emotyContext: EmotyContext = await ctx.runQuery(api.emotyContext.getAuthoritativeEmotyContext, {
        screen: args.screen,
        clientContext: args.clientContext,
        excludeMessageId: args.userMessageId,
        language: args.language,
        safetyState: safetyResult.state,
      });

      // Retrieve Gemini API Key from DB (apiKeys table) & Environment Variable
      const dbKey = await ctx.runQuery(internal.cbt.getActiveApiKeyInternal);
      const envKey = process.env.GEMINI_API_KEY || null;
      const apiKeys = Array.from(new Set([dbKey, envKey].filter(Boolean) as string[]));

      if (apiKeys.length === 0) {
        console.warn("No GEMINI_API_KEY found in DB or env. Falling back to multi-turn safe structured fallback.");
        const fallbackContract = buildStructuredFallbackResponse({
          userMessage: sanitizedInputContent,
          context: emotyContext,
          quickAction: args.quickAction,
          language: args.language,
        });
        await ctx.runMutation(api.companion.createMessage, {
          messageId: args.aiMessageId,
          role: "assistant",
          content: fallbackContract.response,
        });

        try {
          await ctx.runMutation(api.emotyTelemetry.recordTelemetry, {
            durationMs: Date.now() - startTime,
            path: "fallback",
            mode: fallbackContract.mode,
            actionType: fallbackContract.action.type,
            avatarState: fallbackContract.avatarState,
            safetyCategory: safetyResult.category,
            geminiCalled: false,
            geminiSuccess: false,
            fallbackUsed: true,
            fallbackReason: "NO_API_KEY",
          });
        } catch (tErr) {
          console.warn("Telemetry write error:", tErr);
        }

        return fallbackContract;
      }

      const { prompt: fullPrompt } = buildModularEmotyPrompt({
        context: emotyContext,
        currentUserMessage: sanitizedInputContent,
        quickAction: args.quickAction,
      });

      const geminiContents = [
        {
          role: "user",
          parts: [{ text: fullPrompt }],
        },
      ];

      try {
        // Send query to Gemini API with fallback & retry requesting structured JSON
        const res = await fetchGeminiWithFallback(
          apiKeys,
          {
            contents: geminiContents,
            generationConfig: {
              responseMimeType: "application/json",
              maxOutputTokens: 2048,
            },
          },
          12000
        );

        const generatedRawText = res.json?.candidates?.[0]?.content?.parts?.[0]?.text;

        let contract: EmotyResponseContract;
        let isContractInvalid = false;
        let isParseError = false;

        try {
          const parsed = extractJsonFromModelText(generatedRawText);
          const validation = validateEmotyResponse(parsed);
          if (validation.success) {
            contract = validation.data;
          } else if (
            parsed &&
            typeof parsed === "object" &&
            typeof (parsed as any).response === "string" &&
            (parsed as any).response.trim().length > 0
          ) {
            contract = {
              mode: "emotional_support",
              response: (parsed as any).response.trim(),
              action: { type: "none" },
              avatarState: "supportive",
            };
          } else {
            console.warn("Emoty response contract validation failed:", validation.error);
            isContractInvalid = true;
            contract = getSafeStructuredFallback();
          }
        } catch (parseErr: any) {
          console.warn("Emoty response JSON parsing failed:", parseErr?.message || parseErr);
          if (generatedRawText && typeof generatedRawText === "string" && generatedRawText.trim().length > 10) {
            contract = {
              mode: "emotional_support",
              response: sanitizeOutput(generatedRawText),
              action: { type: "none" },
              avatarState: "supportive",
            };
          } else {
            isParseError = true;
            contract = getSafeStructuredFallback();
          }
        }

        // Apply Conversational Guardrails (out-of-scope boundaries, question count, action sanity)
        contract = enforceConversationalGuardrails(contract, sanitizedInputContent, emotyContext);

        // Action Router validation - ensure action is strictly allowlisted
        const actionValidation = validateAndResolveAction(contract.action, safetyResult.state);
        if (actionValidation.valid) {
          contract.action = actionValidation.action;
        } else {
          console.warn("Emoty action rejected by Action Router:", actionValidation.rejectionReason);
          contract.action = actionValidation.fallbackAction;
        }

        // Avatar presentation state normalization
        contract.avatarState = resolveAvatarPresentationState({
          safetyState: safetyResult.state,
          mode: contract.mode,
          action: contract.action,
          explicitAvatarState: contract.avatarState,
          defaultState: "calm",
        });

        // Clean and sanitize the response text
        contract.response = sanitizeOutput(contract.response);

        // Save assistant response in Convex (aiCompanionLogs)
        await ctx.runMutation(api.companion.createMessage, {
          messageId: args.aiMessageId,
          role: "assistant",
          content: contract.response,
        });

        // Record privacy-safe telemetry
        try {
          await ctx.runMutation(api.emotyTelemetry.recordTelemetry, {
            durationMs: Date.now() - startTime,
            path: isContractInvalid || isParseError ? "fallback" : "gemini",
            mode: contract.mode,
            actionType: contract.action.type,
            avatarState: contract.avatarState,
            safetyCategory: safetyResult.category,
            geminiCalled: true,
            geminiSuccess: !isContractInvalid && !isParseError,
            fallbackUsed: isContractInvalid || isParseError,
            fallbackReason: isParseError ? "PARSE_ERROR" : isContractInvalid ? "CONTRACT_INVALID" : undefined,
            model: res.model,
          });
        } catch (tErr) {
          console.warn("Telemetry write error:", tErr);
        }

        return contract;
      } catch (err: any) {
        const isTimeout = err?.name === "AbortError" || err?.message?.includes("abort") || err?.message?.includes("timed out");
        console.warn("Gemini API call failed or timed out. Falling back to multi-turn structured response logic.");

        const fallbackContract = buildStructuredFallbackResponse({
          userMessage: sanitizedInputContent,
          context: emotyContext,
          quickAction: args.quickAction,
          language: args.language,
        });

        await ctx.runMutation(api.companion.createMessage, {
          messageId: args.aiMessageId,
          role: "assistant",
          content: fallbackContract.response,
        });

        try {
          await ctx.runMutation(api.emotyTelemetry.recordTelemetry, {
            durationMs: Date.now() - startTime,
            path: "fallback",
            mode: fallbackContract.mode,
            actionType: fallbackContract.action.type,
            avatarState: fallbackContract.avatarState,
            safetyCategory: safetyResult.category,
            geminiCalled: true,
            geminiSuccess: false,
            fallbackUsed: true,
            fallbackReason: isTimeout ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR",
            errorCode: err?.message ? String(err.message).slice(0, 100) : "UNKNOWN",
            model: getGeminiModels()[0] || "gemini-3.5-flash-lite",
          });
        } catch (tErr) {
          console.warn("Telemetry write error:", tErr);
        }

        return fallbackContract;
      }
    } finally {
      // ALWAYS release in-flight concurrency lock
      try {
        await ctx.runMutation(api.emotyRateLimiter.releaseRateLimit);
      } catch (relErr) {
        console.warn("Failed to release rate limit lock:", relErr);
      }
    }
  },
});
