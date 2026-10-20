/**
 * Emotify CBT/REBT Thinking Pattern Library, Support Mode, and Positive Growth Catalog
 * Source: Emotify Project Specification, EMOTIFY CBT MODULE.docx, cognitive distortion.docx, Positive Growth Path.docx
 */

export interface ThinkingPattern {
  id: string; // TP01 - TP15
  name: string;
  studentStatements: string[];
  challengeQuestions: [string, string, string]; // Verbatim 3 challenge questions
  reflectionQuestion: string;
  suggestedNewThoughts: [string, string, string]; // Options 1, 2, and mandatory Option 3 autonomy chip
}

export const MANDATORY_AUTONOMY_OPTION = "I'm not ready to change my thought yet.";

export const THINKING_PATTERNS: Record<string, ThinkingPattern> = {
  TP01: {
    id: "TP01",
    name: "Mental Filtering",
    studentStatements: [
      "I only remember the bad things.",
      "Nothing went well today.",
      "I only think about my mistakes.",
      "I can't see anything good.",
      "Everything feels bad.",
    ],
    challengeQuestions: [
      "Did anything good happen today, even a little?",
      "Are you only looking at the bad part?",
      "If your friend had the same day, what good thing would you remind them about?",
    ],
    reflectionQuestion: "Do you think you may have forgotten the good parts?",
    suggestedNewThoughts: [
      "Some things went wrong, but some things also went well.",
      "One bad moment doesn't make the whole day bad.",
      MANDATORY_AUTONOMY_OPTION,
    ],
  },
  TP02: {
    id: "TP02",
    name: "Black-and-White Thinking",
    studentStatements: [
      "If I'm not perfect, I failed.",
      "I either win or lose.",
      "One mistake means everything is ruined.",
      "It has to be all good or all bad.",
      "There is no middle.",
    ],
    challengeQuestions: [
      "Does everything have to be perfect?",
      "Can something still be good even if it has a few mistakes?",
      "What is one thing you did well today?",
    ],
    reflectionQuestion: 'Could there be a middle answer instead of only "all good" or "all bad"?',
    suggestedNewThoughts: [
      "I don't have to be perfect to do well.",
      "I can make mistakes and still learn.",
      MANDATORY_AUTONOMY_OPTION,
    ],
  },
  TP03: {
    id: "TP03",
    name: "Overgeneralization",
    studentStatements: [
      "This always happens to me.",
      "I never do anything right.",
      "I'll always fail.",
      "Nothing will ever change.",
      "Bad things always happen to me.",
    ],
    challengeQuestions: [
      "Has this happened every single time?",
      "Can you remember one time when things went better?",
      "Could this be just one bad day instead of every day?",
    ],
    reflectionQuestion: 'Could you be using words like "always" or "never" when they may not be true?',
    suggestedNewThoughts: [
      "This happened today, but it may not happen every time.",
      "One bad day doesn't decide my future.",
      MANDATORY_AUTONOMY_OPTION,
    ],
  },
  TP04: {
    id: "TP04",
    name: "Jumping to Conclusions",
    studentStatements: [
      "I know they don't like me.",
      "Everyone is judging me.",
      "I know what they're thinking.",
      "They ignored me on purpose.",
      "They must be angry with me.",
    ],
    challengeQuestions: [
      "Did they actually tell you that?",
      "Could there be another reason for what happened?",
      "Are you guessing, or do you really know?",
    ],
    reflectionQuestion: "Could your mind be guessing instead of knowing the truth?",
    suggestedNewThoughts: [
      "I don't know what others are thinking unless they tell me.",
      "There could be another reason for what happened.",
      MANDATORY_AUTONOMY_OPTION,
    ],
  },
  TP05: {
    id: "TP05",
    name: "Catastrophizing",
    studentStatements: [
      "Everything is ruined.",
      "My future is over.",
      "The worst is going to happen.",
      "This is a disaster.",
      "Nothing can get better now.",
    ],
    challengeQuestions: [
      "Is your mind thinking about the worst thing that could happen?",
      "Has the worst thing happened every time before?",
      "What is one other thing that could happen besides the worst?",
    ],
    reflectionQuestion: "Could this problem be smaller than your mind is telling you right now?",
    suggestedNewThoughts: [
      "This is hard, but it doesn't mean everything is ruined.",
      "I don't know what will happen yet, and that's okay.",
      MANDATORY_AUTONOMY_OPTION,
    ],
  },
  TP06: {
    id: "TP06",
    name: "Personalization",
    studentStatements: [
      "This is all my fault.",
      "I always mess things up.",
      "They are upset because of me.",
      "I caused this problem.",
      "Everything is my responsibility.",
    ],
    challengeQuestions: [
      "Are you sure this is completely your fault?",
      "Could there be other reasons for what happened?",
      "If your friend was in this situation, would you blame them fully?",
    ],
    reflectionQuestion: "Could you be blaming yourself too much?",
    suggestedNewThoughts: [
      "This may not be fully my fault.",
      "There could be other reasons for what happened.",
      MANDATORY_AUTONOMY_OPTION,
    ],
  },
  TP07: {
    id: "TP07",
    name: "Mind Reading",
    studentStatements: [
      "They think I'm not good enough.",
      "I know they don't like me.",
      "They must be judging me.",
      "Everyone thinks I'm weird.",
      "They are talking about me.",
    ],
    challengeQuestions: [
      "Did they actually say that to you?",
      "Could you be guessing what they think?",
      "Is there another possible explanation?",
    ],
    reflectionQuestion: "Could your mind be guessing instead of knowing?",
    suggestedNewThoughts: [
      "I don't know what others think unless they tell me.",
      "I might be guessing, and that's okay.",
      MANDATORY_AUTONOMY_OPTION,
    ],
  },
  TP08: {
    id: "TP08",
    name: "Fortune Telling",
    studentStatements: [
      "I know this will go badly.",
      "I'm going to fail.",
      "Nothing will work out.",
      "This will end badly.",
      "I already know the result.",
    ],
    challengeQuestions: [
      "Can you really know the future for sure?",
      "Has this always happened before?",
      "What is another possible outcome?",
    ],
    reflectionQuestion: "Could you be predicting the future without knowing it?",
    suggestedNewThoughts: [
      "I don't know what will happen yet.",
      "Things could turn out better than I expect.",
      MANDATORY_AUTONOMY_OPTION,
    ],
  },
  TP09: {
    id: "TP09",
    name: "Emotional Reasoning",
    studentStatements: [
      "I feel scared, so something bad must happen.",
      "I feel like a failure, so I must be one.",
      "I feel nervous, so I can't do this.",
      "My feelings must be true.",
      "I feel it, so it must be real.",
    ],
    challengeQuestions: [
      "Does feeling something always make it true?",
      "Can feelings change over time?",
      "What would you say to a friend who feels this way?",
    ],
    reflectionQuestion: "Could your feelings be strong but not always true?",
    suggestedNewThoughts: [
      "My feelings are real, but they may not be facts.",
      "I can feel this way and still try.",
      MANDATORY_AUTONOMY_OPTION,
    ],
  },
  TP10: {
    id: "TP10",
    name: "Labeling",
    studentStatements: [
      "I'm a failure.",
      "I'm stupid.",
      "I'm not good enough.",
      "I'm useless.",
      "I'm bad at everything.",
    ],
    challengeQuestions: [
      "Are you judging your whole self based on one thing?",
      "Can one mistake define who you are?",
      "What is one good thing about you?",
    ],
    reflectionQuestion: "Could you be being too harsh on yourself?",
    suggestedNewThoughts: [
      "I made a mistake, but that doesn't define me.",
      "I have strengths and I can improve.",
      MANDATORY_AUTONOMY_OPTION,
    ],
  },
  TP11: {
    id: "TP11",
    name: "Should Statements",
    studentStatements: [
      "I should always do everything right.",
      "I must not make mistakes.",
      "I should be better than this.",
      "I have to do this perfectly.",
      "I shouldn't feel this way.",
    ],
    challengeQuestions: [
      "Do you have to be perfect all the time?",
      "Is it okay to try your best instead of being perfect?",
      "What would you say to a friend who feels this way?",
    ],
    reflectionQuestion: "Could you be putting too much pressure on yourself?",
    suggestedNewThoughts: [
      "I can try my best, and that's enough.",
      "It's okay to make mistakes and learn.",
      MANDATORY_AUTONOMY_OPTION,
    ],
  },
  TP12: {
    id: "TP12",
    name: "Discounting the Positive",
    studentStatements: [
      "That doesn't count.",
      "Anyone could have done that.",
      "It wasn't a big deal.",
      "I just got lucky.",
      "It doesn't matter.",
    ],
    challengeQuestions: [
      "Did something good happen, even if it feels small?",
      "Would you say the same thing to a friend?",
      "Could this actually be something to feel good about?",
    ],
    reflectionQuestion: "Could you be ignoring the good things?",
    suggestedNewThoughts: [
      "This does count, even if it's small.",
      "I can notice and feel good about my effort.",
      MANDATORY_AUTONOMY_OPTION,
    ],
  },
  TP13: {
    id: "TP13",
    name: "Blaming Others",
    studentStatements: [
      "It's all their fault.",
      "They made me feel this way.",
      "I wouldn't feel like this if they didn't do that.",
      "They are the reason this happened.",
      "It's not my responsibility at all.",
    ],
    challengeQuestions: [
      "Is everything really someone else's fault?",
      "Do you have any part in what happened?",
      "What can you control in this situation?",
    ],
    reflectionQuestion: "Could you be blaming others too much?",
    suggestedNewThoughts: [
      "I can take responsibility for my part.",
      "I can focus on what I can control.",
      MANDATORY_AUTONOMY_OPTION,
    ],
  },
  TP14: {
    id: "TP14",
    name: "Unfair Comparisons",
    studentStatements: [
      "Everyone is better than me.",
      "I'm not as good as them.",
      "They are smarter than me.",
      "I will never be like them.",
      "I'm worse than everyone else.",
    ],
    challengeQuestions: [
      "Are you comparing yourself to only the best people?",
      "Does everyone have different strengths?",
      "What is one thing you are good at?",
    ],
    reflectionQuestion: "Could you be comparing yourself in an unfair way?",
    suggestedNewThoughts: [
      "Everyone has different strengths, including me.",
      "I can improve at my own pace.",
      MANDATORY_AUTONOMY_OPTION,
    ],
  },
  TP15: {
    id: "TP15",
    name: "Control Fallacy",
    studentStatements: [
      "I have no control over anything.",
      "Everything depends on me.",
      "I can't change anything.",
      "It's all up to me.",
      "Nothing I do matters.",
    ],
    challengeQuestions: [
      "Is everything really in your control or out of your control?",
      "What is one small thing you can control right now?",
      "What is something you cannot control?",
    ],
    reflectionQuestion: "Could you be thinking in extremes about control?",
    suggestedNewThoughts: [
      "Some things I can control, and some things I can't.",
      "I can focus on what I can do right now.",
      MANDATORY_AUTONOMY_OPTION,
    ],
  },
};

