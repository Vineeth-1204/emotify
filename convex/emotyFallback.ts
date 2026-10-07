/**
 * Emotify AI-3: Robust, Multi-Turn Aware Offline Structured Fallback
 *
 * Guarantees that when Gemini API keys are missing, connections time out,
 * or provider outages occur, Emoty continues to respond intelligently,
 * contextually, and with zero repetitive loops.
 *
 * Adheres strictly to the EmotyResponseContract:
 * { mode, response, action, avatarState }
 */

import {
  type EmotyMode,
  type EmotyResponseContract,
  type EmotyAvatarState,
} from "./emotyContract";
import { type EmotyContext, type EmotySafetyState } from "./emotyContext";
import {
  isUserDecliningOrSettingBoundary,
  isUserEndingConversation,
  determineSemanticIntent,
  enforceConversationalGuardrails,
} from "./emotyIntent";
import { validateAndResolveAction } from "./emotyActionRouter";
import { resolveAvatarPresentationState } from "../common/avatarPresentation";
import { sanitizePlainText } from "./sanitizer";
import {
  type CompanionQuickAction,
  getQuickActionFallback,
} from "./companionQuickActions";
import { DEFAULT_COMPANION_NAME } from "../common/companionName";

export interface BuildFallbackParams {
  userMessage: string;
  context: EmotyContext;
  companionName?: string;
  quickAction?: CompanionQuickAction;
  language?: string;
  safetyState?: EmotySafetyState;
}

