import { JPMRStep } from "./types";

/**
 * Authoritative 15-step Jacobson Progressive Muscle Relaxation (JPMR) protocol.
 * All steps use local, deterministic vector illustrations and anatomical focus points.
 * Zero external or third-party remote URL dependencies.
 */
export const JPMR_STEPS: JPMRStep[] = [
  {
    title: "Introduction",
    muscleGroup: "Full Body Posture",
    focusArea: "intro",
    actionPrompt: "Find a comfortable position and focus awareness on your body.",
    tenseScript: "Welcome to Jacobson Progressive Muscle Relaxation. Let's start by taking a slow, deep breath. Focus your awareness on your body. Press start when you are ready to begin.",
    releaseScript: "Find a comfortable seat or lie down. Close your eyes and observe your breath.",
  },
  {
    title: "Hands & Fists",
    muscleGroup: "Hands & Fingers",
    focusArea: "hands",
    actionPrompt: "Squeeze both of your hands into tight fists.",
    tenseScript: "Squeeze both of your hands into tight fists. Hold the tension. Tense your hands and fists for 5 seconds.",
    releaseScript: "Now release. Let your fingers open and go completely soft. Notice the difference between tension and relaxation in your hands.",
  },
  {
    title: "Forearms",
    muscleGroup: "Forearm Extensors",
    focusArea: "forearms",
    actionPrompt: "Bend your hands upward at the wrists to tighten your forearms.",
    tenseScript: "Bend your hands upward at the wrists to tighten your forearms. Hold the tension in your forearms for 5 seconds.",
    releaseScript: "Release. Let your wrists drop. Feel the muscles in your lower arms soften and relax.",
  },
  {
    title: "Upper Arms",
    muscleGroup: "Biceps & Triceps",
    focusArea: "upper_arms",
    actionPrompt: "Bend your elbows and flex your biceps tightly.",
    tenseScript: "Bend your elbows and flex your biceps tightly. Hold the tension in your upper arms for 5 seconds.",
    releaseScript: "Release. Let your arms go completely limp at your sides. Feel the relaxation flow in.",
  },
  {
    title: "Shoulders",
    muscleGroup: "Deltoids & Trapezius",
    focusArea: "shoulders",
    actionPrompt: "Shrug your shoulders upward towards your ears.",
    tenseScript: "Shrug your shoulders upward towards your ears. Hold the tension in your shoulders for 5 seconds.",
    releaseScript: "Release. Let your shoulders drop down heavy and soft. Notice the relief in your neck and shoulder area.",
  },
  {
    title: "Face & Jaw",
    muscleGroup: "Facial & Masseter",
    focusArea: "face_jaw",
    actionPrompt: "Squeeze your eyes shut, wrinkle your nose, and clench your jaw tightly.",
    tenseScript: "Squeeze your eyes shut, wrinkle your nose, and clench your jaw tightly. Hold the tension in your face for 5 seconds.",
    releaseScript: "Release. Let your forehead smooth out, and let your jaw hang loose. Feel your face relax completely.",
  },
  {
    title: "Neck",
    muscleGroup: "Neck & Cervical",
    focusArea: "neck",
    actionPrompt: "Gently press your head backwards against your seat or headrest.",
    tenseScript: "Gently press your head backwards against your seat or support. Hold the tension in your neck for 5 seconds.",
    releaseScript: "Release. Let your head rest comfortably. Feel your neck muscles go soft and loose.",
  },
  {
    title: "Chest",
    muscleGroup: "Pectorals & Diaphragm",
    focusArea: "chest",
    actionPrompt: "Take a deep breath and hold it to feel tightness across your chest.",
    tenseScript: "Take a deep breath and hold it. Feel the tightness across your chest. Hold it for 5 seconds.",
    releaseScript: "Release. Exhale completely, and let your breathing return to normal. Notice the chest area relax.",
  },
  {
    title: "Stomach",
    muscleGroup: "Abdominal Core",
    focusArea: "stomach",
    actionPrompt: "Tighten your stomach muscles as if bracing for impact.",
    tenseScript: "Tighten your stomach muscles as if preparing for an impact. Hold the tension in your stomach for 5 seconds.",
    releaseScript: "Release. Let your stomach relax completely. Take a deep, gentle breath into your soft stomach.",
  },
  {
    title: "Back",
    muscleGroup: "Upper & Mid Back",
    focusArea: "back",
    actionPrompt: "Arch your back slightly and pull your shoulder blades together.",
    tenseScript: "Arch your back slightly and pull your shoulder blades together. Hold the tension in your back for 5 seconds.",
    releaseScript: "Release. Let your back relax and rest flat. Feel the tension flow away.",
  },
  {
    title: "Thighs & Legs",
    muscleGroup: "Quadriceps & Hamstrings",
    focusArea: "thighs",
    actionPrompt: "Squeeze your thigh muscles tightly together.",
    tenseScript: "Squeeze your thigh muscles tightly. Hold the tension in your thighs for 5 seconds.",
    releaseScript: "Release. Let your thigh muscles go completely loose. Notice the warm, heavy sensation.",
  },
  {
    title: "Calves",
    muscleGroup: "Calf Muscles & Shins",
    focusArea: "calves",
    actionPrompt: "Point your toes upward towards your shins to tighten calves.",
    tenseScript: "Point your toes upward towards your shins to tighten your calf muscles. Hold the tension in your calves for 5 seconds.",
    releaseScript: "Release. Let your legs rest. Feel the peacefulness in your lower legs.",
  },
  {
    title: "Feet",
    muscleGroup: "Feet & Toes",
    focusArea: "feet",
    actionPrompt: "Curl your toes downward, tensing your feet.",
    tenseScript: "Curl your toes downward, tensing your feet. Hold the tension in your feet for 5 seconds.",
    releaseScript: "Release. Uncurl your toes. Enjoy the feeling of complete relaxation in your feet.",
  },
  {
    title: "Full Body",
    muscleGroup: "Full Body Integration",
    focusArea: "full_body",
    actionPrompt: "Tense your entire body from face to feet in one synchronized squeeze.",
    tenseScript: "Now, tense your entire body from your face to your feet. Squeeze every muscle. Hold the full body tension for 5 seconds.",
    releaseScript: "Release. Let go of all tension completely. Let your whole body sink deeply. Feel the absolute relaxation.",
  },
  {
    title: "Reflection",
    muscleGroup: "Whole Body Relaxation",
    focusArea: "reflection",
    actionPrompt: "Breathe calmly and observe the deep physical relaxation in your body.",
    tenseScript: "Take a few final calm, deep breaths. Appreciate the sense of quiet and relaxation in your body.",
    releaseScript: "You have completed your progressive muscle relaxation. Open your eyes when you are ready.",
  },
];

export function getJpmrStep(index: number): JPMRStep {
  if (index >= 0 && index < JPMR_STEPS.length) {
    return JPMR_STEPS[index];
  }
  return JPMR_STEPS[0];
}