/**
 * 13-Step Thought Processing Flow Steps
 */
export const CBT_STEPS = [
  { index: 1, id: "situation", title: "Situation", prompt: "What happened recently that's on your mind?" },
  { index: 2, id: "emotion", title: "Emotion", prompt: "Which of these feels closest to what you're feeling?" },
  { index: 3, id: "emotion_before", title: "Initial Intensity", prompt: "How strong is this feeling right now (0 to 10)?" },
  { index: 4, id: "automatic_thought", title: "Automatic Thought", prompt: "What thought popped into your mind when this happened?" },
  { index: 5, id: "belief_before", title: "Belief Strength", prompt: "How much do you believe this thought right now (0 to 100%)?" },
  { index: 6, id: "pattern_identification", title: "Pattern Check", prompt: "Let's investigate how your mind is looking at this." },
  { index: 7, id: "guided_discovery", title: "Guided Discovery", prompt: "Let's explore this together with a few gentle questions." },
  { index: 8, id: "reflection", title: "Reflection", prompt: "Reflecting on everything we explored, what do you think now?" },
  { index: 9, id: "balanced_thought", title: "Balanced Thought", prompt: "Here are a few ways you could look at it instead. Pick whichever feels most true to you:" },
  { index: 10, id: "belief_score", title: "New Thought Belief", prompt: "How much do you believe this new thought (0 to 100%)?" },
  { index: 11, id: "emotion_after", title: "Re-rate Feeling", prompt: "How strong is that original feeling now (0 to 10)?" },
  { index: 12, id: "behavioural_activation", title: "Next Step", prompt: "Thinking about it differently is great — now let's back it up with one small action:" },
  { index: 13, id: "positive_closure", title: "Closure", prompt: "You took time to understand your thoughts today. Every small step helps your brain build healthier thinking habits. 💛" },
] as const;

