import { type EmotySafetyState } from "./emotyContext";
import { type EmotyResponseContract } from "./emotyContract";

// =========================================================================
// 1. EMERGENCY RESOURCES CONFIGURATION
// =========================================================================

export interface EmergencyResourceConfig {
  teleManasNumber: string;
  teleManasTollFree: string;
  nationalLifeline: string;
  displaySummary: string;
}

export const EMERGENCY_RESOURCES: EmergencyResourceConfig = {
  teleManasNumber: "14416",
  teleManasTollFree: "1800-891-4416",
  nationalLifeline: "988",
  displaySummary: "Tele-MANAS (14416 / 1800-891-4416) or 988 Lifeline",
};

// =========================================================================
// 2. SAFETY GATE CLASSIFICATION TYPES & RULES
// =========================================================================

export type SafetyClassificationCategory =
  | "normal"
  | "elevated"
  | "crisis"
  | "third_party"
  | "contextual_idiom";

export interface SafetyClassificationResult {
  state: EmotySafetyState; // "normal" | "elevated" | "crisis"
  category: SafetyClassificationCategory;
  isSelfCrisis: boolean;
  reason: string;
}

/**
 * Normalizes text for robust deterministic safety pattern matching.
 * Strips accents, punctuation, excessive whitespace, and lowercases.
 */
