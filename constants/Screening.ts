// ── All clinical screening instruments ──

export interface ScreeningQuestion {
  id: number;
  text: string;
  explanation?: string;
}

export interface ScreeningOption {
  label: string;
  value: number;
}

// ─── PHQ-9 (Patient Health Questionnaire) ───
export const PHQ9_QUESTIONS: ScreeningQuestion[] = [
  { id: 1, text: 'Little interest or pleasure in doing things' },
  { id: 2, text: 'Feeling down, depressed, or hopeless' },
  { id: 3, text: 'Trouble falling or staying asleep, or sleeping too much' },
  { id: 4, text: 'Feeling tired or having little energy' },
  { id: 5, text: 'Poor appetite or overeating' },
  { id: 6, text: 'Feeling bad about yourself — or that you are a failure or have let yourself or your family down' },
  { id: 7, text: 'Trouble concentrating on things, such as reading or watching TV' },
  { id: 8, text: 'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless' },
  { id: 9, text: 'Thoughts that you would be better off dead, or of hurting yourself in some way' },
];

export const PHQ9_OPTIONS: ScreeningOption[] = [
  { label: 'Not at all', value: 0 },
  { label: 'Several days', value: 1 },
  { label: 'More than half the days', value: 2 },
  { label: 'Nearly every day', value: 3 },
];

export const PHQ9_INSTRUCTION = 'Over the last 2 weeks, how often have you been bothered by any of the following?';

// ─── GAD-7 (Generalized Anxiety Disorder) ───
export const GAD7_QUESTIONS: ScreeningQuestion[] = [
  { id: 1, text: 'Feeling nervous, anxious, or on edge' },
  { id: 2, text: 'Not being able to stop or control worrying' },
  { id: 3, text: 'Worrying too much about different things' },
  { id: 4, text: 'Trouble relaxing' },
  { id: 5, text: 'Being so restless that it\'s hard to sit still' },
  { id: 6, text: 'Becoming easily annoyed or irritable' },
  { id: 7, text: 'Feeling afraid, as if something awful might happen' },
];

export const GAD7_OPTIONS: ScreeningOption[] = [
  { label: 'Not at all', value: 0 },
  { label: 'Several days', value: 1 },
  { label: 'More than half the days', value: 2 },
  { label: 'Nearly every day', value: 3 },
];

export const GAD7_INSTRUCTION = 'Over the last 2 weeks, how often have you been bothered by the following?';

// ─── PQ-16 (Prodromal Questionnaire) ───
export const PQ16_QUESTIONS: ScreeningQuestion[] = [
  { id: 1, text: 'I feel uninterested in the things I used to enjoy' },
  { id: 2, text: 'I often seem to live through events exactly as they happened before (déjà vu)' },
  { id: 3, text: 'I sometimes smell or taste things that other people can\'t smell or taste' },
  { id: 4, text: 'I often hear unusual sounds like banging, clicking, hissing, clapping or ringing in my ears' },
  { id: 5, text: 'I have had the experience of doing something and wondering why I did it' },
  { id: 6, text: 'I sometimes see special meanings in advertisements, shop windows, or in the way things are arranged around me' },
  { id: 7, text: 'I have felt that there are messages for me in the way things are arranged around me' },
  { id: 8, text: 'I have had the experience of hearing faint or clear sounds of people or a person mumbling or talking when there is no one near me' },
  { id: 9, text: 'I have had the experience of hearing what other people are thinking' },
  { id: 10, text: 'I have had the experience of my thoughts being taken away from me' },
  { id: 11, text: 'I have had experiences with telepathy, psychic forces, or fortune telling' },
  { id: 12, text: 'I have believed that I was being sent special messages through the TV or radio' },
  { id: 13, text: 'I have felt that I am not in control of my own ideas or thoughts' },
  { id: 14, text: 'I have felt that my experiences are so strange that other people would find them very hard to believe' },
  { id: 15, text: 'I sometimes feel suddenly distracted by distant sounds that I am not normally aware of' },
  { id: 16, text: 'I have had the experience that my body or a part of my body feels strange or different from usual' },
];

export const PQ16_OPTIONS: ScreeningOption[] = [
  { label: 'No', value: 0 },
  { label: 'Yes', value: 1 },
];

export const PQ16_INSTRUCTION = 'Please indicate whether you have experienced any of the following:';

// ─── Screening order ───
export const SCREENING_ORDER = ['phq9', 'gad7'] as const;
export type ScreeningType = typeof SCREENING_ORDER[number];

