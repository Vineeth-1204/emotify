import { type EmotySafetyState } from "./emotyContext";
import { type EmotyResponseContract } from "./emotyContract";
import { CRISIS_RESOURCES, CRISIS_RESOURCES_SUMMARY } from "../common/crisisResources";

// =========================================================================
// 1. EMERGENCY RESOURCES CONFIGURATION
// =========================================================================

export interface EmergencyResourceConfig {
  teleManasNumber: string;
  teleManasTollFree: string;
  emergencyNumber: string;
  displaySummary: string;
}

export const EMERGENCY_RESOURCES: EmergencyResourceConfig = {
  teleManasNumber: CRISIS_RESOURCES.helplineNumber,
  teleManasTollFree: CRISIS_RESOURCES.helplineTollFree,
  emergencyNumber: CRISIS_RESOURCES.emergencyNumber,
  displaySummary: CRISIS_RESOURCES_SUMMARY,
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
 * Third-party subject markers (friend, roommate, family member, someone else).
 * Only used to keep GENERIC risk phrases ("my friend attempted suicide") from being
 * attributed to the student. First-person disclosures always win.
 */
const THIRD_PARTY_SUBJECT_PATTERNS: RegExp[] = [
  /\b(my\s+friend|my\s+best\s+friend|my\s+roommate|my\s+brother|my\s+sister|my\s+mom|my\s+mother|my\s+dad|my\s+father|my\s+cousin|my\s+partner|my\s+boyfriend|my\s+girlfriend|my\s+classmate|someone\s+i\s+know|a\s+friend\s+of\s+mine|a\s+friend)\b/,
  /\b(friend|roommate|classmate|brother|sister|cousin)\s+(wants\s+to|is\s+going\s+to|might|said|says|is\s+talking\s+about|attempted|tried)\b/,
  /\bworried\s+(that\s+)?(my\s+friend|my\s+roommate|someone|he|she|they)\b/,
];

/**
 * First-person (self-directed) crisis disclosures, matched on normalized text
 * (lowercase, apostrophes removed: "i'm" -> "im", "don't" -> "dont").
 * These are ALWAYS treated as a student crisis, even if a third party or an idiom
 * is also mentioned in the same message.
 */
const SELF_CRISIS_PATTERNS: RegExp[] = [
  // Explicit wish or intent to die
  /\bi\s+(just\s+|really\s+|honestly\s+|kinda\s+|kind\s+of\s+|sometimes\s+|still\s+|actually\s+)*(want|wanna)\s+(to\s+)?die\b(?!\s+(of\s+)?laughing)/,
  /\bi\s*m\s+(ready|going|gonna)\s+to\s+die\b/,
  /\b(want|wanna|going|gonna|plan|planning|decided|ready|trying|tried|try)\s+(to\s+)?(kill|end|take)\s+(myself|my\s+(own\s+)?life|it\s+all)\b/,
  /\b(kill|killing|hang|hanging|drown|drowning|starve|starving)\s+myself\b/,
  /\b(ending|end)\s+(it\s+all|my\s+(own\s+)?life)\b/,
  /\btake\s+my\s+(own\s+)?life\b/,
  /\b(better\s+off\s+dead|better\s+off\s+without\s+me)\b/,
  /\bi\s+wish\s+i\s+(was|were)\s+dead\b/,
  /\b(dont|do\s+not|no\s+longer)\s+want\s+to\s+(live|be\s+alive|exist|be\s+here\s+anymore)\b/,
  /\b(nothing|no\s+reason)\s+(left\s+)?to\s+live\s+for\b|\bno\s+reason\s+to\s+(live|keep\s+going)\b/,
  // Suicidal ideation in the first person
  /\b(i|im|i\s+am|ive\s+been|i\s+have\s+been|i\s+feel|im\s+feeling|feeling|felt)\s+(so\s+|really\s+|very\s+|kind\s+of\s+|kinda\s+|pretty\s+|a\s+bit\s+|a\s+little\s+)?suicidal\b/,
  /\b(i\s+have|ive|ive\s+been\s+having|im\s+having|having|i\s+get|i\s+keep\s+having|i\s+had)\s+(some\s+)?suicidal\s+(thoughts|feelings|ideation|urges)\b/,
  /\b(thinking|thought|thoughts|think)\s+(about|of)\s+(suicide|killing\s+myself|ending\s+my\s+life|ending\s+it(\s+all)?|taking\s+my\s+(own\s+)?life|hurting\s+myself|cutting\s+myself)\b/,
  /\bmy\s+suicide\s+(plan|note|attempt)\b/,
  /\bi\s+(attempted|tried\s+to\s+commit)\s+suicide\b/,
  // Self-harm (intent, ongoing, or recent)
  /\b(want|wanna|going|gonna|might|plan|planning|trying|tried|urge|urges)\s+(to\s+)?(hurt|harm|cut|burn)\s+myself\b/,
  /\b(cut|cutting|burn|burning|harm|harming)\s+myself\b(?!\s+(shaving|while|accidentally|by\s+accident|on\s+(a|the|some)))/,
  /\b(keep|been|kept|started)\s+(hurting|harming|cutting)\s+myself\b/,
  /\bi\s+(self\s+harm|selfharm)\b|\bmy\s+self\s+harm\b/,
  // Slang
  /\bkms\b/,
  /\bunalive\s+myself\b/,
];

/**
 * Generic high-risk phrases with no explicit subject. Treated as a student crisis
 * unless the message is clearly about someone else.
 */
const GENERIC_CRISIS_PATTERNS: RegExp[] = [
  /\b(commit|committing|attempt|attempting|consider|considering|contemplating)\s+suicide\b/,
  /\bsuicid(e|al)\s+(plan|note|attempt|thoughts|ideation)\b/,
  /\b(overdose|overdosed|overdosing)\b/,
  /\b(took|take|taken|swallowed|swallow|taking)\s+(a\s+bunch\s+of|all\s+(my|the|of\s+my)|too\s+many|lots\s+of|a\s+lot\s+of|an\s+entire|the\s+whole|a\s+whole)\s+(bottle\s+of\s+)?(pills|tablets|meds|medicine|medication|sleeping\s+pills)\b/,
  /\bunalive\b/,
  // Romanized Hindi / Hinglish
  /\b(mujhe|main|mai|mein)\s+(marna|mar\s+jana|mar\s+jaana)\s+(hai|chahta|chahti|chahte)\b/,
  /\b(marna|mar\s+jana|mar\s+jaana|mar\s+jaun|mar\s+jaunga|mar\s+jaungi)\s+(chahta|chahti|chahte|hai)\b/,
  /\bkhud\s*(ko)?\s+(maar|mar|khatam)\s*(dunga|dungi|lunga|lungi|dena|lena|du|lu|doon|loon)?\b/,
  /\b(aatmahatya|atmahatya|aatmhatya|khudkushi|khudkhushi)\b/,
  /\b(jeena|jina|jeene)\s+(nahi|nahin)\s+(chahta|chahti|chahte|hai)\b/,
  /\bzindagi\s+(khatam|khatm)\s+(karna|kar|karni|kardu|kar\s+du|kar\s+dunga|kar\s+dungi)\b/,
  /\bsuicide\s+(karna|kar\s+lunga|kar\s+lungi|kar\s+loon|kar\s+lu|karunga|karungi)\b/,
];

/**
 * Native-script phrases (Hindi / Tamil / Telugu), matched on the NFC-normalized raw
 * text because the ASCII normalizer strips non-Latin characters.
 * NOTE: requires review by native speakers and the clinical lead.
 */
const NATIVE_SCRIPT_CRISIS_PATTERNS: RegExp[] = [
  // Hindi
  /मरना\s*चाहत/,
  /मर\s*जाना\s*चाहत/,
  /मुझे\s*मरना\s*है/,
  /आत्महत्या/,
  /ख़ुदकुशी|खुदकुशी/,
  /(ख़ुद|खुद)\s*को\s*(मार|ख़त्म|खत्म)/,
  /जीना\s*नहीं\s*चाहत/,
  // Tamil
  /தற்கொலை/,
  /சாக\s*(வேண்டும்|விரும்பு|போகிறேன்)/,
  // Telugu
  /ఆత్మహత్య/,
  /చనిపోవాల/,
];

function matchesAny(patterns: RegExp[], text: string): boolean {
  return patterns.some((p) => p.test(text));
}

function hasThirdPartySubject(normalized: string): boolean {
  return matchesAny(THIRD_PARTY_SUBJECT_PATTERNS, normalized);
}

/** Third-party risk talk without any first-person disclosure. */
function isThirdPartySafetyDisclosure(normalized: string): boolean {
  if (!hasThirdPartySubject(normalized)) return false;
  return /\b(die|dying|dead|kill|killing|suicide|suicidal|hurt|harm|cut|cutting|overdose|(end|ending|take|taking)\s+(his|her|their)\s+(own\s+)?life|(kill|hurt|harm|cut)\w*\s+(himself|herself|themselves|themself))\b/.test(normalized);
}

/**
 * Evaluates whether a message is an idiom, benign hyperbolic expression,
 * or academic context rather than actual self-harm/suicide.
 * Only consulted AFTER crisis checks, so it can never mask a real disclosure.
 */
function isContextualIdiom(text: string): boolean {
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
    /\b(i\s+(feel|am|m)\s+(so\s+|really\s+)?hopeless)\b/,
    /\b(i\s+dont\s+want\s+to\s+wake\s+up)\b/,
  ];
  return elevatedPatterns.some((p) => p.test(text));
}

