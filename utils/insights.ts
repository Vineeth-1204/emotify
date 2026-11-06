export interface UserState {
  triage_level: 'mild' | 'moderate' | 'severe' | 'suicide_flag' | 'psychosis_flag';
  alias: string;
  recentEmotions?: any[];
  recentTools?: any[];
}

export function generateInsightMessage(state: UserState): { greeting: string; recommendation: string; context: string } {
  const { triage_level, alias, recentEmotions, recentTools } = state;
  
  let greeting = `Hi ${alias}, how are you feeling today?`;
  let recommendation = "";
  let context = "";

  if (triage_level === 'suicide_flag' || triage_level === 'psychosis_flag' || triage_level === 'severe') {
    greeting = `We're here for you, ${alias}.`;
    recommendation = "Counselor check-in requested.";
    context = "Your results show you're carrying a heavy load right now. Please focus on simple comforts and let your counselor help you navigate this.";
  } else if (triage_level === 'moderate') {
    greeting = `Good to see you, ${alias}.`;
    recommendation = "Guided Self-Help";
    context = "You're experiencing some real challenges. Let's build a steady routine using the tools below to support your resilience.";
  } else {
    greeting = `Welcome back, ${alias}.`;
    recommendation = "Self-Help Journey";
    context = "You're doing well. Keep up the great consistency with your daily emotional check-ins to maintain your momentum.";
  }

  // Adjust context if they have recent tool usage or emotions
  if (recentEmotions && recentEmotions.length > 0 && triage_level === 'mild') {
    const latestEmotion = recentEmotions[0];
    if (latestEmotion.preIntensity > 7) {
      context = "I see your recent emotions have been intense. Remember to use JPMR to relax.";
    }
  }

  if (recentTools && recentTools.length > 0) {
     if (recentTools.length > 3) {
       greeting = `Great job staying active with the tools, ${alias}!`;
     }
  }

  return { greeting, recommendation, context };
}