// ─── Thinking Traps for Reframe Tool ───
export const THINKING_TRAPS = [
  { id: 'catastrophizing', label: 'Catastrophizing', description: 'Imagining the worst possible outcome' },
  { id: 'black_white', label: 'Black & White Thinking', description: 'Seeing things as all good or all bad' },
  { id: 'mind_reading', label: 'Mind Reading', description: 'Assuming you know what others are thinking' },
  { id: 'fortune_telling', label: 'Fortune Telling', description: 'Predicting the future negatively' },
  { id: 'personalization', label: 'Personalization', description: 'Blaming yourself for things outside your control' },
  { id: 'should_statements', label: 'Should Statements', description: 'Using "should" or "must" to pressure yourself' },
  { id: 'emotional_reasoning', label: 'Emotional Reasoning', description: 'Believing something is true because you feel it' },
  { id: 'labeling', label: 'Labeling', description: 'Putting a fixed label on yourself or others' },
  { id: 'magnification', label: 'Magnification', description: 'Making problems seem bigger than they are' },
  { id: 'filtering', label: 'Mental Filtering', description: 'Focusing only on the negative details' },
];

// ─── Emotions for Emotion Mapping (Client E01-E08 spec) ───
export interface EmotionCatalogItem {
  id: string;
  code: string;
  emoji?: string; // legacy backward compatibility
  iconKey: string;
  label: string;
  simpleMeaning: string;
  commonFeelings: string[];
  bodySensations: string[];
  color: string;
}

export const EMOTIONS: EmotionCatalogItem[] = [
  {
    id: 'happy',
    code: 'E01',
    emoji: '',
    iconKey: 'happy',
    label: 'Happy',
    simpleMeaning: 'I feel good or something nice happened.',
    commonFeelings: ['Excited', 'Joyful', 'Proud'],
    bodySensations: ['Warm chest', 'Relaxed face', 'Smiling', 'Light body', 'Relaxed shoulders', 'Lots of energy'],
    color: '#EAB308',
  },
  {
    id: 'calm',
    code: 'E02',
    emoji: '',
    iconKey: 'calm',
    label: 'Calm',
    simpleMeaning: 'I feel safe, relaxed, and okay.',
    commonFeelings: ['Peaceful', 'Comfortable'],
    bodySensations: ['Relaxed shoulders', 'Slow breathing', 'Relaxed chest', 'Relaxed stomach', 'Relaxed hands', 'Peaceful body'],
    color: '#22C55E',
  },
  {
    id: 'sad',
    code: 'E03',
    emoji: '',
    iconKey: 'sad',
    label: 'Sad',
    simpleMeaning: 'Something hurts me or I feel low.',
    commonFeelings: ['Lonely', 'Disappointed', 'Hurt'],
    bodySensations: ['Heavy chest', 'Lump in throat', 'Tears', 'Heavy head', 'Tired body', 'Heavy legs', 'Low energy'],
    color: '#3B82F6',
  },
  {
    id: 'worried',
    code: 'E04',
    emoji: '',
    iconKey: 'worried',
    label: 'Worried / Scared',
    simpleMeaning: 'I think something bad might happen.',
    commonFeelings: ['Fear', 'Nervous', 'Anxious'],
    bodySensations: ['Tight chest', 'Fast heartbeat', 'Fast breathing', 'Upset stomach', 'Shaky hands', 'Sweaty hands', 'Tight shoulders', 'Restless legs'],
    color: '#F97316',
  },
  {
    id: 'angry',
    code: 'E05',
    emoji: '',
    iconKey: 'angry',
    label: 'Angry / Upset',
    simpleMeaning: 'I feel hurt, annoyed, or treated badly.',
    commonFeelings: ['Frustrated', 'Irritated', 'Insulted'],
    bodySensations: ['Hot face', 'Tight jaw', 'Tight hands', 'Tight shoulders', 'Tight chest', 'Fast heartbeat', 'Tense body', 'Restless body'],
    color: '#EF4444',
  },
  {
    id: 'embarrassed',
    code: 'E06',
    emoji: '',
    iconKey: 'embarrassed',
    label: 'Embarrassed / Ashamed',
    simpleMeaning: 'I feel bad or uncomfortable about myself or what happened.',
    commonFeelings: ['Shame', 'Awkwardness'],
    bodySensations: ['Hot face', 'Red face', 'Tight chest', 'Lump in throat', 'Upset stomach', 'Tense body', 'Shaky feeling', 'Wanting to hide'],
    color: '#A855F7',
  },
  {
    id: 'guilty',
    code: 'E07',
    emoji: '',
    iconKey: 'guilty',
    label: 'Guilty / Regretful',
    simpleMeaning: 'I feel bad about something I did or wish I had done differently.',
    commonFeelings: ['Guilt', 'Regret'],
    bodySensations: ['Heavy chest', 'Sinking feeling in stomach', 'Tight stomach', 'Lump in throat', 'Heavy body', 'Tight shoulders', 'Low energy'],
    color: '#6366F1',
  },
  {
    id: 'tired',
    code: 'E08',
    emoji: '',
    iconKey: 'tired',
    label: 'Tired / Drained',
    simpleMeaning: 'I feel like I have little energy left.',
    commonFeelings: ['Exhausted', 'Overwhelmed'],
    bodySensations: ['Heavy eyes', 'Heavy head', 'Weak legs', 'Tired arms', 'Heavy body', 'Slow body', 'Little energy', 'Hard to move'],
    color: '#64748B',
  },
];