export function normalizeSafetyText(input: string): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/['’]/g, "")            // strip apostrophes (e.g. i'm -> im, wasn't -> wasnt)
    .replace(/[^\w\s]/g, " ")        // replace punctuation/symbols with spaces
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Evaluates whether a message is an idiom, benign hyperbolic expression,
 * or academic context rather than actual self-harm/suicide.
 */
function isContextualIdiom(text: string): boolean {
  // e.g. "die laughing", "killed me", "kill this assignment", "dead tired"
  const idiomPatterns = [
    /\b(die|dying)\s+(of\s+)?laughing\b/,
    /\b(exam|test|assignment|homework|workout|run|sprint|project|class|lecture)\s+killed\s+me\b/,
    /\b(kill|killing|crush)\s+(this|the|my|that)\s+(exam|test|assignment|homework|interview|presentation|quiz)\b/,
    /\b(bored|laughing|crying|tired)\s+to\s+death\b/,
    /\bdead\s+tired\b/,
    /\bwant\s+to\s+disappear\s+from\s+(this|the)\s+(group|chat|call|meeting|room|class|lecture)\b/,
    /\bwish\s+i\s+wasn'?t\s+here\s+for\s+(this|the)\s+(lecture|class|exam|meeting|talk|presentation)\b/,
    /\b(so|totally|completely)\s+done\s+with\s+(this|the|my)\s+(assignment|homework|project|class|exam|paper)\b/,
  ];

  return idiomPatterns.some((p) => p.test(text));
}

/**
 * Evaluates whether the disclosure pertains to a third party (friend, roommate,
 * family member, someone else) rather than the authenticated student.
 */
function isThirdPartySafetyDisclosure(text: string): boolean {
  const thirdPartySubjectPatterns = [
    /\b(my\s+friend|my\s+roommate|my\s+brother|my\s+sister|my\s+mom|my\s+dad|my\s+cousin|my\s+partner|my\s+boyfriend|my\s+girlfriend|my\s+classmate|someone\s+i\s+know|a\s+friend\s+of\s+mine)\b/,
    /\b(friend|roommate|classmate|brother|sister|cousin)\s+(wants\s+to|is\s+going\s+to|might|said\s+they\s+will|is\s+talking\s+about)\s+(die|kill\s+(himself|herself|themselves)|hurt\s+(himself|herself|themselves)|suicide)\b/,
    /\bworried\s+(that\s+)?(my\s+friend|my\s+roommate|someone|he|she|they)\s+(might|is\s+going\s+to)\s+(hurt|kill)\s+(himself|herself|themselves)\b/,
  ];

  // Self indicators
  const selfCrisisPatterns = [
    /\b(i\s+want\s+to\s+die|i\s+want\s+to\s+kill\s+myself|i\s+'?m\s+going\s+to\s+kill\s+myself|i\s+will\s+kill\s+myself|i\s+might\s+hurt\s+myself|i\s+am\s+going\s+to\s+hurt\s+myself)\b/,
  ];

  const hasThirdParty = thirdPartySubjectPatterns.some((p) => p.test(text));
  const hasSelfCrisis = selfCrisisPatterns.some((p) => p.test(text));

  // If message mentions both, self crisis must take precedence
  return hasThirdParty && !hasSelfCrisis;
}

/**
 * Evaluates explicit self-directed suicidal intent or self-harm intent.
 */
function isExplicitCrisis(text: string): boolean {
  const explicitPatterns = [
    // Suicide intent
    /\b(i\s+want\s+to\s+die)\b/,
    /\b(i\s+wanna\s+die)\b/,
    /\b(i\s+want\s+to\s+kill\s+myself)\b/,
    /\b(i\s*m\s+going\s+to\s+kill\s+myself)\b/,
    /\b(i\s+am\s+going\s+to\s+kill\s+myself)\b/,
    /\b(i\s+will\s+kill\s+myself)\b/,
    /\b(i\s+have\s+decided\s+to\s+kill\s+myself)\b/,
    /\b(going\s+to\s+end\s+my\s+life)\b/,
    /\b(want\s+to\s+end\s+my\s+life)\b/,
    /\b(i\s+am\s+ending\s+it\s+all)\b/,
    /\b(i\s+want\s+to\s+end\s+it\s+all)\b/,
    /\b(i\s+am\s+better\s+off\s+dead)\b/,
    /\b(better\s+off\s+dead)\b/,
    // Self-harm intent
    /\b(i\s+might\s+hurt\s+myself)\b/,
    /\b(i\s+am\s+going\s+to\s+hurt\s+myself)\b/,
    /\b(i\s*m\s+going\s+to\s+hurt\s+myself)\b/,
    /\b(i\s+want\s+to\s+cut\s+myself)\b/,
    /\b(i\s+am\s+cutting\s+myself)\b/,
    /\b(i\s+want\s+to\s+harm\s+myself)\b/,
    /\b(i\s+plan\s+to\s+kill\s+myself)\b/,
  ];

  return explicitPatterns.some((p) => p.test(text));
}

/**
 * Evaluates elevated/concerning distress that does not establish explicit suicide/self-harm.
 */
function isElevatedDistress(text: string): boolean {
  const elevatedPatterns = [
    /\b(i\s+want\s+to\s+disappear)\b/,
    /\b(i\s+wish\s+i\s+wasn?\s*t\s+here)\b/,
    /\b(i\s+wish\s+i\s+didn?\s*t\s+exist)\b/,
    /\b(i\s+can?\s*t\s+do\s+this\s+anymore)\b/,
    /\b(i\s+can?\s*t\s+take\s+this\s+anymore)\b/,
    /\b(everything\s+(feels|is)\s+pointless)\b/,
    /\b(feel\s+like\s+everything\s+(is|feels)\s+pointless)\b/,
    /\b(what\s*s\s+the\s+point\s+of\s+living)\b/,
    /\b(i\s+don?\s*t\s+see\s+how\s+things\s+get\s+better)\b/,
    /\b(there\s+is\s+no\s+way\s+out)\b/,
    /\b(i\s+feel\s+completely\s+hopeless)\b/,
    /\b(no\s+one\s+would\s+care\s+if\s+i\s+was\s+gone)\b/,
    /\b(giving\s+up\s+on\s+everything)\b/,
  ];

  return elevatedPatterns.some((p) => p.test(text));
}

/**
 * Authoritative deterministic Server Safety Gate classifier.
 * Never delegates safety-state decisions or crisis classification to Gemini.
 */
export function classifyServerSafety(rawMessage: string): SafetyClassificationResult {
  const normalized = normalizeSafetyText(rawMessage);

  if (!normalized) {
    return {
      state: "normal",
      category: "normal",
      isSelfCrisis: false,
      reason: "Empty or whitespace message.",
    };
  }

  // 1. Contextual Idioms / Hyperboles Check
  if (isContextualIdiom(normalized)) {
    return {
      state: "normal",
      category: "contextual_idiom",
      isSelfCrisis: false,
      reason: "Message contains contextual idiom or hyperbolic expression.",
    };
  }

  // 2. Third-Party Safety Disclosure Check
  if (isThirdPartySafetyDisclosure(normalized)) {
    return {
      state: "elevated",
      category: "third_party",
      isSelfCrisis: false,
      reason: "Message pertains to third-party safety concern; not authenticated student crisis.",
    };
  }

  // 3. Explicit Self-Directed Crisis Check
  if (isExplicitCrisis(normalized)) {
    return {
      state: "crisis",
      category: "crisis",
      isSelfCrisis: true,
      reason: "Explicit self-directed suicidal or self-harm intent detected.",
    };
  }

  // 4. Elevated Concerning Distress Check
  if (isElevatedDistress(normalized)) {
    return {
      state: "elevated",
      category: "elevated",
      isSelfCrisis: false,
      reason: "Elevated distress or concerning ideation without explicit suicide intent.",
    };
  }

  // 5. Default: Normal
  return {
    state: "normal",
    category: "normal",
    isSelfCrisis: false,
    reason: "No immediate or elevated safety risk detected.",
  };
}

// =========================================================================
// 3. CONTROLLED SAFETY RESPONSES
// =========================================================================

/**
 * Generates an authoritative, controlled crisis response without calling Gemini.
 * Follows clinical product standards:
 * - Acknowledges seriousness
 * - Recommends immediate human support
 * - Delivers configured emergency resources (Tele-MANAS 14416 / 988)
 * - Avoids judgment, diagnosis, guilt, or emotional dependency
 */
export function getControlledCrisisResponse(
  studentName?: string
): EmotyResponseContract {
  const greeting = studentName ? `${studentName}, ` : "";
  const responseText = `${greeting}I'm really concerned to hear that, and your safety is the most important thing right now. Please connect with someone who can support you immediately. You can reach Tele-MANAS toll-free 24/7 at ${EMERGENCY_RESOURCES.teleManasNumber} (or ${EMERGENCY_RESOURCES.teleManasTollFree}), or call/text ${EMERGENCY_RESOURCES.nationalLifeline}. Please reach out to them or a trusted friend, family member, or campus counselor right now.`;

  return {
    mode: "emotional_support",
    response: responseText,
    action: {
      type: "open_counsellor_request",
      label: "Connect with Counselor",
    },
    avatarState: "supportive",
  };
}

/**
 * Generates a supportive third-party crisis response without calling Gemini.
 * Focuses on how the student can assist their friend safely without creating
 * a personal suicideRisk alert for the student.
 */
export function getControlledThirdPartyResponse(): EmotyResponseContract {
  return {
    mode: "guidance",
    response: `Thank you for looking out for your friend. If you believe they are in immediate danger, please encourage them to contact Tele-MANAS at ${EMERGENCY_RESOURCES.teleManasNumber} or the ${EMERGENCY_RESOURCES.nationalLifeline} Lifeline right away, or reach out to campus emergency services or a trusted adult together. You don't have to carry this alone.`,
    action: {
      type: "open_counsellor_request",
      label: "Ask Campus Counselor",
    },
    avatarState: "supportive",
  };
}

// =========================================================================
// 4. DETERMINISTIC ALERT DEDUPLICATION
// =========================================================================

/** Cooldown period in milliseconds for duplicate crisis alerts (e.g. 15 minutes) */
export const CRISIS_ALERT_COOLDOWN_MS = 15 * 60 * 1000;

export interface DeduplicationCheckParams {
  userId: string;
  type: string;
  now?: number;
  recentAlerts: Array<{
    userId: string;
    type: string;
    status: string;
    createdAt: number;
  }>;
}

/**
 * Determines whether a new alert should be created or suppressed under deduplication rules.
 * - Prevents alert storms (e.g. "I want to die" followed immediately by "I really want to die")
 * - Scoped strictly to the authenticated student and alert type
 * - Does NOT suppress alerts if the cooldown has elapsed or if previous alerts were resolved
 */
export function shouldCreateSafetyAlert(params: DeduplicationCheckParams): {
  shouldCreate: boolean;
  suppressionReason?: string;
} {
  const { userId, type, recentAlerts } = params;
  const now = params.now || Date.now();

  const matchingPendingAlerts = recentAlerts.filter(
    (a) =>
      a.userId === userId &&
      a.type === type &&
      a.status === "pending" &&
      now - a.createdAt < CRISIS_ALERT_COOLDOWN_MS
  );

  if (matchingPendingAlerts.length > 0) {
    const mostRecent = matchingPendingAlerts.sort((a, b) => b.createdAt - a.createdAt)[0];
    const elapsedMinutes = Math.floor((now - mostRecent.createdAt) / 60000);
    return {
      shouldCreate: false,
      suppressionReason: `Duplicate ${type} alert suppressed: Pending alert created ${elapsedMinutes} minute(s) ago (cooldown is ${CRISIS_ALERT_COOLDOWN_MS / 60000} mins).`,
    };
  }

  return { shouldCreate: true };
}
