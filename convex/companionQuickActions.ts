export const COMPANION_QUICK_ACTIONS = [
  "continue_conversation",
  "breathing_support",
  "reflection",
  "gratitude",
] as const;

export type CompanionQuickAction = (typeof COMPANION_QUICK_ACTIONS)[number];
export type CompanionLanguage = "en" | "hi" | "ta" | "te";

const FALLBACKS: Record<CompanionLanguage, Record<CompanionQuickAction, string>> = {
  en: {
    continue_conversation: "Of course. What part of what you just shared would you like to explore more?",
    breathing_support: "Let's take a short breathing break together. Tap below when you're ready to begin.",
    reflection: "Let's pause and look at what happened and how it affected you. What feels most important to notice?",
    gratitude: "Let's think of one small thing that felt good today. What comes to mind?",
  },
  hi: {
    continue_conversation: "बिलकुल। आपने अभी जो साझा किया, उसमें किस हिस्से पर और बात करना चाहेंगे?",
    breathing_support: "आइए, साथ में थोड़ी देर साँस पर ध्यान दें। शुरू करने के लिए नीचे टैप करें।",
    reflection: "आइए रुककर देखें कि क्या हुआ और उसका आप पर क्या असर पड़ा। अभी आपको क्या सबसे ज़रूरी लगता है?",
    gratitude: "आइए आज की किसी एक छोटी अच्छी बात के बारे में सोचें। आपके मन में क्या आता है?",
  },
  ta: {
    continue_conversation: "நிச்சயமாக. நீங்கள் இப்போது பகிர்ந்ததில் எந்தப் பகுதியைப் பற்றி மேலும் பேச விரும்புகிறீர்கள்?",
    breathing_support: "சிறிது நேரம் மூச்சுப் பயிற்சி செய்வோம். தொடங்கத் தயாரானதும் கீழே தட்டுங்கள்.",
    reflection: "நடந்ததைப் பற்றியும் அது உங்களை எப்படி பாதித்தது என்பதையும் சற்று பார்ப்போம். இப்போது முக்கியமாகத் தோன்றுவது எது?",
    gratitude: "இன்று நன்றாக இருந்த ஒரு சிறிய விஷயத்தை நினைத்துப் பார்ப்போம். உங்கள் நினைவுக்கு வருவது எது?",
  },
  te: {
    continue_conversation: "తప్పకుండా. మీరు ఇప్పుడే పంచుకున్న దాంట్లో ఏ విషయం గురించి ఇంకా మాట్లాడాలనుకుంటున్నారు?",
    breathing_support: "కొద్దిసేపు కలిసి శ్వాసపై దృష్టి పెట్టుకుందాం. ప్రారంభించడానికి సిద్ధమైనప్పుడు కింద నొక్కండి.",
    reflection: "ఏం జరిగిందో, అది మీపై ఎలా ప్రభావం చూపిందో కాసేపు ఆలోచిద్దాం. ఇప్పుడు ముఖ్యంగా అనిపిస్తున్నది ఏమిటి?",
    gratitude: "ఈ రోజు బాగున్న ఒక చిన్న విషయాన్ని గుర్తు చేసుకుందాం. మీకు ఏమి గుర్తొస్తోంది?",
  },
};

const MODEL_GUIDANCE: Record<CompanionQuickAction, string> = {
  continue_conversation: "Continue from the user's most recent message in the conversation. Refer to the specific thing they shared and ask one relevant follow-up; do not restart with a generic invitation.",
  breathing_support: "The user chose a breathing break. Acknowledge that choice and invite them to start the short breathing activity. Do not respond with a generic request to tell you more.",
  reflection: "The user chose reflection. Guide them with one gentle question about what happened or how it affected them. Do not switch to generic listening text.",
  gratitude: "The user chose gratitude. Guide them to name one small thing they appreciate or that felt good today. Do not switch to generic listening text.",
};

export function getQuickActionFallback(action: CompanionQuickAction, language: string | undefined): string {
  const supportedLanguage = language && language in FALLBACKS ? language as CompanionLanguage : "en";
  return FALLBACKS[supportedLanguage][action];
}

export function getQuickActionModelGuidance(action: CompanionQuickAction): string {
  return MODEL_GUIDANCE[action];
}