/**
 * Authoritative deterministic Server Safety Gate classifier.
 * Never delegates safety-state decisions or crisis classification to Gemini.
 *
 * Order matters: a first-person crisis disclosure is checked BEFORE idioms and
 * third-party context, so "this exam killed me and I want to die" or
 * "my friend left and I am better off dead" are still treated as a crisis.
 */
export function classifyServerSafety(rawMessage: string): SafetyClassificationResult {
  const normalized = normalizeSafetyText(rawMessage);
  const nativeText = (rawMessage || "").normalize("NFC").toLowerCase();

  if (!normalized && !nativeText.trim()) {
    return {
      state: "normal",
      category: "normal",
      isSelfCrisis: false,
      reason: "Empty or whitespace message.",
    };
  }

  // 1. First-person crisis disclosures always win.
  if (matchesAny(SELF_CRISIS_PATTERNS, normalized)) {
    return {
      state: "crisis",
      category: "crisis",
      isSelfCrisis: true,
      reason: "Explicit self-directed suicidal or self-harm disclosure detected.",
    };
  }

  // 2. Generic high-risk phrases (incl. Hinglish / native scripts) unless clearly about someone else.
  const genericRisk =
    matchesAny(GENERIC_CRISIS_PATTERNS, normalized) || matchesAny(NATIVE_SCRIPT_CRISIS_PATTERNS, nativeText);
  if (genericRisk && !hasThirdPartySubject(normalized)) {
    return {
      state: "crisis",
      category: "crisis",
      isSelfCrisis: true,
      reason: "High-risk suicide/self-harm phrase detected without a third-party subject.",
    };
  }

  // 3. Third-party safety disclosure (student is worried about someone else).
  if (genericRisk || isThirdPartySafetyDisclosure(normalized)) {
    return {
      state: "elevated",
      category: "third_party",
      isSelfCrisis: false,
      reason: "Message pertains to third-party safety concern; not authenticated student crisis.",
    };
  }

  // 4. Contextual idioms / hyperbole.
  if (isContextualIdiom(normalized)) {
    return {
      state: "normal",
      category: "contextual_idiom",
      isSelfCrisis: false,
      reason: "Message contains contextual idiom or hyperbolic expression.",
    };
  }

  // 5. Elevated concerning distress.
  if (isElevatedDistress(normalized)) {
    return {
      state: "elevated",
      category: "elevated",
      isSelfCrisis: false,
      reason: "Elevated distress or concerning ideation without explicit suicide intent.",
    };
  }

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
 * - Delivers configured emergency resources (Tele-MANAS / 112, see common/crisisResources.ts)
 * - Avoids judgment, diagnosis, guilt, or emotional dependency
 */
export function getControlledCrisisResponse(
  studentName?: string
): EmotyResponseContract {
  const greeting = studentName ? `${studentName}, ` : "";
  const responseText = `${greeting}I'm really concerned to hear that, and your safety is the most important thing right now. Please connect with someone who can support you immediately. You can reach Tele-MANAS toll-free 24/7 at ${EMERGENCY_RESOURCES.teleManasNumber} (or ${EMERGENCY_RESOURCES.teleManasTollFree}), or call ${EMERGENCY_RESOURCES.emergencyNumber} if you are in immediate danger. Please reach out to them or a trusted friend, family member, or campus counselor right now.`;

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
    response: `Thank you for looking out for your friend. If you believe they are in immediate danger, please encourage them to contact Tele-MANAS at ${EMERGENCY_RESOURCES.teleManasNumber} right away, call ${EMERGENCY_RESOURCES.emergencyNumber} if there is immediate danger, or reach out to campus emergency services or a trusted adult together. You don't have to carry this alone.`,
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
