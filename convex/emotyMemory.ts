import { v } from "convex/values";
import { query, mutation } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import { sanitizePlainText } from "./sanitizer";

// =========================================================================
// 1. FROZEN MEMORY CATEGORIES & ALLOWED KEYS
// =========================================================================

export const ALLOWED_MEMORY_CATEGORIES = [
  "communication_preference",
  "support_preference",
  "routine_preference",
  "goal_preference",
  "chosen_name",
  "conversation_summary",
] as const;

export type EmotyMemoryCategory = (typeof ALLOWED_MEMORY_CATEGORIES)[number];

export const USER_FACING_PREFERENCE_CATEGORIES = [
  "communication_preference",
  "support_preference",
  "routine_preference",
  "goal_preference",
  "chosen_name",
] as const;

export type UserFacingPreferenceCategory = (typeof USER_FACING_PREFERENCE_CATEGORIES)[number];

export const ALLOWED_MEMORY_KEYS_BY_CATEGORY: Record<EmotyMemoryCategory, readonly string[]> = {
  communication_preference: ["response_length", "communication_tone", "explanation_depth"],
  support_preference: ["guidance_type", "exercise_preference", "coping_modality"],
  routine_preference: ["goal_timing", "checkin_time", "routine_frequency"],
  goal_preference: ["goal_scale", "goal_focus", "pacing_style"],
  chosen_name: ["display_name", "preferred_nickname"],
  conversation_summary: ["recent_topic", "last_discussion_focus"],
};

export const MAX_MEMORY_VALUE_CHARS = 150;
export const MAX_MEMORY_ITEMS_FOR_CONTEXT = 5;
export const MAX_MEMORY_TOTAL_CONTEXT_CHARS = 500;

// =========================================================================
// 2. DETERMINISTIC SENSITIVE & CLINICAL CONTENT FILTER
// =========================================================================

const SENSITIVE_CLINICAL_PATTERNS: RegExp[] = [
  // 1. Suicide, self-harm, or crisis disclosures
  /\b(suicide|suicidal|kill\s+myself|end\s+my\s+life|hang\s+myself|overdose|cutting|self[- ]harm|want\s+to\s+die|bleed\s+out)\b/i,
  // 2. Clinical and psychiatric diagnoses
  /\b(depression|major\s+depressive|bipolar|schizophrenia|schizoaffective|psychosis|psychotic|ptsd|post[- ]traumatic|ocd|obsessive\s+compulsive|adhd|attention\s+deficit|borderline|personality\s+disorder|anorexia|bulimia|eating\s+disorder|clinically\s+diagnosed|diagnosed\s+with|my\s+diagnosis)\b/i,
  // 3. Screening instruments, questionnaires & scores
  /\b(phq|phq[- ]?9|gad|gad[- ]?7|pq[- ]?16|screening\s+score|cutoff\s+score|assessment\s+score|severity\s+score)\b/i,
  // 4. Clinical triage & risk classifications
  /\b(triage|risk\s+classification|risk\s+level|mild\s+risk|moderate\s+risk|severe\s+risk|critical\s+risk|suicide\s+risk|high\s+risk\s+patient)\b/i,
  // 5. Medications & pharmaceutical agents
  /\b(medication|antidepressant|ssri|snri|sertraline|zoloft|fluoxetine|prozac|escitalopram|lexapro|citalopram|venlafaxine|effexor|duloxetine|cymbalta|bupropion|wellbutrin|alprazolam|xanax|clonazepam|klonopin|diazepam|valium|lorazepam|ativan|quetiapine|seroquel|olanzapine|zyprexa|lithium|adderall|ritalin|methylphenidate|prescription)\b/i,
  // 6. Counselor notes, interactions & confidential timeline
  /\b(counselor\s+notes?|therapist\s+notes?|clinical\s+notes?|counsellor\s+request|counsellor\s+conversation|session\s+transcript|private\s+clinical|doctor\s+notes?)\b/i,
  // 7. Safety alerts
  /\b(safety\s+alert|alert\s+triggered|emergency\s+contact\s+notified|sos\s+triggered)\b/i,
];