export type CbtStepId = typeof CBT_STEPS[number]["id"];

/**
 * Support Mode activities when the student is not ready or AI cannot match a distortion
 */
export interface SupportActivity {
  id: "breathing" | "grounding" | "free_writing" | "emotion_cards" | "micro_goal";
  title: string;
  description: string;
  icon: string;
  duration: string;
}

export const SUPPORT_ACTIVITIES: SupportActivity[] = [
  {
    id: "breathing",
    title: "🌿 Breathing Exercise",
    description: "Let's spend one minute taking slow breaths together.",
    icon: "leaf-outline",
    duration: "1 min",
  },
  {
    id: "grounding",
    title: "🧘 Grounding Exercise",
    description: "Let's notice five things you can see around you.",
    icon: "flower-outline",
    duration: "3 min",
  },
  {
    id: "free_writing",
    title: "📝 Free Writing",
    description: "Write anything that comes to mind. No right or wrong answers.",
    icon: "create-outline",
    duration: "5 min",
  },
  {
    id: "emotion_cards",
    title: "😊 Emotion Cards",
    description: "Tap an emoji to express how you feel without writing words.",
    icon: "happy-outline",
    duration: "1 min",
  },
  {
    id: "micro_goal",
    title: "💧 Gentle Action",
    description: "Drink one glass of water or take a peaceful 2-minute pause.",
    icon: "water-outline",
    duration: "2 min",
  },
];

