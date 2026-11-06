/**
 * Adaptive Student Engagement Message Library
 *
 * Warm, conversational, respectful notification copy inspired by Zomato's friendly engagement style
 * and Duolingo's positive habit loops.
 *
 * Rules:
 *  - Never shame, guilt-trip, or emotionally manipulate students.
 *  - Companions (Emoty/Mitra) must NEVER claim to be lonely, sad, or angry if the student doesn't open the app.
 *  - Lock-screen push copy remains privacy-safe and free of clinical terms, diagnoses, or sensitive data.
 *  - Deterministic rotation prevents repetitive copy while keeping tests predictable.
 */

export interface MessageVariant {
  title: string;
  message: string;
}

export interface EngagementContext {
  name?: string | null;
  companionName?: string | null;
  goalTitle?: string | null;
  seed?: number;
}

function sanitizeName(raw?: string | null): string {
  if (!raw) return "friend";
  const cleaned = raw.replace(/[^\w\s-]/gi, "").trim().slice(0, 30);
  return cleaned.length > 0 ? cleaned : "friend";
}

function selectVariant(variants: Array<(ctx: { name: string; companionName: string; goalTitle: string }) => MessageVariant>, seed: number, ctx: { name: string; companionName: string; goalTitle: string }): MessageVariant {
  const index = Math.abs(seed) % variants.length;
  return variants[index](ctx);
}

// -------------------------------------------------------------
// 1. Morning Notifications (7:00 AM - 11:00 AM)
// -------------------------------------------------------------

const MORNING_CHECKIN_VARIANTS: Array<(ctx: { name: string; companionName: string }) => MessageVariant> = [
  ({ name, companionName }) => ({
    title: `Good morning, ${name}! ☀️`,
    message: `${companionName} here. Before the day gets busy, take a quick 10 seconds to log how you're feeling?`,
  }),
  ({ name, companionName }) => ({
    title: `Rise and shine, ${name}! ✨`,
    message: `A fresh day starts with you. How's your heart feeling this morning?`,
  }),
  ({ name, companionName }) => ({
    title: `Morning check-in time 🌤️`,
    message: `Hey ${name}! Got a moment for a tiny emotion check-in before diving into classes?`,
  }),
  ({ name, companionName }) => ({
    title: `Hey ${name}, gentle morning check! 🌅`,
    message: `Checking in with yourself is a superpower. How are you waking up today?`,
  }),
  ({ name, companionName }) => ({
    title: `A fresh morning, ${name}! 🌱`,
    message: `${companionName} is ready whenever you are. Tap to mark your morning mood.`,
  }),
];

const MORNING_AFFIRMATION_VARIANTS: Array<(ctx: { name: string; companionName: string }) => MessageVariant> = [
  ({ name, companionName }) => ({
    title: `You're all set, ${name}! 🌟`,
    message: `Thanks for checking in early today. Remember: take things one step at a time.`,
  }),
  ({ name, companionName }) => ({
    title: `Have a wonderful day, ${name}! 💫`,
    message: `${companionName} is cheering for you today. You've got this!`,
  }),
  ({ name, companionName }) => ({
    title: `Positive morning energy ✨`,
    message: `Small steps matter, ${name}. Be kind to yourself today as you head out!`,
  }),
  ({ name, companionName }) => ({
    title: `Great start, ${name}! 🚀`,
    message: `You've already prioritized yourself today. Keep that positive momentum going!`,
  }),
];

// -------------------------------------------------------------
// 2. Afternoon MicroGoal Reminders (12:00 PM - 5:00 PM)
// -------------------------------------------------------------

const MICROGOAL_VARIANTS: Array<(ctx: { name: string; companionName: string; goalTitle: string }) => MessageVariant> = [
  ({ name, goalTitle }) => ({
    title: `Your tiny mission is waiting! 🎯`,
    message: `Hey ${name}, remember "${goalTitle}"? A quick step today keeps your momentum going!`,
  }),
  ({ name, goalTitle }) => ({
    title: `MicroGoal check-in ⏱️`,
    message: `"${goalTitle}" is on your list today, ${name}. Ready for a quick 2-minute win?`,
  }),
  ({ name, companionName, goalTitle }) => ({
    title: `Mission checkpoint! 🌟`,
    message: `${companionName} here: "${goalTitle}" is waiting. Even starting is a victory!`,
  }),
  ({ name, goalTitle }) => ({
    title: `A little progress today? 🚀`,
    message: `Hey ${name}, got time for "${goalTitle}"? Check it off when you're done!`,
  }),
  ({ name, goalTitle }) => ({
    title: `Quick nudge for your goal 💡`,
    message: `Keep your promise to yourself: "${goalTitle}" is ready whenever you are!`,
  }),
];