/**
 * Validates a memory candidate against the deterministic policy gate.
 * Ensures strict category allowlisting, bounded length, and total rejection
 * of any clinical, diagnostic, screening, medication, counselor, or crisis data.
 * FAILS CLOSED on any sensitive match or ambiguity.
 */
export function validateMemoryCandidate(candidate: {
  category: unknown;
  key: unknown;
  value: unknown;
  source?: unknown;
}): { valid: true; category: EmotyMemoryCategory; key: string; value: string } | { valid: false; reason: string } {
  if (!candidate || typeof candidate !== "object") {
    return { valid: false, reason: "Candidate must be a valid non-null object." };
  }

  // 1. Category validation against frozen allowlist
  if (
    typeof candidate.category !== "string" ||
    !(ALLOWED_MEMORY_CATEGORIES as readonly string[]).includes(candidate.category)
  ) {
    return { valid: false, reason: `Category '${String(candidate.category)}' is not in the frozen allowlist.` };
  }
  const category = candidate.category as EmotyMemoryCategory;

  // 2. Key validation against category allowed keys
  const allowedKeys = ALLOWED_MEMORY_KEYS_BY_CATEGORY[category];
  if (typeof candidate.key !== "string" || !allowedKeys.includes(candidate.key)) {
    return { valid: false, reason: `Key '${String(candidate.key)}' is not allowed for category '${category}'.` };
  }
  const key = candidate.key;

  // 3. Value validation & sanitation
  if (typeof candidate.value !== "string") {
    return { valid: false, reason: "Memory value must be a string." };
  }
  const sanitizedValue = sanitizePlainText(candidate.value).trim();
  if (sanitizedValue.length === 0) {
    return { valid: false, reason: "Memory value cannot be empty." };
  }
  if (sanitizedValue.length > MAX_MEMORY_VALUE_CHARS) {
    return { valid: false, reason: `Memory value exceeds maximum length of ${MAX_MEMORY_VALUE_CHARS} chars.` };
  }

  // 4. Sensitive clinical & safety content inspection (FAILS CLOSED)
  for (const pattern of SENSITIVE_CLINICAL_PATTERNS) {
    if (pattern.test(sanitizedValue) || pattern.test(key)) {
      return {
        valid: false,
        reason: "Memory rejected by policy: Sensitive clinical, diagnostic, screening, medication, or crisis content detected.",
      };
    }
  }

  return {
    valid: true,
    category,
    key,
    value: sanitizedValue,
  };
}

/**
 * Deterministically extracts candidate non-sensitive preferences from user statements.
 * Strict pattern matching only: never extracts temporary context ("exam on Friday", "feeling sad"),
 * and returns null for anything ambiguous or sensitive.
 */
