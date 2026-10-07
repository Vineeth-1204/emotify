export interface MicroGoal {
  id: string;
  title: string;
  description: string;
  points: number;
  category: string;
  difficulty: "easy" | "medium" | "very_small";
  whyItHelps: string;
  estimatedTime: string;
}

const MILD_GOALS: MicroGoal[] = [
  { id: "water", title: "Drink a glass of water", description: "Stay hydrated to improve focus and alertness.", points: 8, category: "health", difficulty: "easy", whyItHelps: "Hydration keeps your mind and body active.", estimatedTime: "1 min" },
  { id: "walk_10", title: "Take a 10 minute walk", description: "Take a quick walk outside to clear your mind.", points: 10, category: "movement", difficulty: "easy", whyItHelps: "Physical activity triggers endorphins to boost your mood.", estimatedTime: "10 mins" },
  { id: "read_20", title: "Read for 20 minutes", description: "Read a chapter of a book or an article.", points: 10, category: "mindfulness", difficulty: "easy", whyItHelps: "Reading helps shift your thoughts and exercise your brain.", estimatedTime: "20 mins" },
  { id: "stretch_5", title: "Stretch for 5 minutes", description: "Do a few gentle body stretches.", points: 8, category: "movement", difficulty: "easy", whyItHelps: "Stretching releases physical tension accumulated from stress.", estimatedTime: "5 mins" },
  { id: "breathe", title: "Practice breathing", description: "Take 3 slow, deep belly breaths.", points: 5, category: "mindfulness", difficulty: "easy", whyItHelps: "Deep breathing lowers your heart rate and activates calm.", estimatedTime: "3 mins" },
  { id: "journal_3", title: "Journal for 3 minutes", description: "Write down a few thoughts about your day.", points: 8, category: "mindfulness", difficulty: "easy", whyItHelps: "Journaling brings awareness to your emotional state.", estimatedTime: "3 mins" },
  { id: "music", title: "Listen to music", description: "Play some of your favorite relaxing music.", points: 5, category: "joy", difficulty: "easy", whyItHelps: "Music activates neural pathways associated with pleasure.", estimatedTime: "5 mins" },
  { id: "desk", title: "Organize your desk", description: "Tidy up a small portion of your workspace.", points: 10, category: "routine", difficulty: "easy", whyItHelps: "Decluttering your environment helps declutter your mind.", estimatedTime: "10 mins" },
  { id: "outside_brief", title: "Go outside briefly", description: "Stand outside or look at the sky for a moment.", points: 8, category: "mindfulness", difficulty: "easy", whyItHelps: "Natural sunlight regulates sleep and raises serotonin.", estimatedTime: "5 mins" }
];

const MODERATE_GOALS: MicroGoal[] = [
  { id: "study_task", title: "Complete one study task", description: "Finish one small assignment or class task.", points: 15, category: "routine", difficulty: "medium", whyItHelps: "Finishing a small task restores confidence and self-efficacy.", estimatedTime: "20 mins" },
  { id: "message_friend", title: "Send a message to a friend", description: "Send a text just to say hello and check-in.", points: 15, category: "social", difficulty: "medium", whyItHelps: "Social connection counteracts isolating tendencies.", estimatedTime: "2 mins" },
  { id: "jpmr_session", title: "Practice JPMR", description: "Do a quick guided muscle relaxation block.", points: 20, category: "mindfulness", difficulty: "medium", whyItHelps: "JPMR systematically reduces deep muscle tension.", estimatedTime: "12 mins" },
  { id: "emotion_map", title: "Complete Emotion Mapping", description: "Log your body sensations and current emotions.", points: 15, category: "mindfulness", difficulty: "medium", whyItHelps: "Mapping emotions helps you build body awareness.", estimatedTime: "5 mins" },
  { id: "study_15", title: "Study for 15 minutes", description: "Do a brief focused study block.", points: 15, category: "routine", difficulty: "medium", whyItHelps: "Short focused blocks prevent burnout and study blocks.", estimatedTime: "15 mins" },
  { id: "clean_area", title: "Clean one small area", description: "Wipe down a counter or organize a drawer.", points: 15, category: "routine", difficulty: "medium", whyItHelps: "Caring for your immediate space establishes healthy routine.", estimatedTime: "10 mins" },
  { id: "walk_15", title: "Walk for 15 minutes", description: "Go for a brisk walk around your neighborhood.", points: 15, category: "movement", difficulty: "medium", whyItHelps: "Gentle aerobic exercise decreases stress hormones.", estimatedTime: "15 mins" },
  { id: "attend_class", title: "Attend one class", description: "Attend your next lecture or class session.", points: 20, category: "routine", difficulty: "medium", whyItHelps: "Showing up to class maintains academic momentum.", estimatedTime: "50 mins" },
  { id: "review_notes", title: "Review one page of notes", description: "Open a notebook and read over a single page.", points: 10, category: "routine", difficulty: "medium", whyItHelps: "Reviewing a single page makes academic progress feel doable.", estimatedTime: "5 mins" }
];

