export type FocusArea =
  | 'intro'
  | 'hands'
  | 'forearms'
  | 'upper_arms'
  | 'shoulders'
  | 'face_jaw'
  | 'neck'
  | 'chest'
  | 'stomach'
  | 'back'
  | 'thighs'
  | 'calves'
  | 'feet'
  | 'full_body'
  | 'reflection';

export type PlayState =
  | 'SPEAK_TENSE'
  | 'TENSE_WAITING'
  | 'TENSE_COUNTDOWN'
  | 'SPEAK_RELEASE'
  | 'RELEASE_COUNTDOWN';

export interface JPMRStep {
  title: string;
  muscleGroup: string;
  focusArea: FocusArea;
  actionPrompt: string;
  tenseScript: string;
  releaseScript: string;
  video?: { uri: string };
}