export function detectMemoryCandidate(
  text: string
): { category: EmotyMemoryCategory; key: string; value: string; source: string } | null {
  if (!text || typeof text !== "string") return null;
  const cleaned = text.trim();
  const lower = cleaned.toLowerCase();

  // 1. Chosen name: "call me [Name]", "my nickname is [Name]"
  const nameMatch = cleaned.match(/^(?:please\s+)?(?:call\s+me|my\s+nickname\s+is)\s+([A-Za-z0-9_-]{2,25})\.?$/i);
  if (nameMatch) {
    const rawName = nameMatch[1].trim();
    if (rawName.length >= 2 && rawName.length <= 25) {
      return {
        category: "chosen_name",
        key: "display_name",
        value: rawName,
        source: "user_stated",
      };
    }
  }

  // 2. Communication preference: response length
  if (
    lower.includes("prefer concise") ||
    lower.includes("prefer short responses") ||
    lower.includes("keep answers short") ||
    lower.includes("keep it brief") ||
    lower.includes("keep your responses concise") ||
    lower.includes("i hate long explanations")
  ) {
    return {
      category: "communication_preference",
      key: "response_length",
      value: "concise",
      source: "user_stated",
    };
  }
  if (
    lower.includes("prefer detailed responses") ||
    lower.includes("prefer in-depth explanations") ||
    lower.includes("explain in detail")
  ) {
    return {
      category: "communication_preference",
      key: "response_length",
      value: "detailed",
      source: "user_stated",
    };
  }

  // 3. Goal preference: goal scale
  if (
    lower.includes("prefer smaller goals") ||
    lower.includes("prefer small goals") ||
    lower.includes("prefer micro goals") ||
    lower.includes("large plans overwhelm me")
  ) {
    return {
      category: "goal_preference",
      key: "goal_scale",
      value: "small_achievable_steps",
      source: "user_stated",
    };
  }

  // 4. Routine preference: timing
  if (
    lower.includes("prefer morning goals") ||
    lower.includes("prefer routines in the morning")
  ) {
    return {
      category: "routine_preference",
      key: "goal_timing",
      value: "morning",
      source: "user_stated",
    };
  }
  if (
    lower.includes("prefer evening goals") ||
    lower.includes("prefer routines at night")
  ) {
    return {
      category: "routine_preference",
      key: "goal_timing",
      value: "evening",
      source: "user_stated",
    };
  }

  // 5. Support preference: exercises
  if (
    lower.includes("like breathing exercises") ||
    lower.includes("prefer breathing exercises") ||
    lower.includes("breathing helps me most")
  ) {
    return {
      category: "support_preference",
      key: "exercise_preference",
      value: "breathing_exercises",
      source: "user_stated",
    };
  }

  // Fail closed: Everything else is NOT a persistent preference candidate
  return null;
}

// =========================================================================
// 3. CONVEX DATABASE OPERATIONS (AUTHENTICATED & SCOPED)
// =========================================================================

/**
 * Record a non-sensitive user preference or continuity context with automatic deduplication.
 * Replaces/updates existing preference for the same (userId, key) pair to prevent accumulation.
 */
export const recordUserPreference = mutation({
  args: {
    category: v.string(),
    key: v.string(),
    value: v.string(),
    source: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      throw new Error("Unauthenticated: Valid session required to record memory.");
    }
    const userId = identity.subject;

    // 1. Authoritative server-side policy gate
    const validation = validateMemoryCandidate({
      category: args.category,
      key: args.key,
      value: args.value,
      source: args.source,
    });

    if (!validation.valid) {
      throw new Error(`Memory Rejected: ${validation.reason}`);
    }

    const now = Date.now();

    // 2. Deterministic Deduplication: Check if preference already exists for this (userId, key)
    const existing = await ctx.db
      .query("emotyMemories")
      .withIndex("by_userId_and_key", (q) => q.eq("userId", userId).eq("key", validation.key))
      .first();

    if (existing) {
      // Update existing record in place
      await ctx.db.patch(existing._id, {
        category: validation.category,
        value: validation.value,
        source: args.source ? sanitizePlainText(args.source).slice(0, 50) : "user_stated",
        active: true,
        updatedAt: now,
        expiresAt: args.expiresAt,
      });
      return existing._id;
    }

    // 3. Insert new memory record
    const id = await ctx.db.insert("emotyMemories", {
      userId,
      category: validation.category,
      key: validation.key,
      value: validation.value,
      source: args.source ? sanitizePlainText(args.source).slice(0, 50) : "user_stated",
      active: true,
      createdAt: now,
      updatedAt: now,
      expiresAt: args.expiresAt,
    });

    return id;
  },
});

/**
 * List active non-sensitive memories for the authenticated user.
 * Strictly prevents cross-user access.
 */
export const listUserMemories = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      return [];
    }
    const userId = identity.subject;
    const now = Date.now();

    const memories = await ctx.db
      .query("emotyMemories")
      .withIndex("by_userId_and_active", (q) => q.eq("userId", userId).eq("active", true))
      .collect();

    // Filter out expired items
    return memories.filter((m) => !m.expiresAt || m.expiresAt > now);
  },
});

/**
 * List active personalization preferences for the authenticated user.
 * Explicitly excludes conversation summaries and non-preference categories.
 */