/**
 * 6-Step Positive Growth Path (When No Distortion Found + Positive Mood)
 */
export interface PositiveGrowthStep {
  step: number;
  id: "reflection" | "strength" | "gratitude" | "emotion" | "growth" | "save";
  title: string;
  purpose: string;
  prompt: string;
  placeholder: string;
}

export const POSITIVE_GROWTH_STEPS: PositiveGrowthStep[] = [
  {
    step: 1,
    id: "reflection",
    title: "Positive Reflection",
    purpose: "Increase awareness of positive moments",
    prompt: "That's nice to hear 😊 What was the best part of your day?",
    placeholder: "e.g., Spent time with friends, finished an exam...",
  },
  {
    step: 2,
    id: "strength",
    title: "Strength Identification",
    purpose: "Build self-confidence",
    prompt: "What is one thing you did today that you feel good about?",
    placeholder: "e.g., I stayed patient, I helped someone, I tried my best...",
  },
  {
    step: 3,
    id: "gratitude",
    title: "Gratitude Practice",
    purpose: "Strengthen positive attention",
    prompt: "What is one small thing you are thankful for today?",
    placeholder: "e.g., Nice weather, good food, a supportive friend...",
  },
  {
    step: 4,
    id: "emotion",
    title: "Positive Emotion Awareness",
    purpose: "Improve emotional recognition",
    prompt: "What feeling would you like to remember from today?",
    placeholder: "e.g., Calm, proud, joyful, relaxed...",
  },
  {
    step: 5,
    id: "growth",
    title: "Growth Question",
    purpose: "Build future motivation",
    prompt: "What is one small thing you want to continue tomorrow?",
    placeholder: "e.g., Take another walk, keep that positive attitude...",
  },
  {
    step: 6,
    id: "save",
    title: "Save Positive Memory",
    purpose: "Create positive journal",
    prompt: "Noticing good moments helps your mind remember your strengths. Save this moment and come back to it whenever you need encouragement.",
    placeholder: "",
  },
];
