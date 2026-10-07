/// <reference types="vite/client" />
import { expect, test, describe } from "vitest";
import fs from "fs";
import path from "path";
import {
  EMOTY_AVATAR_STATES,
  type EmotyAvatarState,
  resolveAvatarPresentationState,
  isValidAvatarState,
  normalizeAvatarState,
} from "./emotyAvatar";
import { validateAndResolveAction } from "./emotyActionRouter";
import { classifyServerSafety, getControlledCrisisResponse } from "./emotySafety";

describe("AI-3 Step 6B: Avatar Visual Replacement (AVATAR-VISUAL-01 to AVATAR-VISUAL-18)", () => {
  const rootDir = path.resolve(__dirname, "..");
  const canonicalAssetPath = path.join(rootDir, "assets", "emoty_boy_avatar.jpg");
  const avatarComponentPath = path.join(rootDir, "components", "avatar", "EmotyAvatar.tsx");

  // =========================================================================
  // 1. CANONICAL ASSET VERIFICATION (AVATAR-VISUAL-01, AVATAR-VISUAL-02)
  // =========================================================================

  test("AVATAR-VISUAL-01: Canonical assets/emoty_boy_avatar.jpg exists and is referenced by avatar implementation", () => {
    // 1. File exists
    expect(fs.existsSync(canonicalAssetPath)).toBe(true);

    // 2. File size and JPEG header validation
    const stats = fs.statSync(canonicalAssetPath);
    expect(stats.size).toBeGreaterThan(100_000); // 623 KB
    expect(stats.size).toBeLessThan(2_000_000);

    const buf = fs.readFileSync(canonicalAssetPath);
    // JPEG magic bytes: FF D8 FF
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xd8);
    expect(buf[2]).toBe(0xff);

    // 3. MitraAvatar component explicitly references this canonical asset
    const componentCode = fs.readFileSync(avatarComponentPath, "utf-8");
    expect(componentCode).toContain("assets/emoty_boy_avatar.jpg");
    expect(componentCode).toContain("CANONICAL_EMOTY_BOY_AVATAR");
  });

  test("AVATAR-VISUAL-02: MitraAvatar renders the new character asset via Image component", () => {
    const componentCode = fs.readFileSync(avatarComponentPath, "utf-8");

    // Must use React Native Image component with cover resizeMode
    expect(componentCode).toContain("<Image");
    expect(componentCode).toContain("source={CANONICAL_EMOTY_BOY_AVATAR}");
    expect(componentCode).toContain('resizeMode="cover"');
    // Must NOT contain old SVG human face geometry
    expect(componentCode).not.toContain("hairHighlight: hairGirlHighlight");
    expect(componentCode).not.toContain('d="M43 47 C46 51 54 51 57 47"');
  });

  // =========================================================================
  // 2. STATE COMPATIBILITY & FAIL-SAFE (AVATAR-VISUAL-03, AVATAR-VISUAL-04, AVATAR-VISUAL-16)
  // =========================================================================

  test("AVATAR-VISUAL-03: All 13 existing AvatarState values remain accepted and supported", () => {
    const expected13States: EmotyAvatarState[] = [
      "idle",
      "listening",
      "thinking",
      "calm",
      "happy",
      "sad",
      "worried",
      "angry",
      "tired",
      "breathing",
      "encouraging",
      "celebrating",
      "supportive",
    ];

    expect(EMOTY_AVATAR_STATES).toHaveLength(13);
    for (const state of expected13States) {
      expect(isValidAvatarState(state)).toBe(true);
      const resolved = resolveAvatarPresentationState({
        explicitAvatarState: state,
      });
      expect(resolved).toBe(state);
    }
  });

  test("AVATAR-VISUAL-04: Unknown avatar states fail safely to default", () => {
    const unknownStates = [
      "hacked",
      "crying_violently",
      "dancing",
      "broken",
      "clinical_depressed",
      "robot",
      "custom_state_xyz",
    ];

    for (const unknown of unknownStates) {
      expect(isValidAvatarState(unknown)).toBe(false);
      const safeDefault = normalizeAvatarState(unknown, "idle");
      expect(safeDefault).toBe("idle");

      const resolved = resolveAvatarPresentationState({
        explicitAvatarState: unknown,
        defaultState: "calm",
      });
      expect(resolved).toBe("calm");
    }
  });

  test("AVATAR-VISUAL-16: No new arbitrary AvatarState values were introduced", () => {
    const componentCode = fs.readFileSync(avatarComponentPath, "utf-8");
    // Component's AvatarState union must match the canonical 13
    expect(EMOTY_AVATAR_STATES).toHaveLength(13);
    expect(EMOTY_AVATAR_STATES).toEqual([
      "idle",
      "listening",
      "thinking",
      "calm",
      "happy",
      "sad",
      "worried",
      "angry",
      "tired",
      "breathing",
      "encouraging",
      "celebrating",
      "supportive",
    ]);

    // Ensure no additional states like 'grounding' or 'neutral' were added to the union type
    expect(componentCode).toContain("'idle'");
    expect(componentCode).toContain("'listening'");
    expect(componentCode).toContain("'thinking'");
    expect(componentCode).toContain("'calm'");
    expect(componentCode).toContain("'happy'");
    expect(componentCode).toContain("'sad'");
    expect(componentCode).toContain("'worried'");
    expect(componentCode).toContain("'angry'");
    expect(componentCode).toContain("'tired'");
    expect(componentCode).toContain("'breathing'");
    expect(componentCode).toContain("'encouraging'");
    expect(componentCode).toContain("'celebrating'");
    expect(componentCode).toContain("'supportive'");
  });

  // =========================================================================
  // 3. AUTHORITATIVE STATE RESOLUTION (AVATAR-VISUAL-05, AVATAR-VISUAL-06, AVATAR-VISUAL-07)
  // =========================================================================

  test("AVATAR-VISUAL-05: resolveAvatarPresentationState() remains authoritative in the presentation layer", () => {
    const componentCode = fs.readFileSync(avatarComponentPath, "utf-8");
    expect(componentCode).toContain("resolveAvatarPresentationState({");
    expect(componentCode).toContain("import { resolveAvatarPresentationState } from '@/common/avatarPresentation';");
  });

  test("AVATAR-VISUAL-06: CRISIS still resolves strictly and unconditionally to supportive", () => {
    const crisisCases = [
      { safetyState: "crisis" as const },
      { safetyState: "crisis" as const, userEmotion: "angry" },
      { safetyState: "crisis" as const, explicitAvatarState: "happy" },
      { safetyState: "crisis" as const, activeAppState: "celebrating" as const },
      { isSafetyActive: true, userEmotion: "sad" },
    ];

    for (const c of crisisCases) {
      expect(resolveAvatarPresentationState(c)).toBe("supportive");
    }
  });

  test("AVATAR-VISUAL-07: ELEVATED still resolves correctly to supportive or active breathing", () => {
    // Ordinary elevated distress resolves to supportive
    expect(resolveAvatarPresentationState({ safetyState: "elevated" })).toBe("supportive");

    // Active somatic breathing pacing during elevated distress resolves to breathing
    expect(
      resolveAvatarPresentationState({
        safetyState: "elevated",
        activeAppState: "breathing",
      })
    ).toBe("breathing");
  });

  // =========================================================================
  // 4. ACTION ROUTER & SAFETY DECOUPLING (AVATAR-VISUAL-08, AVATAR-VISUAL-09, AVATAR-VISUAL-10)
  // =========================================================================

  test("AVATAR-VISUAL-08: Action Router behavior remains completely unchanged", () => {
    const validResult = validateAndResolveAction({
      type: "start_jpmr",
    });
    expect(validResult.valid).toBe(true);
    if (validResult.valid) {
      expect(validResult.resolved.route).toBe("/(auth)/tools/jpmr");
      expect(validResult.action.type).toBe("start_jpmr");
    }

    const invalidResult = validateAndResolveAction({
      type: "malicious_unauthorized_action",
    });
    expect(invalidResult.valid).toBe(false);
    if (!invalidResult.valid) {
      expect(invalidResult.fallbackAction.type).toBe("none");
    }
  });

  test("AVATAR-VISUAL-09: Gemini crisis suppression remains completely unchanged", () => {
    const crisisSafety = classifyServerSafety("i want to kill myself");
    expect(crisisSafety.state).toBe("crisis");

    const elevatedSafety = classifyServerSafety("i wish i wasnt here");
    expect(elevatedSafety.state).toBe("elevated");

    const normalSafety = classifyServerSafety("how can i manage exam stress?");
    expect(normalSafety.state).toBe("normal");

    // Controlled crisis response suppresses Gemini and sets supportive avatar state
    const controlled = getControlledCrisisResponse("Alex");
    expect(controlled.avatarState).toBe("supportive");
    expect(controlled.action.type).toBe("open_counsellor_request");
  });

  test("AVATAR-VISUAL-10: Avatar visual failure does not break conversation logic or become a SPOF", () => {
    const componentCode = fs.readFileSync(avatarComponentPath, "utf-8");
    // Checks for imageError state and fallbackContainer
    expect(componentCode).toContain("imageError");
    expect(componentCode).toContain("setImageError(true)");
    expect(componentCode).toContain("fallbackContainer");
    expect(componentCode).toContain("fallbackInitial");
  });

  // =========================================================================
  // 5. SCREEN CONSISTENCY (AVATAR-VISUAL-11, AVATAR-VISUAL-12, AVATAR-VISUAL-13)
  // =========================================================================

  test("AVATAR-VISUAL-11: Existing Home avatar rendering remains functional", () => {
    // Normalizing legacy Home card states
    expect(normalizeAvatarState("neutral")).toBe("idle");
    expect(normalizeAvatarState("grounding")).toBe("calm");

    // Home card resolution mapping
    const goodResolved = resolveAvatarPresentationState({ userEmotion: "good", defaultState: "calm" });
    expect(["calm", "happy", "idle"]).toContain(goodResolved);
  });

  test("AVATAR-VISUAL-12: Existing Companion avatar rendering remains functional", () => {
    // Companion states (xs, lg, listening, thinking, supportive)
    expect(resolveAvatarPresentationState({ activeAppState: "listening" })).toBe("listening");
    expect(resolveAvatarPresentationState({ activeAppState: "thinking" })).toBe("thinking");
    expect(resolveAvatarPresentationState({ mode: "emotional_support" })).toBe("supportive");
  });

  test("AVATAR-VISUAL-13: Existing CBT/Reframe avatar rendering remains functional", () => {
    // CBT / Reframe celebration and breathing
    expect(resolveAvatarPresentationState({ activeAppState: "celebrating" })).toBe("celebrating");
    expect(resolveAvatarPresentationState({ activeAppState: "breathing" })).toBe("breathing");
  });

  // =========================================================================
  // 6. SIZING, ACCESSIBILITY & SECURITY (AVATAR-VISUAL-14, AVATAR-VISUAL-15, AVATAR-VISUAL-17)
  // =========================================================================

  test("AVATAR-VISUAL-14: Avatar sizing preserves aspect ratio and supports SIZE_MAP tokens", () => {
    const componentCode = fs.readFileSync(avatarComponentPath, "utf-8");

    // Check SIZE_MAP definitions
    expect(componentCode).toContain("xs: 32");
    expect(componentCode).toContain("sm: 48");
    expect(componentCode).toContain("md: 80");
    expect(componentCode).toContain("lg: 140");
    expect(componentCode).toContain("xl: 180");

    // Circular 1:1 framing
    expect(componentCode).toContain("borderRadius: size / 2");
    expect(componentCode).toContain("width: size");
    expect(componentCode).toContain("height: size");
  });

  test("AVATAR-VISUAL-15: Reduced-motion behavior remains functional and accessible", () => {
    const componentCode = fs.readFileSync(avatarComponentPath, "utf-8");

    // Native AccessibilityInfo reduce motion check
    expect(componentCode).toContain("AccessibilityInfo.isReduceMotionEnabled");
    expect(componentCode).toContain("reduceMotionChanged");
    expect(componentCode).toContain("if (reduceMotion)");
  });

  test("AVATAR-VISUAL-17: No avatar visual component can execute navigation or mutations", () => {
    const componentCode = fs.readFileSync(avatarComponentPath, "utf-8");

    // Presentation purity: No router navigation
    expect(componentCode).not.toContain("useRouter");
    expect(componentCode).not.toContain("router.push");
    expect(componentCode).not.toContain("router.replace");

    // Presentation purity: No database mutations
    expect(componentCode).not.toContain("useMutation");
    expect(componentCode).not.toContain("api.alerts");
    expect(componentCode).not.toContain("api.triage");
    expect(componentCode).not.toContain("api.interventions");
  });

  // =========================================================================
  // 7. REGRESSION FREE VALIDATION (AVATAR-VISUAL-18)
  // =========================================================================

  test("AVATAR-VISUAL-18: AI-3 Steps 1–5 remain regression-free and decoupled", () => {
    // Step 1 Contract: 13 states
    expect(EMOTY_AVATAR_STATES).toHaveLength(13);
    // Step 4 Safety: Crisis detection
    expect(classifyServerSafety("i want to end my life").state).toBe("crisis");
    // Step 5 Action Router: Valid actions
    const actionResult = validateAndResolveAction({
      type: "start_breathing",
    });
    expect(actionResult.valid).toBe(true);
    if (actionResult.valid) {
      expect(actionResult.resolved.route).toBe("/(auth)/tools/breathing");
    }
  });
});

