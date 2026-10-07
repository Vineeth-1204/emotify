import { describe, it, expect } from "vitest";
import { DEFAULT_COMPANION_NAME, getCompanionDisplayName } from "../common/companionName";
import { buildStructuredFallbackResponse, getMultiTurnFallbackGreeting } from "./emotyFallback";
import type { EmotyContext } from "./emotyContext";

function makeMockContext(overrides?: Partial<EmotyContext>): EmotyContext {
  return {
    user: {
      preferredName: undefined,
      ageCohort: "19-24",
      language: "en",
    },
    companion: {
      name: DEFAULT_COMPANION_NAME,
    },
    safety: {
      state: "normal",
    },
    app: {
      screen: "home",
    },
    conversation: {
      recentMessages: [],
    },
    memory: {
      preferences: [],
      conversationSummary: undefined,
    },
    ...overrides,
  };
}

describe("Companion Identity & Multi-Turn Behavior (COMPANION-01 to COMPANION-07)", () => {
  // COMPANION-01: Default companion name is "Emoty"
  it("COMPANION-01: Default companion name is 'Emoty'", () => {
    expect(DEFAULT_COMPANION_NAME).toBe("Emoty");
    expect(getCompanionDisplayName()).toBe("Emoty");
    expect(getCompanionDisplayName("")).toBe("Emoty");
    expect(getCompanionDisplayName("   ")).toBe("Emoty");
  });

  // COMPANION-02: No active product code path produces "Mitra" as the assistant name
  it("COMPANION-02: No active product fallback produces 'Mitra' as assistant name", () => {
    const ctx = makeMockContext();
    const fallback = buildStructuredFallbackResponse({
      userMessage: "Hello",
      context: ctx,
    });
    expect(fallback.response).not.toContain("Mitra");
    expect(fallback.response).toContain("Emoty");
  });

  // COMPANION-03: Configured companion name "Bro" produces "Hi, I'm Bro, your AI companion."
  it("COMPANION-03: Configured companion name 'Bro' produces companion greeting with 'Bro'", () => {
    const greeting = getMultiTurnFallbackGreeting("Bro");
    expect(greeting).toBe("Hi, I'm Bro, your AI companion. What's on your mind today?");
    expect(greeting).not.toContain("Emoty");
    expect(greeting).not.toContain("Mitra");
  });

  // COMPANION-04: Configured companion name "Buddy" produces companion greeting with 'Buddy'
  it("COMPANION-04: Configured companion name 'Buddy' produces companion greeting with 'Buddy'", () => {
    const greeting = getMultiTurnFallbackGreeting("Buddy");
    expect(greeting).toBe("Hi, I'm Buddy, your AI companion. What's on your mind today?");
    expect(greeting).not.toContain("Emoty");
    expect(greeting).not.toContain("Mitra");
  });

  // COMPANION-05: User preferred name and companion name remain independent
  it("COMPANION-05: User preferred name and companion name remain independent (User = Alex, Companion = Bro)", () => {
    const greeting = getMultiTurnFallbackGreeting("Bro", "Alex");
    expect(greeting).toBe("Hi Alex! I'm Bro, your AI companion. What's on your mind today?");
    // Crucial check: User is NOT identified as the companion
    expect(greeting).not.toBe("Hi, I'm Alex, your AI companion.");
    expect(greeting).not.toContain("Mitra");
  });

  // COMPANION-06: Changing companion name does not modify screening, triage, safety, or clinical memory
  it("COMPANION-06: Changing companion name does not alter safety state or clinical data", () => {
    const ctx = makeMockContext({
      companion: { name: "Bro" },
      safety: { state: "elevated" },
      user: { preferredName: "Sam", ageCohort: "13-18", language: "en" },
    });

    const fallback = buildStructuredFallbackResponse({
      userMessage: "I'm having trouble focusing when I sit down to study.",
      context: ctx,
    });

    // Companion name is customized, but safety invariants and action router constraints hold
    expect(ctx.safety.state).toBe("elevated");
    expect(fallback.mode).toBe("emotional_support");
    expect(fallback.response).not.toContain("Mitra");
  });

  // COMPANION-07: Companion does not repeatedly introduce itself during an active multi-turn conversation
  it("COMPANION-07: Companion does not introduce itself on subsequent turns even if message mentions greeting words", () => {
    const ctx = makeMockContext({
      companion: { name: "Emoty" },
      conversation: {
        recentMessages: [
          { role: "user", content: "I've been feeling really overwhelmed this week." },
          { role: "assistant", content: "I hear how much pressure you're carrying." },
        ],
      },
    });

    // Turn 2 contains "this" and "behind" which used to falsely trigger "hi" in substring matching
    const turn2 = buildStructuredFallbackResponse({
      userMessage: "It's mostly because midterms are next week and I'm behind.",
      context: ctx,
    });

    expect(turn2.response).not.toContain("Hello! I'm Emoty");
    expect(turn2.response).not.toContain("Hi, I'm Emoty");
    expect(turn2.response).not.toContain("your caring AI companion");

    // Turn 4 short continuation
    const turn4 = buildStructuredFallbackResponse({
      userMessage: "Yeah, exactly.",
      context: {
        ...ctx,
        conversation: {
          recentMessages: [
            { role: "user", content: "I've been feeling really overwhelmed this week." },
            { role: "assistant", content: "I hear how much pressure you're carrying." },
            { role: "user", content: "It's mostly because midterms are next week and I'm behind." },
            { role: "assistant", content: "Midterms can pile up so quickly." },
            { role: "user", content: "I'm having trouble focusing when I sit down to study." },
            { role: "assistant", content: "When you're behind, sitting down to study feels like staring at a mountain." },
          ],
        },
      },
    });

    expect(turn4.response).not.toContain("Hello! I'm");
    expect(turn4.response).not.toContain("Tell me more about how that makes you feel");
    expect(turn4.response).toContain("Don't be too hard on yourself for feeling stuck");
  });
});