export const listUserPreferences = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      return [];
    }
    const userId = identity.subject;
    const now = Date.now();

    const memories = await ctx.db
      .query("emotyMemories")
      .withIndex("by_userId_and_active", (q) => q.eq("userId", userId).eq("active", true))
      .collect();

    return memories.filter(
      (m) =>
        (!m.expiresAt || m.expiresAt > now) &&
        (USER_FACING_PREFERENCE_CATEGORIES as readonly string[]).includes(m.category)
    );
  },
});

/**
 * Deactivate a memory entry (soft delete) for the authenticated user.
 */
export const deactivateUserMemory = mutation({
  args: {
    memoryId: v.id("emotyMemories"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      throw new Error("Unauthenticated");
    }
    const userId = identity.subject;

    const memory = await ctx.db.get(args.memoryId);
    if (!memory) {
      throw new Error("Memory not found");
    }
    if (memory.userId !== userId) {
      throw new Error("Forbidden: Cannot modify another user's memory");
    }

    await ctx.db.patch(args.memoryId, {
      active: false,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Permanently delete a memory entry for the authenticated user.
 */
export const deleteUserMemory = mutation({
  args: {
    memoryId: v.id("emotyMemories"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      throw new Error("Unauthenticated");
    }
    const userId = identity.subject;

    const memory = await ctx.db.get(args.memoryId);
    if (!memory) {
      throw new Error("Memory not found");
    }
    if (memory.userId !== userId) {
      throw new Error("Forbidden: Cannot delete another user's memory");
    }

    await ctx.db.delete(args.memoryId);
    return { success: true };
  },
});

/**
 * Clear all persistent memories for the authenticated user.
 */
export const clearAllUserMemories = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.subject) {
      throw new Error("Unauthenticated");
    }
    const userId = identity.subject;

    const memories = await ctx.db
      .query("emotyMemories")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    for (const mem of memories) {
      await ctx.db.delete(mem._id);
    }

    return { clearedCount: memories.length };
  },
});

// =========================================================================
// 4. BOUNDED CONTEXT EXTRACTOR FOR CONTEXT MANAGER
// =========================================================================

export interface BoundedMemoryContext {
  preferences: Array<{
    category: EmotyMemoryCategory;
    key: string;
    value: string;
  }>;
  conversationSummary?: string;
  totalChars: number;
}

/**
 * Extracts a bounded, sanitized set of user memories for safe injection into the Context Manager.
 * Strictly caps at MAX_MEMORY_ITEMS_FOR_CONTEXT (5) and MAX_MEMORY_TOTAL_CONTEXT_CHARS (500).
 */
export async function getBoundedUserMemoriesForContext(
  ctx: { db: any },
  userId: string
): Promise<BoundedMemoryContext> {
  const now = Date.now();
  const rawMemories = await ctx.db
    .query("emotyMemories")
    .withIndex("by_userId_and_active", (q: any) => q.eq("userId", userId).eq("active", true))
    .take(MAX_MEMORY_ITEMS_FOR_CONTEXT * 2);

  const activeNonExpired = rawMemories.filter((m: any) => !m.expiresAt || m.expiresAt > now);

  const preferences: Array<{ category: EmotyMemoryCategory; key: string; value: string }> = [];
  let conversationSummary: string | undefined = undefined;
  let totalChars = 0;

  for (const m of activeNonExpired) {
    if (preferences.length >= MAX_MEMORY_ITEMS_FOR_CONTEXT) break;

    const cat = m.category as EmotyMemoryCategory;
    const itemChars = (m.key?.length || 0) + (m.value?.length || 0) + (cat?.length || 0);

    if (totalChars + itemChars > MAX_MEMORY_TOTAL_CONTEXT_CHARS) {
      break;
    }

    if (cat === "conversation_summary") {
      if (!conversationSummary) {
        conversationSummary = m.value;
        totalChars += m.value.length;
      }
    } else {
      preferences.push({
        category: cat,
        key: m.key,
        value: m.value,
      });
      totalChars += itemChars;
    }
  }

  return {
    preferences,
    ...(conversationSummary ? { conversationSummary } : {}),
    totalChars,
  };
}