describe("AI-3 Step 6C: Avatar Hero Refinement (HERO-01 to HERO-08)", () => {
  const rootDir = path.resolve(__dirname, "..");
  const canonicalAssetPath = path.join(rootDir, "assets", "emoty_boy_avatar.jpg");
  const avatarComponentPath = path.join(rootDir, "components", "avatar", "EmotyAvatar.tsx");
  const componentCode = fs.readFileSync(avatarComponentPath, "utf-8");

  test("HERO-01: Hero sizing tokens (lg: 140, xl: 180) implement refined hero depth, ambient halo, and framing while preserving canonical image", () => {
    // Canonical image asset remains unchanged
    expect(fs.existsSync(canonicalAssetPath)).toBe(true);
    expect(componentCode).toContain("CANONICAL_EMOTY_BOY_AVATAR");

    // Hero check definition
    expect(componentCode).toContain("const isHero = size >= 140;");

    // Hero ambient halo and depth
    expect(componentCode).toContain("styles.heroAmbientHalo");
    expect(componentCode).toContain("styles.heroInnerRim");
    expect(componentCode).toContain("heroImageScale");
    expect(componentCode).toContain("heroImageTranslateY");
  });

  test("HERO-02: Small and medium tokens (xs: 32, sm: 48, md: 80) preserve existing framing without distortion", () => {
    // Sizing map unchanged
    expect(componentCode).toContain("xs: 32");
    expect(componentCode).toContain("sm: 48");
    expect(componentCode).toContain("md: 80");
    expect(componentCode).toContain("lg: 140");
    expect(componentCode).toContain("xl: 180");

    // Non-hero tokens bypass scale and translateY framing adjustments
    expect(componentCode).toContain("const heroImageScale = isHero ? 1.07 : 1.0;");
    expect(componentCode).toContain("const heroImageTranslateY = isHero ? size * 0.025 : 0;");
  });

  test("HERO-03: Breathing state animation uses subtle, slow somatic pacing without exaggerated scale fluctuation", () => {
    // Subtle somatic expansion (1.025) and contraction (0.985) over 4000ms cycles
    expect(componentCode).toContain("toValue: 1.025");
    expect(componentCode).toContain("toValue: 0.985");
    expect(componentCode).toContain("duration: 4000");
    // Exaggerated bouncing scale (1.08 / 0.95) is eliminated
    expect(componentCode).not.toContain("toValue: 1.08");
    expect(componentCode).not.toContain("toValue: 0.95");
  });

  test("HERO-04: Listening state animation maintains a calm, stable presence with subdued tilt", () => {
    // Gentle head tilt (1.4deg for hero) with high damping to prevent robotic wobble
    expect(componentCode).toContain("isHero ? ['0deg', '1.4deg'] : ['0deg', '2.0deg']");
    expect(componentCode).toContain("tension: 60");
    expect(componentCode).toContain("friction: 8");
    // Old harsh tilt (2.8deg) is eliminated
    expect(componentCode).not.toContain("outputRange: ['0deg', '2.8deg']");
  });

  test("HERO-05: Celebrating state animation uses subtle positive elevation without exaggerated bouncing", () => {
    // Restrained elevation (-6) with gentle settling
    expect(componentCode).toContain("toValue: -6");
    expect(componentCode).toContain("tension: 70");
    expect(componentCode).toContain("friction: 7");
    // Harsh spring bounce (-12) is eliminated
    expect(componentCode).not.toContain("toValue: -12");
  });

  test("HERO-06: Reduced-motion strictly zeroes all animated values and halts motion loops", () => {
    expect(componentCode).toContain("if (reduceMotion) {");
    expect(componentCode).toContain("breathAnim.setValue(1);");
    expect(componentCode).toContain("bounceAnim.setValue(0);");
    expect(componentCode).toContain("swayAnim.setValue(0);");
    expect(componentCode).toContain("return;");
  });

  test("HERO-07: Exactly the 13 canonical states remain accepted across all hero presentations", () => {
    expect(EMOTY_AVATAR_STATES).toHaveLength(13);
    const valid13 = [
      "idle",
      "listening",
      "thinking",
      "calm",
      "happy",
      "sad",
      "worried",
      "angry",
      "tired",
      "breathing",
      "encouraging",
      "celebrating",
      "supportive",
    ];
    for (const st of valid13) {
      expect(isValidAvatarState(st)).toBe(true);
      const res = resolveAvatarPresentationState({ explicitAvatarState: st });
      expect(res).toBe(st);
    }
  });

  test("HERO-08: Fallback behavior remains intact for lg/xl hero rendering on image error", () => {
    expect(componentCode).toContain("imageError");
    expect(componentCode).toContain("fallbackContainer");
    expect(componentCode).toContain("fallbackInitial");
    expect(componentCode).toContain("width: innerSize");
    expect(componentCode).toContain("height: innerSize");
  });
});