const SEVERE_GOALS: MicroGoal[] = [
  { id: "get_out_bed", title: "Get out of bed", description: "Sit up and place your feet on the floor.", points: 25, category: "routine", difficulty: "very_small", whyItHelps: "Getting out of bed changes your physical environment and perspective.", estimatedTime: "1 min" },
  { id: "brush_teeth", title: "Brush teeth", description: "Spend two minutes brushing your teeth.", points: 20, category: "health", difficulty: "very_small", whyItHelps: "Basic hygiene builds self-respect and structure.", estimatedTime: "2 mins" },
  { id: "wash_face", title: "Wash face", description: "Splash cold water on your face.", points: 20, category: "health", difficulty: "very_small", whyItHelps: "Cool water stimulates the vagus nerve and aids alertness.", estimatedTime: "1 min" },
  { id: "water_severe", title: "Drink one glass of water", description: "Sip a glass of water slowly.", points: 20, category: "health", difficulty: "very_small", whyItHelps: "Hydration is essential for cognitive clarity and energy.", estimatedTime: "1 min" },
  { id: "open_notes_2", title: "Open notes for 2 minutes", description: "Just open a study guide and look at it briefly.", points: 25, category: "routine", difficulty: "very_small", whyItHelps: "Low pressure exposure helps reduce academic anxiety.", estimatedTime: "2 mins" },
  { id: "sit_outside_3", title: "Sit outside for 3 minutes", description: "Sit on a chair outside and look around.", points: 25, category: "mindfulness", difficulty: "very_small", whyItHelps: "Fresh air and nature can reduce physiological distress.", estimatedTime: "3 mins" },
  { id: "breathing_break", title: "Take one deep breathing break", description: "Take two slow, conscious breaths.", points: 20, category: "mindfulness", difficulty: "very_small", whyItHelps: "Deep breathing provides an instant physiological pause.", estimatedTime: "2 mins" },
  { id: "stretch_severe", title: "Stand up and stretch", description: "Stand up and reach for the ceiling for 10 seconds.", points: 20, category: "movement", difficulty: "very_small", whyItHelps: "Standing up shifts your energy state and releases stiffness.", estimatedTime: "2 mins" },
  { id: "healthy_snack", title: "Eat one healthy snack", description: "Eat a piece of fruit or some nuts.", points: 25, category: "health", difficulty: "very_small", whyItHelps: "Nourishing your body supports emotional regulation.", estimatedTime: "5 mins" }
];

const WELLBEING_GOALS: MicroGoal[] = [
  { id: "music_wellbeing", title: "Listen to favorite song", description: "Put on a song that makes you feel happy.", points: 10, category: "wellbeing", difficulty: "easy", whyItHelps: "Listening to a favorite song increases dopamine release.", estimatedTime: "3 mins" },
  { id: "watch_enjoyable", title: "Watch something enjoyable", description: "Watch a short, funny or peaceful video.", points: 10, category: "wellbeing", difficulty: "easy", whyItHelps: "Pleasurable distraction helps relax your nervous system.", estimatedTime: "10 mins" },
  { id: "gratitude", title: "Practice gratitude", description: "Write down or think of one thing you are grateful for today.", points: 10, category: "wellbeing", difficulty: "easy", whyItHelps: "Expressing gratitude rewires the brain to focus on safety.", estimatedTime: "2 mins" },
  { id: "favorite_drink", title: "Enjoy a favorite drink", description: "Enjoy a warm tea, coffee, or cold juice slowly.", points: 8, category: "wellbeing", difficulty: "easy", whyItHelps: "Savoring a warm drink builds sensory awareness.", estimatedTime: "5 mins" },
  { id: "outdoors_wellbeing", title: "Spend time outdoors", description: "Go sit in a park or look at plants for ten minutes.", points: 10, category: "wellbeing", difficulty: "easy", whyItHelps: "Nature reduces physiological distress indicators.", estimatedTime: "10 mins" }
];

function seededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return function() {
    let t = (h += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const rand = seededRandom(seed);
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function generateMicroGoals(state: { 
  triage_level: string;
  userId?: string;
  dateStr?: string;
}): MicroGoal[] {
  const { triage_level, userId = "", dateStr = "" } = state;
  const seed = `${userId}-${dateStr}`;
  
  let baseList: MicroGoal[] = [];
  const isSevere = triage_level === "severe" || triage_level === "suicide_flag" || triage_level === "psychosis_flag";
  const isModerate = triage_level === "moderate";
  
  if (isSevere) {
    baseList = [...SEVERE_GOALS];
  } else if (isModerate) {
    baseList = [...MODERATE_GOALS];
  } else {
    baseList = [...MILD_GOALS];
  }

  // Standard random selection of 3 goals
  const shuffled = seed
    ? seededShuffle(baseList, seed)
    : baseList.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 3);
}