// -------------------------------------------------------------
// 3. Evening Reflection (5:00 PM - 9:00 PM)
// -------------------------------------------------------------

const EVENING_VARIANTS: Array<(ctx: { name: string; companionName: string }) => MessageVariant> = [
  ({ name, companionName }) => ({
    title: `Unwinding after a full day? 🌇`,
    message: `Hey ${name}! How was your afternoon? Take a minute with ${companionName} to reflect.`,
  }),
  ({ name, companionName }) => ({
    title: `You made it through the day! 🌆`,
    message: `Highs, lows, or somewhere in between? ${name}, your thoughts matter. Want to log your evening feelings?`,
  }),
  ({ name, companionName }) => ({
    title: `Evening reflection check 🌙`,
    message: `No pressure, ${name}. Just a quiet pause to notice how your body and mind are feeling right now.`,
  }),
  ({ name, companionName }) => ({
    title: `Checking in as dusk falls 🌆`,
    message: `Wrap up your day on a mindful note, ${name}. Log today's closing emotion!`,
  }),
  ({ name, companionName }) => ({
    title: `Time to reflect, ${name} ✨`,
    message: `A small reflection can bring big clarity. Tap to share how today treated you.`,
  }),
];

// -------------------------------------------------------------
// 4. Night Wind-Down (9:00 PM - 11:00 PM)
// -------------------------------------------------------------

const NIGHT_VARIANTS: Array<(ctx: { name: string; companionName: string }) => MessageVariant> = [
  ({ name, companionName }) => ({
    title: `Time to power down, ${name} 🌙`,
    message: `You did enough today. Fancy a quick 2-minute breathing exercise before sleep?`,
  }),
  ({ name, companionName }) => ({
    title: `Gentle wind-down tonight 🛌`,
    message: `Rest is productive too, ${name}. Let go of today's stresses with a quiet moment.`,
  }),
  ({ name, companionName }) => ({
    title: `Sweet dreams, ${name} ⭐`,
    message: `No goals, no to-dos tonight. Just a peaceful breathing break with ${companionName}.`,
  }),
  ({ name, companionName }) => ({
    title: `Quiet night pause 🕯️`,
    message: `Slow your breathing, unclench your shoulders, and give yourself credit for today, ${name}.`,
  }),
  ({ name, companionName }) => ({
    title: `Nighttime serenity 🌌`,
    message: `Leave today behind, ${name}. Tomorrow is a completely fresh start. Sleep well!`,
  }),
];

// -------------------------------------------------------------
// Public Selectors
// -------------------------------------------------------------

export function getMorningCheckinMessage(context: EngagementContext): MessageVariant {
  const name = sanitizeName(context.name);
  const companionName = context.companionName || "Emoty";
  const seed = context.seed ?? Date.now();
  return selectVariant(MORNING_CHECKIN_VARIANTS, seed, { name, companionName, goalTitle: "" });
}

export function getMorningAffirmationMessage(context: EngagementContext): MessageVariant {
  const name = sanitizeName(context.name);
  const companionName = context.companionName || "Emoty";
  const seed = context.seed ?? Date.now();
  return selectVariant(MORNING_AFFIRMATION_VARIANTS, seed, { name, companionName, goalTitle: "" });
}

export function getMicroGoalReminderMessage(context: EngagementContext): MessageVariant {
  const name = sanitizeName(context.name);
  const companionName = context.companionName || "Emoty";
  const goalTitle = context.goalTitle ? context.goalTitle.slice(0, 45) : "your goal";
  const seed = context.seed ?? Date.now();
  return selectVariant(MICROGOAL_VARIANTS, seed, { name, companionName, goalTitle });
}

export function getEveningReflectionMessage(context: EngagementContext): MessageVariant {
  const name = sanitizeName(context.name);
  const companionName = context.companionName || "Emoty";
  const seed = context.seed ?? Date.now();
  return selectVariant(EVENING_VARIANTS, seed, { name, companionName, goalTitle: "" });
}

export function getNightWindDownMessage(context: EngagementContext): MessageVariant {
  const name = sanitizeName(context.name);
  const companionName = context.companionName || "Emoty";
  const seed = context.seed ?? Date.now();
  return selectVariant(NIGHT_VARIANTS, seed, { name, companionName, goalTitle: "" });
}
