/**
 * Emotify Symptom-Based MicroGoal Engine Catalog & Domain Logic
 * Source: Emotify Project Specification & Priyanka App Specification (Sections 7 & Final Section)
 */

export type IntensityAnchor = "A little" | "Some" | "A lot" | "Overwhelming";
export type IntensityGroup = "light_some" | "intense_overwhelming";

export function mapAnchorToGroup(anchor: string | number): IntensityGroup {
  if (typeof anchor === "number") {
    // 1-2 = light_some, 3-4 = intense_overwhelming, or 1-5 / 6-10 scale
    return anchor <= 2 || (anchor <= 5 && anchor > 2) ? "light_some" : "intense_overwhelming";
  }
  const clean = String(anchor).trim().toLowerCase();
  if (clean.includes("little") || clean.includes("some") || clean.includes("mild") || clean.includes("low") || clean.includes("light")) {
    return "light_some";
  }
  return "intense_overwhelming";
}

export interface MicroGoalItem {
  id: string;
  category: string;
  title: string;
  description: string;
  durationMinutes: number;
  timeLabel: string;
  whyItHelps?: string;
  difficulty?: "easy" | "medium" | "hard";
  points: number; // +1 Calm Point standard
}

// Complete Master MicroGoal Library
export const MICROGOALS_CATALOGUE: Record<string, MicroGoalItem> = {
  // Category 1: Physical Activation (PA)
  PA01: { id: "PA01", category: "physical_activation", title: "Drink one glass of water", description: "Drink one full glass of water slowly to hydrate and reset.", durationMinutes: 1, timeLabel: "1 min", points: 1, difficulty: "easy" },
  PA02: { id: "PA02", category: "physical_activation", title: "Stand up and stretch your body", description: "Stand up, roll your shoulders, and gently stretch your arms.", durationMinutes: 2, timeLabel: "2 min", points: 1, difficulty: "easy" },
  PA03: { id: "PA03", category: "physical_activation", title: "Walk for 5 minutes", description: "Take a gentle 5-minute walk, indoors or outdoors.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  PA04: { id: "PA04", category: "physical_activation", title: "Open your window and get fresh air", description: "Open a window, take a deep breath of fresh air.", durationMinutes: 2, timeLabel: "2 min", points: 1, difficulty: "easy" },
  PA05: { id: "PA05", category: "physical_activation", title: "Wash your face with cold water", description: "Splash cool water on your face to activate your dive reflex and refresh.", durationMinutes: 2, timeLabel: "2 min", points: 1, difficulty: "easy" },
  PA06: { id: "PA06", category: "physical_activation", title: "Make your bed", description: "Tidy your bed to create an immediate sense of small order.", durationMinutes: 3, timeLabel: "3 min", points: 1, difficulty: "easy" },
  PA07: { id: "PA07", category: "physical_activation", title: "Take a shower", description: "Take a warm or cool shower to relax your muscles.", durationMinutes: 10, timeLabel: "10 min", points: 1, difficulty: "easy" },
  PA08: { id: "PA08", category: "physical_activation", title: "Eat one healthy meal today", description: "Have a nourishing meal with protein and hydration.", durationMinutes: 15, timeLabel: "15 min", points: 1, difficulty: "medium" },
  PA09: { id: "PA09", category: "physical_activation", title: "Sleep at your planned bedtime tonight", description: "Head to bed at your intended time tonight.", durationMinutes: 15, timeLabel: "Evening", points: 1, difficulty: "medium" },
  PA10: { id: "PA10", category: "physical_activation", title: "Spend 10 minutes in sunlight", description: "Step outside into the sunlight for 10 minutes to reset your circadian rhythm.", durationMinutes: 10, timeLabel: "10 min", points: 1, difficulty: "easy" },

  // Category 2: Anxiety Reduction (AN)
  AN01: { id: "AN01", category: "anxiety_reduction", title: "Take 10 slow deep breaths", description: "Inhale slowly for 4 seconds, hold for 2, exhale for 6.", durationMinutes: 2, timeLabel: "2 min", points: 1, difficulty: "easy" },
  AN02: { id: "AN02", category: "anxiety_reduction", title: "Try the 5-4-3-2-1 grounding exercise", description: "Notice 5 things you see, 4 you feel, 3 you hear, 2 you smell, 1 you taste.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  AN03: { id: "AN03", category: "anxiety_reduction", title: "Sit quietly for 2 minutes without your phone", description: "Put your phone down and sit peacefully for two quiet minutes.", durationMinutes: 2, timeLabel: "2 min", points: 1, difficulty: "easy" },
  AN04: { id: "AN04", category: "anxiety_reduction", title: "Listen to calming music", description: "Play a calming instrumental track or gentle ambient sounds.", durationMinutes: 10, timeLabel: "10 min", points: 1, difficulty: "easy" },
  AN05: { id: "AN05", category: "anxiety_reduction", title: "Do progressive muscle relaxation", description: "Tense and then release each muscle group from head to toe.", durationMinutes: 10, timeLabel: "10 min", points: 1, difficulty: "medium" },
  AN06: { id: "AN06", category: "anxiety_reduction", title: "Spend 5 minutes focusing only on your breathing", description: "Close your eyes and follow the rhythm of your breath.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  AN07: { id: "AN07", category: "anxiety_reduction", title: "Write down your biggest worry", description: "Put your main worry on paper to get it out of your head.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  AN08: { id: "AN08", category: "anxiety_reduction", title: "Challenge one worrying thought using CBT", description: "Use the Emotify thought processing tool to reframe one anxious thought.", durationMinutes: 10, timeLabel: "10 min", points: 1, difficulty: "medium" },

  // Category 3: Behavioural Activation (BA)
  BA01: { id: "BA01", category: "behavioural_activation", title: "Complete one small task you've been avoiding", description: "Pick one tiny task on your mind and complete it right now.", durationMinutes: 10, timeLabel: "10 min", points: 1, difficulty: "medium" },
  BA02: { id: "BA02", category: "behavioural_activation", title: "Organize your study table", description: "Clear away unnecessary papers and arrange your desk space.", durationMinutes: 10, timeLabel: "10 min", points: 1, difficulty: "easy" },
  BA03: { id: "BA03", category: "behavioural_activation", title: "Read one page of a book", description: "Open any book and read just one page without pressure.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  BA04: { id: "BA04", category: "behavioural_activation", title: "Spend 5 minutes doing a hobby", description: "Spend a few minutes on something you genuinely enjoy.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  BA05: { id: "BA05", category: "behavioural_activation", title: "Water a plant or care for something living", description: "Water a houseplant or take a gentle moment with a pet.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  BA06: { id: "BA06", category: "behavioural_activation", title: "Finish one assignment question", description: "Answer just one question on your homework or project.", durationMinutes: 10, timeLabel: "10 min", points: 1, difficulty: "medium" },
  BA07: { id: "BA07", category: "behavioural_activation", title: "Cross one task off your to-do list", description: "Select one small action, do it, and tick it off.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },

  // Category 4: Social Connection (SC)
  SC01: { id: "SC01", category: "social_connection", title: "Smile at one person today", description: "Share a friendly smile with a peer, teacher, or family member.", durationMinutes: 1, timeLabel: "1 min", points: 1, difficulty: "easy" },
  SC02: { id: "SC02", category: "social_connection", title: "Send a message to one trusted friend", description: "Send a quick hello or supportive check-in to a friend.", durationMinutes: 2, timeLabel: "2 min", points: 1, difficulty: "easy" },
  SC03: { id: "SC03", category: "social_connection", title: "Talk to one family member for 5 minutes", description: "Have a brief, caring conversation with a family member.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  SC04: { id: "SC04", category: "social_connection", title: "Thank someone today", description: "Express genuine appreciation to someone for something they did.", durationMinutes: 2, timeLabel: "2 min", points: 1, difficulty: "easy" },
  SC05: { id: "SC05", category: "social_connection", title: "Ask someone how their day was", description: "Ask a classmate or friend about their day and listen.", durationMinutes: 2, timeLabel: "2 min", points: 1, difficulty: "easy" },
  SC06: { id: "SC06", category: "social_connection", title: "Sit with someone during lunch or break", description: "Spend your break near peers or sit with a friend.", durationMinutes: 15, timeLabel: "15 min", points: 1, difficulty: "medium" },

  // Category 5: Self-Compassion (SP)
  SP01: { id: "SP01", category: "self_compassion", title: "Write one thing you did well today", description: "Acknowledge one effort or win, no matter how small.", durationMinutes: 3, timeLabel: "3 min", points: 1, difficulty: "easy" },
  SP02: { id: "SP02", category: "self_compassion", title: "Tell yourself one kind sentence", description: "Say to yourself: 'I am doing the best I can right now.'", durationMinutes: 2, timeLabel: "2 min", points: 1, difficulty: "easy" },
  SP03: { id: "SP03", category: "self_compassion", title: "Write one thing you're grateful for", description: "Note one simple positive thing that happened recently.", durationMinutes: 3, timeLabel: "3 min", points: 1, difficulty: "easy" },
  SP04: { id: "SP04", category: "self_compassion", title: "Celebrate one small success today", description: "Give yourself credit for showing up and making progress.", durationMinutes: 2, timeLabel: "2 min", points: 1, difficulty: "easy" },
  SP05: { id: "SP05", category: "self_compassion", title: "Forgive yourself for one mistake today", description: "Remember that making mistakes is a normal part of learning.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },

  // Category 6: Study Confidence (ST)
  ST01: { id: "ST01", category: "study_confidence", title: "Study for just 5 minutes", description: "Set a 5-minute timer and read or review without pressure.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  ST02: { id: "ST02", category: "study_confidence", title: "Solve one practice question", description: "Work through a single practice problem or flashcard.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  ST03: { id: "ST03", category: "study_confidence", title: "Revise one topic", description: "Review key notes or summaries for one specific subject.", durationMinutes: 10, timeLabel: "10 min", points: 1, difficulty: "medium" },
  ST04: { id: "ST04", category: "study_confidence", title: "Prepare tomorrow's bag tonight", description: "Pack your books and supplies ready for tomorrow morning.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  ST05: { id: "ST05", category: "study_confidence", title: "Attend one class today with focus", description: "Listen attentively to one lesson and take notes.", durationMinutes: 30, timeLabel: "Variable", points: 1, difficulty: "medium" },

  // Category 7: Mood Boosters (MB)
  MB01: { id: "MB01", category: "mood_boosters", title: "Listen to your favourite song", description: "Put on your favorite uplifting track and enjoy the music.", durationMinutes: 4, timeLabel: "4 min", points: 1, difficulty: "easy" },
  MB02: { id: "MB02", category: "mood_boosters", title: "Watch the sunset or sunrise", description: "Take in the colors of the sky for a peaceful moment.", durationMinutes: 10, timeLabel: "10 min", points: 1, difficulty: "easy" },
  MB03: { id: "MB03", category: "mood_boosters", title: "Spend 5 minutes in nature", description: "Look at the trees, grass, or sky to refresh your mind.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  MB04: { id: "MB04", category: "mood_boosters", title: "Draw or colour something", description: "Doodle, sketch, or color for fun without judging the result.", durationMinutes: 10, timeLabel: "10 min", points: 1, difficulty: "easy" },
  MB05: { id: "MB05", category: "mood_boosters", title: "Dance to one song", description: "Move your body and let loose to an energetic tune.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  MB06: { id: "MB06", category: "mood_boosters", title: "Play with a pet or observe animals", description: "Spend gentle time with a pet or watch birds outside.", durationMinutes: 10, timeLabel: "10 min", points: 1, difficulty: "easy" },

  // Category 8: Purpose & Meaning (PM)
  PM01: { id: "PM01", category: "purpose_meaning", title: "Write one goal for tomorrow", description: "Set one simple, realistic intention for tomorrow.", durationMinutes: 3, timeLabel: "3 min", points: 1, difficulty: "easy" },
  PM02: { id: "PM02", category: "purpose_meaning", title: "Help one person today", description: "Offer a small hand or kind word to someone who needs it.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  PM03: { id: "PM03", category: "purpose_meaning", title: "Learn one new fact today", description: "Look up an interesting curiosity or educational tidbit.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  PM04: { id: "PM04", category: "purpose_meaning", title: "Reflect on one thing that gave your day meaning", description: "Think about one meaningful interaction or moment.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  PM05: { id: "PM05", category: "purpose_meaning", title: "Write one reason to keep going today", description: "Write down one person, hope, or goal that matters to you.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },

  // Category 9: Stress Management (SM)
  SM01: { id: "SM01", category: "stress_management", title: "Close eyes & take 10 deep breaths", description: "Take 10 mindful breaths with closed eyes to reduce stress.", durationMinutes: 2, timeLabel: "2 min", points: 1, difficulty: "easy" },
  SM02: { id: "SM02", category: "stress_management", title: "Drink one glass of water slowly", description: "Sip water mindfully and notice the cool sensation.", durationMinutes: 2, timeLabel: "2 min", points: 1, difficulty: "easy" },
  SM03: { id: "SM03", category: "stress_management", title: "Step away from work and stretch", description: "Take a 3-minute physical pause to ease shoulder tension.", durationMinutes: 3, timeLabel: "3 min", points: 1, difficulty: "easy" },
  SM04: { id: "SM04", category: "stress_management", title: "Take a 5-minute indoor or outdoor walk", description: "Walk at a relaxed pace to lower stress hormones.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  SM05: { id: "SM05", category: "stress_management", title: "Listen to calming music without phone distractions", description: "Focus completely on the music for 10 minutes.", durationMinutes: 10, timeLabel: "10 min", points: 1, difficulty: "easy" },
  SM06: { id: "SM06", category: "stress_management", title: "Write down everything worrying you right now", description: "Do a quick brain-dump of all stressful thoughts.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  SM07: { id: "SM07", category: "stress_management", title: "Circle one problem you can actually solve today", description: "Focus your energy on what is within your control.", durationMinutes: 3, timeLabel: "3 min", points: 1, difficulty: "easy" },
  SM08: { id: "SM08", category: "stress_management", title: "Spend 5 minutes observing your surroundings", description: "Sit quietly, breathe, and notice colors and textures around you.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  SM09: { id: "SM09", category: "stress_management", title: "Put your phone away for 15 minutes", description: "Give your brain a screen-free break to decompress.", durationMinutes: 15, timeLabel: "15 min", points: 1, difficulty: "medium" },
  SM10: { id: "SM10", category: "stress_management", title: "Organize one small space (desk or bag)", description: "Tidy a small zone to create a sense of order.", durationMinutes: 10, timeLabel: "10 min", points: 1, difficulty: "easy" },
  SM11: { id: "SM11", category: "stress_management", title: "Spend 10 minutes outside in fresh air", description: "Breathe in outdoor air and relax your eyes.", durationMinutes: 10, timeLabel: "10 min", points: 1, difficulty: "easy" },
  SM12: { id: "SM12", category: "stress_management", title: "Write down 3 things that went okay today", description: "Shift your focus from what went wrong to what went fine.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  SM13: { id: "SM13", category: "stress_management", title: "Laugh for a few minutes with something fun", description: "Watch a funny video or read a comic strip.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  SM14: { id: "SM14", category: "stress_management", title: "Practice Progressive Muscle Relaxation", description: "Systematically release physical tension from head to toe.", durationMinutes: 10, timeLabel: "10 min", points: 1, difficulty: "medium" },
  SM15: { id: "SM15", category: "stress_management", title: "Try the 5-4-3-2-1 sensory grounding exercise", description: "Anchor yourself firmly in the present moment.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  SM16: { id: "SM16", category: "stress_management", title: "Break one big task into 3 smaller tasks", description: "Split an intimidating assignment into easy baby steps.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  SM17: { id: "SM17", category: "stress_management", title: 'Say "No" to one unnecessary task today', description: "Protect your energy by declining an optional demand.", durationMinutes: 2, timeLabel: "2 min", points: 1, difficulty: "easy" },
  SM18: { id: "SM18", category: "stress_management", title: "Spend 10 minutes on a hobby you enjoy", description: "Allow yourself time for genuine play and relaxation.", durationMinutes: 10, timeLabel: "10 min", points: 1, difficulty: "easy" },
  SM19: { id: "SM19", category: "stress_management", title: "Sit quietly and notice 5 things you can see", description: "Slow down racing thoughts by observing peaceful details.", durationMinutes: 3, timeLabel: "3 min", points: 1, difficulty: "easy" },
  SM20: { id: "SM20", category: "stress_management", title: 'Take a 5-minute "micro break" (no work, no phone)', description: "Rest with zero input to prevent cognitive burnout.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },

  // Category 10: Sleep & Recovery (SR)
  SR01: { id: "SR01", category: "sleep_recovery", title: "Switch off screens 30 minutes before bed", description: "Turn off phone and laptop screens to let your brain prepare for sleep.", durationMinutes: 30, timeLabel: "Evening", points: 1, difficulty: "medium" },
  SR02: { id: "SR02", category: "sleep_recovery", title: "Go to bed at your planned bedtime tonight", description: "Stick to your intended sleep time to build a healthy biological rhythm.", durationMinutes: 10, timeLabel: "Night", points: 1, difficulty: "medium" },
  SR03: { id: "SR03", category: "sleep_recovery", title: "Dim the lights one hour before sleep", description: "Lower bedroom lighting to trigger natural melatonin production.", durationMinutes: 5, timeLabel: "Evening", points: 1, difficulty: "easy" },
  SR04: { id: "SR04", category: "sleep_recovery", title: "Write tomorrow's to-do list before bed", description: "Empty your mental checklist so your mind can rest peacefully.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  SR05: { id: "SR05", category: "sleep_recovery", title: "Practice slow breathing for 5 minutes before sleeping", description: "Breathe gently to calm your nervous system before sleep.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  SR06: { id: "SR06", category: "sleep_recovery", title: "Avoid caffeine after the afternoon", description: "Protect your deep sleep by skipping soda or coffee late.", durationMinutes: 1, timeLabel: "Whole day", points: 1, difficulty: "easy" },
  SR07: { id: "SR07", category: "sleep_recovery", title: "Read one page of a book instead of phone before bed", description: "Replace night-time scrolling with a calming printed page.", durationMinutes: 5, timeLabel: "5 min", points: 1, difficulty: "easy" },
  SR08: { id: "SR08", category: "sleep_recovery", title: "Wake up within 30 min of usual wake-up time", description: "Maintain a stable sleep cycle to keep morning energy steady.", durationMinutes: 5, timeLabel: "Morning", points: 1, difficulty: "medium" },
  SR09: { id: "SR09", category: "sleep_recovery", title: "Get natural sunlight within an hour of waking", description: "Open curtains or step out to calibrate your internal clock.", durationMinutes: 10, timeLabel: "10 min", points: 1, difficulty: "easy" },
  SR10: { id: "SR10", category: "sleep_recovery", title: "Give yourself permission to rest without guilt", description: "Acknowledge that rest is productive and essential for recovery.", durationMinutes: 2, timeLabel: "Anytime", points: 1, difficulty: "easy" },
};

// Must Do pool: PA01–PA05 (universal physical reset)
export const MUST_DO_POOL: string[] = ["PA01", "PA02", "PA03", "PA04", "PA05"];

// Master 20 Symptom Definitions with Item Triggers & Intensity-Specific Pools
export interface SymptomDefinition {
  index: number;
  key: string;
  source: string;
  itemText: string;
  triggerCondition: string;
  primaryCategory: string;
  backupCategory: string;
  isSafetyOverride?: boolean;
  isSafetyMonitored?: boolean;
  dialogue: string;
  lightSomePool: string[];
  intenseOverwhelmingPool: string[];
}

export const SYMPTOM_DEFINITIONS: Record<string, SymptomDefinition> = {
  low_interest: {
    index: 1,
    key: "low_interest",
    source: "PHQ-9 Q1",
    itemText: "Little interest or pleasure in doing things",
    triggerCondition: "Score >= 2",
    primaryCategory: "behavioural_activation",
    backupCategory: "mood_boosters",
    dialogue: "I noticed things haven't felt as fun lately. That happens sometimes. Want to try something small?",
    lightSomePool: ["BA03", "MB01", "BA04"],
    intenseOverwhelmingPool: ["PA01", "MB05", "PA02"],
  },
  low_mood: {
    index: 2,
    key: "low_mood",
    source: "PHQ-9 Q2",
    itemText: "Feeling down, depressed, or hopeless",
    triggerCondition: "Score >= 2",
    primaryCategory: "physical_activation",
    backupCategory: "mood_boosters",
    dialogue: "Sounds like today's been a little heavy. Let's do something gentle together.",
    lightSomePool: ["PA03", "SP03", "MB03"],
    intenseOverwhelmingPool: ["PA01", "SP02", "PA05"],
  },
  sleep_difficulties: {
    index: 3,
    key: "sleep_difficulties",
    source: "PHQ-9 Q3",
    itemText: "Trouble falling or staying asleep, or sleeping too much",
    triggerCondition: "Score >= 2",
    primaryCategory: "sleep_recovery",
    backupCategory: "stress_management",
    dialogue: "I heard sleep's been tricky lately. Let's set you up for a better night tonight.",
    lightSomePool: ["SR01", "SR04", "SR07"],
    intenseOverwhelmingPool: ["SR05", "SR03", "SR10"],
  },
  fatigue: {
    index: 4,
    key: "fatigue",
    source: "PHQ-9 Q4",
    itemText: "Feeling tired or having little energy",
    triggerCondition: "Score >= 2",
    primaryCategory: "physical_activation",
    backupCategory: "sleep_recovery",
    dialogue: "Feeling low on energy? Let's do one tiny thing to gently wake your body up.",
    lightSomePool: ["PA10", "PA03", "SR09"],
    intenseOverwhelmingPool: ["PA01", "PA02", "PA04"],
  },
  appetite_changes: {
    index: 5,
    key: "appetite_changes",
    source: "PHQ-9 Q5",
    itemText: "Poor appetite or overeating",
    triggerCondition: "Score >= 2",
    primaryCategory: "physical_activation",
    backupCategory: "self_compassion",
    dialogue: "Eating can feel off sometimes when things are tough. No pressure — just one small step.",
    lightSomePool: ["PA08", "SP04"],
    intenseOverwhelmingPool: ["PA01", "SP02"],
  },
  low_self_esteem: {
    index: 6,
    key: "low_self_esteem",
    source: "PHQ-9 Q6",
    itemText: "Feeling bad about yourself — or that you are a failure",
    triggerCondition: "Score >= 2",
    primaryCategory: "self_compassion",
    backupCategory: "purpose_meaning",
    dialogue: "I know that feeling of being hard on yourself. Let's try flipping that just a little.",
    lightSomePool: ["SP01", "SP04", "PM03"],
    intenseOverwhelmingPool: ["SP02", "SP05", "PA01"],
  },
  concentration_difficulties: {
    index: 7,
    key: "concentration_difficulties",
    source: "PHQ-9 Q7",
    itemText: "Trouble concentrating on things, such as reading or schoolwork",
    triggerCondition: "Score >= 2",
    primaryCategory: "study_confidence",
    backupCategory: "behavioural_activation",
    dialogue: "Focus feeling hard to hold onto? Let's break it into something tiny.",
    lightSomePool: ["ST01", "ST02", "BA07"],
    intenseOverwhelmingPool: ["PA02", "AN03", "PA01"],
  },
  restlessness_slowed: {
    index: 8,
    key: "restlessness_slowed",
    source: "PHQ-9 Q8",
    itemText: "Moving or speaking slowly, or fidgety and restless",
    triggerCondition: "Score >= 2",
    primaryCategory: "anxiety_reduction",
    backupCategory: "physical_activation",
    dialogue: "Your body might need a little movement or a little stillness — let's find what helps.",
    lightSomePool: ["PA03", "MB05"],
    intenseOverwhelmingPool: ["PA02", "AN02", "AN01"],
  },
  self_harm: {
    index: 9,
    key: "self_harm",
    source: "PHQ-9 Q9",
    itemText: "Thoughts that you would be better off dead, or of hurting yourself",
    triggerCondition: "Score > 0",
    primaryCategory: "safety_flow",
    backupCategory: "safety_flow",
    isSafetyOverride: true,
    dialogue: "Thank you for telling me. That took courage. I want to make sure someone can talk with you soon. Can I share a few caring people you could reach out to?",
    lightSomePool: [],
    intenseOverwhelmingPool: [],
  },
  nervousness: {
    index: 10,
    key: "nervousness",
    source: "GAD-7 Q1",
    itemText: "Feeling nervous, anxious, or on edge",
    triggerCondition: "Score >= 2",
    primaryCategory: "anxiety_reduction",
    backupCategory: "stress_management",
    dialogue: "Sounds like your mind's been busy worrying. Let's give it a little rest.",
    lightSomePool: ["AN07", "AN08", "AN04"],
    intenseOverwhelmingPool: ["AN01", "AN02", "AN03"],
  },
  uncontrollable_worry: {
    index: 11,
    key: "uncontrollable_worry",
    source: "GAD-7 Q2",
    itemText: "Not being able to stop or control worrying",
    triggerCondition: "Score >= 2",
    primaryCategory: "anxiety_reduction",
    backupCategory: "stress_management",
    dialogue: "When worries won't stop spinning, grounding your body can help slow them down.",
    lightSomePool: ["AN07", "AN08", "AN04"],
    intenseOverwhelmingPool: ["AN01", "AN02", "AN03"],
  },
  excessive_worry: {
    index: 12,
    key: "excessive_worry",
    source: "GAD-7 Q3",
    itemText: "Worrying too much about different things",
    triggerCondition: "Score >= 2",
    primaryCategory: "anxiety_reduction",
    backupCategory: "stress_management",
    dialogue: "It feels exhausting when your mind worries about everything. Let's take one small pause.",
    lightSomePool: ["AN07", "AN08", "AN04"],
    intenseOverwhelmingPool: ["AN01", "AN02", "AN03"],
  },
  trouble_relaxing: {
    index: 13,
    key: "trouble_relaxing",
    source: "GAD-7 Q4",
    itemText: "Trouble relaxing",
    triggerCondition: "Score >= 2",
    primaryCategory: "stress_management",
    backupCategory: "mood_boosters",
    dialogue: "Relaxing can feel hard sometimes — let's try just a little bit.",
    lightSomePool: ["SM14", "MB01", "MB04"],
    intenseOverwhelmingPool: ["PA01", "AN01"],
  },
  restlessness: {
    index: 14,
    key: "restlessness",
    source: "GAD-7 Q5",
    itemText: "Being so restless that it is hard to sit still",
    triggerCondition: "Score >= 2",
    primaryCategory: "physical_activation",
    backupCategory: "anxiety_reduction",
    dialogue: "Feeling a bit fidgety or on edge? Let's move that energy somewhere gentle.",
    lightSomePool: ["PA03", "AN04"],
    intenseOverwhelmingPool: ["PA02", "AN02"],
  },
  irritability: {
    index: 15,
    key: "irritability",
    source: "GAD-7 Q6",
    itemText: "Becoming easily annoyed or irritable",
    triggerCondition: "Score >= 2",
    primaryCategory: "stress_management",
    backupCategory: "self_compassion",
    dialogue: "Feeling a little on edge with others lately? That's okay — let's cool things down a bit.",
    lightSomePool: ["SM17", "SP02"],
    intenseOverwhelmingPool: ["PA01", "AN01"],
  },
  fear: {
    index: 16,
    key: "fear",
    source: "GAD-7 Q7",
    itemText: "Feeling afraid, as if something awful might happen",
    triggerCondition: "Score >= 2",
    primaryCategory: "anxiety_reduction",
    backupCategory: "purpose_meaning",
    dialogue: "That feeling of dread is really uncomfortable. Let's bring your mind back to right now.",
    lightSomePool: ["PM01", "SM12"],
    intenseOverwhelmingPool: ["AN03", "SM15"],
  },
  loneliness: {
    index: 17,
    key: "loneliness",
    source: "Check-in / Tag",
    itemText: "Feeling lonely or isolated from peers",
    triggerCondition: "Score >= 2 or Tag",
    primaryCategory: "social_connection",
    backupCategory: "mood_boosters",
    dialogue: "Feeling a bit alone lately? Let's try reaching out, even just a little.",
    lightSomePool: ["SC02", "SC03", "SC06"],
    intenseOverwhelmingPool: ["SC01", "SC04"],
  },
  academic_stress: {
    index: 18,
    key: "academic_stress",
    source: "Academic Item / Check-in",
    itemText: "Stress over schoolwork, exams, or deadlines",
    triggerCondition: "Score >= 2 or Tag",
    primaryCategory: "stress_management",
    backupCategory: "study_confidence",
    dialogue: "Exams and deadlines can feel like a lot. Let's shrink it down to something manageable.",
    lightSomePool: ["ST01", "SM16", "ST03"],
    intenseOverwhelmingPool: ["PA01", "SM20", "PA02"],
  },
  burnout: {
    index: 19,
    key: "burnout",
    source: "Burnout Item / Check-in",
    itemText: "Physical and emotional exhaustion from ongoing overload",
    triggerCondition: "Score >= 2 or Tag",
    primaryCategory: "sleep_recovery",
    backupCategory: "stress_management",
    dialogue: "Sounds like you've been running on empty. Let's help you recharge a little.",
    lightSomePool: ["SM18", "SR01", "SM11"],
    intenseOverwhelmingPool: ["SR10", "SM09", "PA01"],
  },
  hopelessness: {
    index: 20,
    key: "hopelessness",
    source: "Clinical Screen / Tag",
    itemText: "Feeling that the future is bleak or empty",
    triggerCondition: "Score >= 2 or Tag",
    primaryCategory: "purpose_meaning",
    backupCategory: "self_compassion",
    isSafetyMonitored: true, // Paired with silent counsellor flag
    dialogue: "That sounds really heavy to carry. I'm here, and I also want to make sure you have extra support.",
    lightSomePool: ["PM05", "PM02"],
    intenseOverwhelmingPool: ["PA01", "SP02"],
  },
};

// Reinforcement Messages on Completion (rotate randomly)
export const COMPLETION_REINFORCEMENTS: string[] = [
  "Nice! Small wins stack up — that was a good step. 🌟",
  "You did it — your brain likes routine. +1 Calm Point!",
  "Well done. You've just trained your mind to choose calm.",
  "Every tiny step matters — I'm proud of you for doing this.",
];

// Gentle Nudge Messages for skipped or uncompleted goals
export const GENTLE_NUDGES: string[] = [
  "It's okay — try now for just 2 minutes. Small steps count.",
  "Missed today's goal? No problem — want a 1-minute breathing break instead?",
  "Consistency beats perfection. Try again and I'll cheer for you.",
];

// Weekly Modeling Messages (social proof)
export const WEEKLY_MODELING_MESSAGES: string[] = [
  "23 students at your school completed a Calm Goal today — you're part of a caring community! 🌱",
  "20 students at your school completed a Calm Goal today — join them! 🌱",
];

// Selection State & Historical Effectiveness Model
export interface StudentGoalHistoryItem {
  goalId: string;
  createdAt: number;
  completed: boolean;
  skipped: boolean;
  preIntensity?: number;
  postIntensity?: number;
  intensityDrop?: number;
}

export interface SelectGoalsArgs {
  studentId: string;
  symptoms: Array<{ key: string; score: number }>;
  todaySeverityAnchor: string | number;
  history: StudentGoalHistoryItem[];
  cooldownDays?: number; // default 3
  explorationRate?: number; // default 0.10
  daySeed?: number; // for deterministic rotation
  deterministic?: boolean;
}

export interface SelectedGoalResult {
  slot: "must_do" | "feel_better" | "grow_stronger";
  slotLabel: string;
  symptomKey?: string;
  dialogue?: string;
  goal: MicroGoalItem;
  intensityGroup: IntensityGroup;
}

/**
 * Pure, deterministic and testable selection algorithm matching Phase 6 specification.
 */
export function selectDailyMicroGoals(args: SelectGoalsArgs): {
  safetyOverride: boolean;
  hopelessnessAlertTriggered: boolean;
  selectedGoals: SelectedGoalResult[];
  dialogueMessage: string;
} {
  const { symptoms, todaySeverityAnchor, history, cooldownDays = 3, explorationRate = 0.10, daySeed = 0 } = args;

  // 1. Safety Check: If PHQ-9 Q9 (self_harm) has score > 0 -> Safety Override!
  const selfHarmSymptom = symptoms.find((s) => s.key === "self_harm" && s.score > 0);
  if (selfHarmSymptom) {
    return {
      safetyOverride: true,
      hopelessnessAlertTriggered: false,
      selectedGoals: [],
      dialogueMessage: SYMPTOM_DEFINITIONS.self_harm.dialogue,
    };
  }

  // 2. Check if Hopelessness is flagged -> silent alert flag
  const hopelessnessFlag = symptoms.some((s) => s.key === "hopelessness" && s.score >= 2);

  // 3. Filter eligible symptoms (score >= 2), excluding self_harm
  const eligibleSymptoms = symptoms
    .filter((s) => s.key !== "self_harm" && s.score >= 2 && SYMPTOM_DEFINITIONS[s.key])
    .sort((a, b) => b.score - a.score);

  // Determine Primary & Secondary symptom categories
  let primarySymptomKey = eligibleSymptoms[0]?.key || "low_mood";
  let secondarySymptomKey = eligibleSymptoms[1]?.key;

  // If more than 2 symptoms are eligible, use daySeed to rotate fairly
  if (eligibleSymptoms.length > 2) {
    const rotationOffset = Math.abs(daySeed) % eligibleSymptoms.length;
    primarySymptomKey = eligibleSymptoms[rotationOffset].key;
    secondarySymptomKey = eligibleSymptoms[(rotationOffset + 1) % eligibleSymptoms.length].key;
  }

  const primaryDef = SYMPTOM_DEFINITIONS[primarySymptomKey] || SYMPTOM_DEFINITIONS.low_mood;
  const secondaryDef = secondarySymptomKey ? SYMPTOM_DEFINITIONS[secondarySymptomKey] : null;

  const intensityGroup = mapAnchorToGroup(todaySeverityAnchor);

  // Recent goal IDs shown in last cooldownDays (default 3 days)
  const now = Date.now();
  const cooldownWindowMs = cooldownDays * 24 * 60 * 60 * 1000;
  const recentGoalIds = new Set(
    history
      .filter((h) => now - h.createdAt <= cooldownWindowMs)
      .map((h) => h.goalId)
  );

  // Calculate effectiveness map: avg_intensity_drop = average(pre - post)
  // ONLY for completed goals, NEVER skipped goals.
  const effectivenessMap: Record<string, { totalDrop: number; count: number }> = {};
  for (const h of history) {
    if (h.completed && !h.skipped) {
      let drop = h.intensityDrop;
      if (drop === undefined && typeof h.preIntensity === "number" && typeof h.postIntensity === "number") {
        drop = h.preIntensity - h.postIntensity;
      }
      if (typeof drop === "number") {
        if (!effectivenessMap[h.goalId]) {
          effectivenessMap[h.goalId] = { totalDrop: 0, count: 0 };
        }
        effectivenessMap[h.goalId].totalDrop += drop;
        effectivenessMap[h.goalId].count += 1;
      }
    }
  }

  const getAvgDrop = (goalId: string): number => {
    const entry = effectivenessMap[goalId];
    return entry && entry.count > 0 ? entry.totalDrop / entry.count : 0;
  };

  const hasHistory = (goalId: string): boolean => {
    return !!effectivenessMap[goalId] && effectivenessMap[goalId].count > 0;
  };

  // Helper to select one goal from a pool applying cooldown, exploration, and effectiveness ranking
  const pickFromPool = (poolGoalIds: string[], excludedIds: Set<string>): MicroGoalItem => {
    // Exclude goals already picked for today's other slots
    let available = poolGoalIds.filter((id) => !excludedIds.has(id));
    if (available.length === 0) {
      available = [...poolGoalIds];
    }

    // Exclude recent goals (cooldown)
    let nonCooldown = available.filter((id) => !recentGoalIds.has(id));
    if (nonCooldown.length === 0) {
      // Cooldown reset if all are on cooldown
      nonCooldown = available;
    }

    // 10% Exploration of an untried goal
    const untried = nonCooldown.filter((id) => !hasHistory(id));
    if (Math.random() < explorationRate && untried.length > 0) {
      const chosenId = untried[Math.floor(Math.random() * untried.length)];
      return MICROGOALS_CATALOGUE[chosenId] || MICROGOALS_CATALOGUE.PA01;
    }

    // Otherwise rank by avg_intensity_drop descending
    const sorted = [...nonCooldown].sort((a, b) => {
      const dropDiff = getAvgDrop(b) - getAvgDrop(a);
      if (dropDiff !== 0) return dropDiff;
      return a.localeCompare(b);
    });

    if (args.deterministic || explorationRate === 0) {
      const topId = sorted[0];
      return MICROGOALS_CATALOGUE[topId] || MICROGOALS_CATALOGUE.PA01;
    }

    // Pick among top 3
    const topChoices = sorted.slice(0, Math.min(3, sorted.length));
    const chosenId = topChoices[Math.floor(Math.random() * topChoices.length)];
    return MICROGOALS_CATALOGUE[chosenId] || MICROGOALS_CATALOGUE.PA01;
  };

  const pickedIds = new Set<string>();
  const results: SelectedGoalResult[] = [];

  // Slot 1: Must Do (Always from PA01-PA05)
  const mustDoGoal = pickFromPool(MUST_DO_POOL, pickedIds);
  pickedIds.add(mustDoGoal.id);
  results.push({
    slot: "must_do",
    slotLabel: "✅ Must Do",
    goal: mustDoGoal,
    intensityGroup,
  });

  // Slot 2: Feel Better (Primary symptom pool by intensity)
  const feelBetterPool =
    intensityGroup === "light_some"
      ? (primaryDef.lightSomePool.length > 0 ? primaryDef.lightSomePool : primaryDef.intenseOverwhelmingPool)
      : (primaryDef.intenseOverwhelmingPool.length > 0 ? primaryDef.intenseOverwhelmingPool : primaryDef.lightSomePool);
  
  const feelBetterGoal = pickFromPool(feelBetterPool.length > 0 ? feelBetterPool : ["PA03", "AN01", "MB01"], pickedIds);
  pickedIds.add(feelBetterGoal.id);
  results.push({
    slot: "feel_better",
    slotLabel: "🌿 Feel Better",
    symptomKey: primaryDef.key,
    dialogue: primaryDef.dialogue,
    goal: feelBetterGoal,
    intensityGroup,
  });

  // Slot 3: Grow Stronger (Secondary symptom pool, or backup category, or growth catalog)
  let growStrongerPool: string[] = [];
  if (secondaryDef) {
    growStrongerPool =
      intensityGroup === "light_some"
        ? (secondaryDef.lightSomePool.length > 0 ? secondaryDef.lightSomePool : secondaryDef.intenseOverwhelmingPool)
        : (secondaryDef.intenseOverwhelmingPool.length > 0 ? secondaryDef.intenseOverwhelmingPool : secondaryDef.lightSomePool);
  } else {
    // Fallback category from primaryDef.backupCategory
    growStrongerPool = ["ST01", "SP01", "PM01", "SC02", "BA03"];
  }

  const growStrongerGoal = pickFromPool(growStrongerPool.length > 0 ? growStrongerPool : ["ST01", "SP01", "PM01"], pickedIds);
  pickedIds.add(growStrongerGoal.id);
  results.push({
    slot: "grow_stronger",
    slotLabel: "📚 Grow Stronger",
    symptomKey: secondaryDef?.key || primaryDef.backupCategory,
    dialogue: secondaryDef?.dialogue,
    goal: growStrongerGoal,
    intensityGroup,
  });

  return {
    safetyOverride: false,
    hopelessnessAlertTriggered: hopelessnessFlag,
    selectedGoals: results,
    dialogueMessage: primaryDef.dialogue,
  };
}