export function buildStructuredFallbackResponse(params: BuildFallbackParams): EmotyResponseContract {
  const {
    userMessage,
    context,
    companionName = DEFAULT_COMPANION_NAME,
    quickAction,
    language = "en",
    safetyState = "normal",
  } = params;

  const rawClean = (userMessage || "").trim();
  const lower = rawClean.toLowerCase();
  const recentConvo = context.conversation?.recentMessages || [];
  const userName = context.user?.preferredName;
  const isFirstTurn = recentConvo.length === 0;

  let contract: EmotyResponseContract;

  // 1. Quick Action explicit selection
  if (quickAction) {
    const text = getQuickActionFallback(quickAction, language);
    if (quickAction === "breathing_support") {
      contract = {
        mode: "guidance",
        response: text,
        action: { type: "start_breathing", label: "Start Breathing" },
        avatarState: "breathing",
      };
    } else {
      contract = {
        mode: "emotional_support",
        response: text,
        action: { type: "none" },
        avatarState: "calm",
      };
    }
  }
  // 2. User Boundary or Refusal (MT-05, MT-06, Scenario D)
  else if (isUserDecliningOrSettingBoundary(rawClean)) {
    const nameStr = userName ? `, ${userName}` : "";
    contract = {
      mode: "emotional_support",
      response: `No problem at all${nameStr}. I'm right here whenever you need me.`,
      action: { type: "none" },
      avatarState: "calm",
    };
  }
  // 3. User Ending / Farewell (MT-14, Scenario G)
  else if (isUserEndingConversation(rawClean)) {
    const nameStr = userName ? `, ${userName}` : "";
    contract = {
      mode: "casual",
      response: `Take care${nameStr}! Reach out anytime you want to chat.`,
      action: { type: "none" },
      avatarState: "calm",
    };
  }
  // 4. Explicit Tool / Intervention Requests (MT-10, MT-20, Scenario E)
  else if (
    /\b(breathe|breathing|box\s+breathing|breathwork)\b/i.test(lower) &&
    /\b(help|exercise|start|give|need|want|try|do|can\s+you)\b/i.test(lower)
  ) {
    contract = {
      mode: "guidance",
      response: "Let's take a slow breath together to steady things. You can start the breathing exercise below whenever you're ready.",
      action: { type: "start_breathing", label: "Start Breathing" },
      avatarState: "breathing",
    };
  } else if (
    /\b(grounding|5-4-3-2-1|ground\s+myself)\b/i.test(lower) &&
    /\b(help|exercise|start|give|need|want|try|do|can\s+you)\b/i.test(lower)
  ) {
    contract = {
      mode: "guidance",
      response: "Let's ground your senses and bring your focus back to the present moment.",
      action: { type: "start_grounding", label: "Start Grounding" },
      avatarState: "calm",
    };
  } else if (
    /\b(reframe|negative\s+thought|thought\s+record)\b/i.test(lower) &&
    /\b(help|exercise|start|give|need|want|try|do|can\s+you)\b/i.test(lower)
  ) {
    contract = {
      mode: "guidance",
      response: "Let's look at this thought together from a calmer perspective.",
      action: { type: "start_reframe", label: "Thought Reframe" },
      avatarState: "thinking",
    };
  }
  // 5. Short Continuation Acknowledgments ("Yeah, exactly.", "Right", "Exactly", "Totally") (MT-15)
  else if (
    /^(yeah|yep|yes|exactly|right|totally|true|definitely)\.?,?(\s+(yeah|exactly|right|true|totally))?\.?$/i.test(
      lower
    )
  ) {
    // Check recent conversational topic
    const pastUserTurns = recentConvo.filter((m) => m.role === "user").map((m) => m.content.toLowerCase());
    const hadAcademicOrFocusStress = pastUserTurns.some((c) =>
      /\b(focus|study|midterm|exam|behind|overwhelm|assignment)\b/i.test(c)
    );

    if (hadAcademicOrFocusStress) {
      contract = {
        mode: "emotional_support",
        response: "I completely get it. Don't be too hard on yourself for feeling stuck right now. Just taking it one small piece at a time is enough.",
        action: { type: "none" },
        avatarState: "supportive",
      };
    } else {
      contract = {
        mode: "emotional_support",
        response: "I hear you. Take things at your own pace, and let me know if you want to talk through anything specific.",
        action: { type: "none" },
        avatarState: "supportive",
      };
    }
  }
  // 6. Relief / Helpful Confirmation ("Just talking about it helped a bit.")
  else if (
    /\b(talking(\s+about\s+it)?\s+helped|helped(\s+a\s+bit)?|feel(\s+a\s+bit)?\s+better|good\s+to\s+talk)\b/i.test(
      lower
    )
  ) {
    contract = {
      mode: "emotional_support",
      response: "I'm really glad talking through it took a little weight off. I'm right here whenever you need a safe space to vent.",
      action: { type: "none" },
      avatarState: "calm",
    };
  }
  // 7. Elevated Distress or Concerning Hopelessness (Safety Architecture)
  else if (
    safetyState === "elevated" ||
    /\b(everything\s+(feels|is)\s+pointless|feel\s+like\s+everything\s+(is|feels)\s+pointless|pointless|hopeless|giving\s+up\s+on\s+everything|can'?t\s+take\s+this\s+anymore)\b/i.test(
      lower
    )
  ) {
    contract = {
      mode: "emotional_support",
      response:
        "When things feel so heavy that everything seems pointless, it can be exhausting just getting through the day. I want you to know that your feelings are heard and you don't have to carry this completely on your own. Would you like to talk a bit more about what's feeling so heavy, or would it help to connect with a campus counselor or someone you trust?",
      action: { type: "open_counsellor_request", label: "Talk to a Counselor" },
      avatarState: "supportive",
    };
  }
  // 8. Sleep Disruption & Multi-Turn Connection to Academic Stress
  else if (
    /\b(sleep|sleeping|insomnia|can'?t\s+sleep|trouble\s+sleeping|staying\s+awake|restless\s+night)\b/i.test(
      lower
    )
  ) {
    const pastUserTurns = recentConvo
      .filter((m) => m.role === "user")
      .map((m) => m.content.toLowerCase());
    const hadAcademicStress = pastUserTurns.some((c) =>
      /\b(midterm|midterms|exam|exams|study|studying|behind|focus|college|assignment|assignments)\b/i.test(
        c
      )
    );

    if (hadAcademicStress) {
      contract = {
        mode: "emotional_support",
        response:
          "It's so common for midterm and academic stress to follow you into the night and make sleeping difficult. When your mind is racing with study worries, falling asleep can feel nearly impossible. Have you been able to take any wind-down time before trying to sleep?",
        action: { type: "none" },
        avatarState: "supportive",
      };
    } else {
      contract = {
        mode: "emotional_support",
        response:
          "Trouble sleeping can make everything else feel ten times harder the next day. Take it gently tonight. Has your sleep been off for a few days, or did something specific keep your mind racing?",
        action: { type: "none" },
        avatarState: "tired",
      };
    }
  }
  // 9. Academic / Midterm / Study Focus Stress (MT-01, MT-02)
  else if (/\b(focus|trouble\s+focusing|can'?t\s+focus|sit\s+down\s+to\s+study)\b/i.test(lower)) {
    const pastUserTurns = recentConvo
      .filter((m) => m.role === "user")
      .map((m) => m.content.toLowerCase());
    const hadAcademicStress = pastUserTurns.some((c) =>
      /\b(midterm|midterms|exam|exams|behind|overwhelm|assignment)\b/i.test(c)
    );

    if (hadAcademicStress) {
      contract = {
        mode: "emotional_support",
        response:
          "When you're already feeling behind on midterms, sitting down to study creates so much extra pressure that focusing becomes even harder. You don't have to tackle the whole mountain right now. What's one small 10-minute task you could look at, or do you need a quick break first?",
        action: { type: "none" },
        avatarState: "supportive",
      };
    } else {
      contract = {
        mode: "emotional_support",
        response:
          "When you sit down to study and your brain just refuses to focus, it can feel so frustrating. Often that happens when our minds are overloaded or running on empty. What are you trying to work on right now?",
        action: { type: "none" },
        avatarState: "supportive",
      };
    }
  } else if (/\b(college|university|school|classes|semester)\b/i.test(lower) && /\b(overwhelm|overwhelmed|overwhelming|stress|too\s+much)\b/i.test(lower)) {
    contract = {
      mode: "emotional_support",
      response:
        "College can feel like a nonstop balancing act with classes, exams, and expectations all hitting at once. It's completely valid to feel overwhelmed by it. What's taking up the biggest chunk of your energy right now?",
      action: { type: "none" },
      avatarState: "supportive",
    };
  } else if (/\b(roommate|roommates)\b/i.test(lower) && /\b(argument|fight|dispute|conflict|upset|yelled)\b/i.test(lower)) {
    contract = {
      mode: "emotional_support",
      response:
        "Roommate conflicts can be especially draining because your living space is supposed to be where you decompress. It's completely understandable to feel shaken up after an argument. Do you want to vent about what happened, or take a minute to clear your head?",
      action: { type: "none" },
      avatarState: "supportive",
    };
  } else if (/\b(midterm|midterms|exam|exams|behind|assignments?\s+piling)\b/i.test(lower)) {
    contract = {
      mode: "emotional_support",
      response: "Midterms can put so much pressure on you, especially when you feel like you're falling behind. That stress is completely understandable.",
      action: { type: "none" },
      avatarState: "worried",
    };
  } else if (/\b(overwhelmed|overwhelming|too\s+much)\b/i.test(lower)) {
    contract = {
      mode: "emotional_support",
      response: "I'm really sorry things have felt so overwhelming. It takes a lot out of you when everything piles up at once.",
      action: { type: "none" },
      avatarState: "supportive",
    };
  } else if (/\b(exhausted|tired|drained|burnout|burned\s+out)\b/i.test(lower)) {
    contract = {
      mode: "emotional_support",
      response: "Sounds like you've had a really draining day. Make sure you give yourself permission to rest and recharge.",
      action: { type: "none" },
      avatarState: "tired",
    };
  } else if (/\b(roommate|roommates|friend|argument|fight|upset)\b/i.test(lower)) {
    contract = {
      mode: "emotional_support",
      response: "Arguments like that can leave things feeling so tense and uncomfortable. I'm here to listen if you want to let it out.",
      action: { type: "none" },
      avatarState: "supportive",
    };
  } else if (/\b(sad|depressed|lonely|down|crying)\b/i.test(lower)) {
    contract = {
      mode: "emotional_support",
      response: "I'm so sorry you're feeling down right now. You don't have to carry it all alone; I'm here with you.",
      action: { type: "none" },
      avatarState: "sad",
    };
  }
  // 8. Casual Greetings (MT-08, Scenario B)
  else if (/^\s*(hi|hello|hey|hey\s+there|what'?s\s+up|good\s+(morning|afternoon|evening))\b/i.test(lower)) {
    if (isFirstTurn) {
      // First turn introduction
      const namePart = userName ? `${userName}! ` : "";
      contract = {
        mode: "casual",
        response: getMultiTurnFallbackGreeting(companionName, userName),
        action: { type: "none" },
        avatarState: "happy",
      };
    } else {
      // Multi-turn active conversation greeting: NEVER repeat introduction!
      contract = {
        mode: "casual",
        response: `Hey${userName ? " " + userName : ""}! What's on your mind?`,
        action: { type: "none" },
        avatarState: "calm",
      };
    }
  }
  // 9. Casual Conversation / Daily Activities (MT-07 topic switch, Scenario B)
  else if (/\b(lunch|walk|weather|sunny|cricket|game|music|movie)\b/i.test(lower)) {
    if (/\b(walk|weather|sunny)\b/i.test(lower)) {
      contract = {
        mode: "casual",
        response: "A walk sounds like a great way to enjoy the weather and clear your head!",
        action: { type: "none" },
        avatarState: "happy",
      };
    } else if (/\b(cricket|game)\b/i.test(lower)) {
      contract = {
        mode: "casual",
        response: "There have been some exciting cricket matches lately! Are you following a particular team?",
        action: { type: "none" },
        avatarState: "happy",
      };
    } else {
      contract = {
        mode: "casual",
        response: "That sounds like a nice break from your routine! How is the rest of your day looking?",
        action: { type: "none" },
        avatarState: "calm",
      };
    }
  }
  // 10. Out of scope general knowledge/trivia (MT-19)
  else if (
    /\b(who\s+discovered|who\s+invented|calculate|what\s+is\s+\d+|solve|write\s+a\s+function)\b/i.test(lower)
  ) {
    contract = {
      mode: "out_of_scope",
      response: "That's a little outside my lane! I'm mainly here to help with how you're feeling, your goals, and things you can work on in Emotify.",
      action: { type: "none" },
      avatarState: "calm",
    };
  }
  // 11. Contextual Exception: Academic stress with science terms (MT-18)
  else if (/\b(newton'?s\s+laws?|physics|calculus|chemistry)\b/i.test(lower)) {
    contract = {
      mode: "emotional_support",
      response: "It's so frustrating when a tough concept just isn't clicking, especially with deadlines hanging over you. Remember that getting stuck on a hard topic doesn't mean you can't figure it out.",
      action: { type: "none" },
      avatarState: "supportive",
    };
  }
  // 12. Default safe, multi-turn aware fallback
  else {
    contract = {
      mode: "emotional_support",
      response: "I'm listening and I'm right here with you. What feels most important for you right now?",
      action: { type: "none" },
      avatarState: "supportive",
    };
  }

  // Apply Conversational Guardrails (strips trailing questions on boundaries/closings, neutralizes unwanted tool offers)
  contract = enforceConversationalGuardrails(contract, userMessage, context);

  // Authoritative Action Router validation
  const actionRes = validateAndResolveAction(contract.action, safetyState);
  contract.action = actionRes.valid ? actionRes.action : { type: "none" };

  // Authoritative Avatar Presentation resolution
  contract.avatarState = resolveAvatarPresentationState({
    safetyState,
    mode: contract.mode,
    action: contract.action,
    explicitAvatarState: contract.avatarState,
    defaultState: "calm",
  });

  // Plaintext sanitization
  contract.response = sanitizePlainText(contract.response);

  return contract;
}

/**
 * Helper to build an initial greeting adhering strictly to the user name vs companion name separation:
 * - companionName defaults to "Emoty" (or custom, e.g. "Bro")
 * - userName optional (e.g. "Alex")
 * - If userName provided: "Hi Alex! I'm Bro, your AI companion. What's on your mind today?"
 * - If no userName: "Hi, I'm Bro, your AI companion. What's on your mind today?"
 */
export function getMultiTurnFallbackGreeting(companionName: string = DEFAULT_COMPANION_NAME, userName?: string): string {
  if (userName && userName.trim().length > 0) {
    return `Hi ${userName.trim()}! I'm ${companionName}, your AI companion. What's on your mind today?`;
  }
  return `Hi, I'm ${companionName}, your AI companion. What's on your mind today?`;
}