export const INTERVENTION_RECOMMENDATIONS: Record<string, {
  activity: string;
  studentFacingName: string;
  recommendedDuration: string;
  directResource: string;
  rating: string;
}> = {
  worried: {
    activity: 'Mindfulness of Breath',
    studentFacingName: 'Calm My Mind',
    recommendedDuration: '5–10 min',
    directResource: 'Mindfulness / breathing meditation resources',
    rating: 'Highly Recommended',
  },
  angry: {
    activity: 'JPMR / Pause & Relax / CBT',
    studentFacingName: 'Pause & Unwind',
    recommendedDuration: '5–10 min',
    directResource: 'Progressive muscle relaxation & CBT pause tool',
    rating: 'Highly Recommended',
  },
  embarrassed: {
    activity: 'Loving-Kindness / Self-Compassion',
    studentFacingName: 'Be Kind to Myself',
    recommendedDuration: '10 min',
    directResource: '10-Minute Loving-Kindness Meditation – Self-Compassion',
    rating: 'Highly Recommended',
  },
  guilty: {
    activity: 'Loving-Kindness / Self-Compassion',
    studentFacingName: 'Be Kind to Myself',
    recommendedDuration: '10 min',
    directResource: '10-Minute Self-Compassion & Loving-Kindness Meditation',
    rating: 'Highly Recommended',
  },
  sad: {
    activity: 'Loving-Kindness / Self-Compassion',
    studentFacingName: 'Be Kind to Myself',
    recommendedDuration: '10 min',
    directResource: '10-Minute Loving-Kindness Meditation – Sharon Salzberg',
    rating: 'Highly Recommended',
  },
  tired: {
    activity: 'Gentle mindfulness / restorative meditation',
    studentFacingName: 'Rest & Recharge',
    recommendedDuration: '5–10 min',
    directResource: 'Guided mindfulness/meditation library',
    rating: 'Recommended',
  },
  happy: {
    activity: 'Gratitude Meditation',
    studentFacingName: 'Notice the Good',
    recommendedDuration: '10 min',
    directResource: '10-Minute Gratitude Meditation',
    rating: 'Highly Recommended',
  },
  calm: {
    activity: 'Breathing-paced calming music',
    studentFacingName: 'Stay in the Calm',
    recommendedDuration: '3–10 min',
    directResource: 'Breathing Cycles – calming breathing music',
    rating: 'Highly Recommended',
  },
};

// ─── Body Regions for Emotion Mapping ───
export const BODY_REGIONS = [
  'Head', 'Forehead', 'Eyes', 'Jaw', 'Throat',
  'Chest', 'Heart', 'Stomach', 'Shoulders',
  'Arms', 'Hands', 'Back', 'Legs', 'Feet',
];

// ─── MicroGoals ───
export const MICRO_GOALS = [
  { id: 'water', label: 'Drink a glass of water', points: 5, category: 'health' },
  { id: 'walk', label: 'Take a 5-minute walk', points: 10, category: 'movement' },
  { id: 'breathe', label: 'Do 3 deep breaths', points: 5, category: 'mindfulness' },
  { id: 'stretch', label: 'Stretch for 2 minutes', points: 8, category: 'movement' },
  { id: 'tidy', label: 'Tidy one small area', points: 8, category: 'routine' },
  { id: 'message', label: 'Send a kind message to someone', points: 10, category: 'social' },
  { id: 'snack', label: 'Eat a healthy snack', points: 5, category: 'health' },
  { id: 'music', label: 'Listen to a song you love', points: 5, category: 'joy' },
  { id: 'journal', label: 'Write one sentence about your day', points: 10, category: 'mindfulness' },
  { id: 'sleep', label: 'Set a bedtime reminder', points: 5, category: 'health' },
  { id: 'nature', label: 'Look out a window for 1 minute', points: 5, category: 'mindfulness' },
  { id: 'gratitude', label: 'Name one thing you\'re grateful for', points: 8, category: 'mindfulness' },
];

// Small goals for severe/high WSAS users
export const SMALL_GOALS = [
  { id: 'sit', label: 'Sit up in bed', points: 5, category: 'movement' },
  { id: 'face', label: 'Wash your face', points: 5, category: 'health' },
  { id: 'window', label: 'Open a window or curtain', points: 5, category: 'routine' },
  { id: 'sip', label: 'Take a sip of water', points: 3, category: 'health' },
  { id: 'notice', label: 'Notice 3 things you can see', points: 5, category: 'mindfulness' },
  { id: 'hands', label: 'Wash your hands slowly', points: 3, category: 'mindfulness' },
];

// ─── Guided Questions for Reframe Tool ───
export const REFRAME_GUIDED_QUESTIONS = [
  'What evidence supports this thought?',
  'What evidence contradicts this thought?',
  'What would you tell a friend in this situation?',
  'Is there another way to look at this?',
  'Will this matter in 5 years?',
];
