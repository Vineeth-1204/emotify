import { v, ConvexError } from "convex/values";
import { mutation, query, action, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Helper to sanitize inputs
function sanitizeInput(input: string): string {
  let sanitized = input.slice(0, 1500);
  sanitized = sanitized.replace(/<[^>]*>/g, ""); // Strip HTML
  sanitized = sanitized.replace(/['"\\]/g, "");  // Strip escape patterns
  return sanitized.trim();
}

// ----------------------------------------------------
// 1. PUBLIC QUERIES & MUTATIONS
// ----------------------------------------------------

/** Retrieve a CBT session by ID. Validates patient or admin status. */
export const getSession = query({
  args: { sessionId: v.id("cbtSessions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    // Allow the student or an admin to access the session
    if (session.userId !== userId) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
        .first();
      if (!user || user.role !== "admin") {
        throw new Error("Unauthorized to access this session.");
      }
    }

    return session;
  },
});

export const getActiveApiKey = query({
  args: {},
  handler: async (ctx) => {
    const keyDoc = await ctx.db.query("apiKeys").order("desc").first();
    if (!keyDoc) return null;
    if (keyDoc.expiresAt && keyDoc.expiresAt < Date.now()) return null;
    return keyDoc.key || null;
  }
});

export const insertApiKey = mutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    // Purge old keys to keep table clean and prevent invalid key attempts
    const existing = await ctx.db.query("apiKeys").collect();
    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }

    return await ctx.db.insert("apiKeys", {
      key: args.key,
      createdAt: Date.now(),
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
    });
  }
});

/** Start a new CBT session, or resume an existing active session. */
export const startSession = mutation({
  args: { forceNew: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    if (!args.forceNew) {
      // Find the latest active session
      const activeSession = await ctx.db
        .query("cbtSessions")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .order("desc")
        .first();

      if (activeSession && activeSession.sessionStatus === "active") {
        return { session: activeSession, resumed: true };
      }
    }

    // Otherwise start a new session
    const greeting = "Hello. I'm here to support you today. What's on your mind? Tell me a bit about what's been bothering you recently.";
    const sessionId = await ctx.db.insert("cbtSessions", {
      userId,
      conversation: [
        { role: "assistant", content: greeting, timestamp: Date.now() }
      ],
      stepIndex: 0,
      timestamp: Date.now(),
      sessionStatus: "active",
      currentStep: "understanding",
      riskFlags: [],
    });

    const newSession = await ctx.db.get(sessionId);
    return { session: newSession, resumed: false };
  },
});

/** Update front-half session context (situation, automatic thought, emotion, intensity before). */
export const updateSessionContext = mutation({
  args: {
    sessionId: v.id("cbtSessions"),
    situation: v.optional(v.string()),
    automaticThought: v.optional(v.string()),
    emotion: v.optional(v.string()),
    emotionBefore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) throw new Error("Unauthorized or not found");

    const patch: any = {};
    if (args.situation !== undefined) patch.situation = sanitizeInput(args.situation);
    if (args.automaticThought !== undefined) patch.automaticThought = sanitizeInput(args.automaticThought);
    if (args.emotion !== undefined) patch.emotion = args.emotion;
    if (args.emotionBefore !== undefined) patch.emotionBefore = args.emotionBefore;

    await ctx.db.patch(args.sessionId, patch);
    return { success: true };
  },
});

/** Select and store the student's chosen/edited balanced thought. */
export const selectBalancedThought = mutation({
  args: { sessionId: v.id("cbtSessions"), thought: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) throw new Error("Unauthorized or not found");

    await ctx.db.patch(args.sessionId, {
      balancedThought: args.thought,
      currentStep: "belief",
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

/** Store the belief rating in the balanced thought. */
export const submitBeliefRating = mutation({
  args: { sessionId: v.id("cbtSessions"), score: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) throw new Error("Unauthorized or not found");

    if (args.score < 0 || args.score > 100) throw new Error("Belief score must be 0-100");

    await ctx.db.patch(args.sessionId, {
      beliefScore: args.score,
      currentStep: "emotion_after",
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

/** Store the post-CBT emotion intensity. Sets currentStep to recovery_coach. */
export const submitEmotionAfterRating = mutation({
  args: { sessionId: v.id("cbtSessions"), intensity: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) throw new Error("Unauthorized or not found");

    if (args.intensity < 0 || args.intensity > 10) throw new Error("Intensity must be 0-10");

    await ctx.db.patch(args.sessionId, {
      emotionAfter: args.intensity,
      currentStep: "recovery_coach",
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

/** Accepts the recommended micro-goal. Schedules it for the user and completes the session. */
export const acceptGoal = mutation({
  args: { sessionId: v.id("cbtSessions"), selectedGoalIds: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) throw new Error("Unauthorized or not found");

    // Resolve which goals were selected
    let chosenIds = args.selectedGoalIds;
    let selectedGoals: any[] = [];

    if (session.recommendedGoals && session.recommendedGoals.length > 0) {
      if (!chosenIds) {
        chosenIds = [session.recommendedGoals[0].id];
      }
      selectedGoals = session.recommendedGoals.filter(g => chosenIds?.includes(g.id));
    } else if (session.recommendedGoal) {
      if (!chosenIds) {
        chosenIds = [session.recommendedGoal.id];
      }
      if (chosenIds.includes(session.recommendedGoal.id)) {
        selectedGoals = [session.recommendedGoal];
      }
    }

    if (selectedGoals.length === 0) {
      throw new Error("No valid goals selected.");
    }

    const todayStr = new Date().toISOString().split("T")[0];

    // Create the chosen goals in Emotify's microGoals table
    for (const chosenGoal of selectedGoals) {
      await ctx.db.insert("microGoals", {
        userId,
        goalId: chosenGoal.id,
        goalTitle: chosenGoal.title,
        goalDescription: chosenGoal.description,
        category: chosenGoal.category,
        difficulty: chosenGoal.difficulty,
        points: chosenGoal.points || 25,
        completed: false,
        skipped: false,
        createdAt: Date.now(),
        cbtSessionId: args.sessionId,
        estimatedMinutes: chosenGoal.estimatedMinutes,
        targetEmotion: chosenGoal.targetEmotion,
        targetBehaviour: chosenGoal.targetBehaviour,
        aiReason: chosenGoal.aiReason,
        status: "pending",
        goal: chosenGoal.title, // backward compatibility
        date: todayStr, // backward compatibility
      });
    }

    // Complete parent session
    await ctx.db.patch(args.sessionId, {
      selectedGoalIds: chosenIds,
      goalCompletion: true,
      sessionStatus: "completed",
      currentStep: "completed",
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

/** Skips the recommended micro-goal and completes the session. */
export const skipGoal = mutation({
  args: { sessionId: v.id("cbtSessions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) throw new Error("Unauthorized or not found");

    await ctx.db.patch(args.sessionId, {
      goalCompletion: false,
      sessionStatus: "completed",
      currentStep: "completed",
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

/** Ends the CBT session early. */
export const endSession = mutation({
  args: { sessionId: v.id("cbtSessions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) throw new Error("Unauthorized or not found");

    await ctx.db.patch(args.sessionId, {
      sessionStatus: "completed",
      currentStep: "completed",
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

/** Retrieve the history of CBT sessions for the patient. */
export const getHistory = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject;

    return await ctx.db
      .query("cbtSessions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

// ----------------------------------------------------
// 2. INTERNAL MUTATION (For Actions to update session DB state)
// ----------------------------------------------------

export const updateSessionInternal = internalMutation({
  args: {
    sessionId: v.id("cbtSessions"),
    updates: v.any() // accepts arbitrary patch parameters
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, args.updates);
  }
});

// ----------------------------------------------------
// 3. AI ACTION - PROCESS INCOMING MESSAGES (BRAIN 1 & 2)
// ----------------------------------------------------

export const submitMessage = action({
  args: {
    sessionId: v.id("cbtSessions"),
    content: v.string()
  },
  handler: async (ctx, args): Promise<any> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const sanitizedMsg = sanitizeInput(args.content);

    // 1. Fetch current session state
    const session = await ctx.runQuery(api.cbt.getSession, { sessionId: args.sessionId });
    if (!session) throw new Error("CBT session not found.");
    if (session.sessionStatus !== "active") {
      throw new Error(`This session is no longer active (Status: ${session.sessionStatus}).`);
    }

    const conversationHistory = [...session.conversation, { role: "user", content: sanitizedMsg, timestamp: Date.now() }];

    // Save user message immediately to session (Visual Feedback / State durability)
    await ctx.runMutation(internal.cbt.updateSessionInternal, {
      sessionId: args.sessionId,
      updates: { conversation: conversationHistory, timestamp: Date.now() }
    });

    const dbKey = await ctx.runQuery(api.cbt.getActiveApiKey);
    const envKey = process.env.GEMINI_API_KEY || null;
    const apiKeys = Array.from(new Set([dbKey, envKey].filter(Boolean) as string[]));

    if (apiKeys.length === 0) {
      console.warn("No GEMINI_API_KEY found in DB or env. Running offline CBT fallback.");
      return await handleMockResponse(ctx, args.sessionId, session, sanitizedMsg, conversationHistory);
    }

    try {
      // Construct prompt based on current step
      const responseJson = await callGeminiEngine(apiKeys, session.currentStep, conversationHistory);

      // 2. SAFETY GATE: Assess Immediate Danger
      if (responseJson.riskDetected) {
        const safetyMessage = responseJson.responseMessage || "I'm hearing that you are going through a really difficult time right now, and I want to make sure you are safe. Please know you are not alone and help is available. I encourage you to contact the Suicide & Crisis Lifeline by calling or texting 988, or reach out to a trusted family member or counsellor. Please contact someone who can help support you right now.";

        // Save safety alerts in database
        await ctx.runMutation(api.alerts.createAlert, {
          userId: session.userId,
          type: "suicideRisk",
        });

        const updatedHistory = [...conversationHistory, { role: "assistant", content: safetyMessage, timestamp: Date.now() }];
        await ctx.runMutation(internal.cbt.updateSessionInternal, {
          sessionId: args.sessionId,
          updates: {
            conversation: updatedHistory,
            sessionStatus: "safety_mode",
            currentStep: "safety_mode",
            riskFlags: responseJson.riskFlags || ["high_distress"],
            timestamp: Date.now()
          }
        });
        return { responseMessage: safetyMessage, step: "safety_mode" };
      }

      // 3. SUPPORT MODE GATE: Check Unresponsive / Rejecting
      if (responseJson.isUnresponsiveOrRejecting) {
        const supportMessage = responseJson.responseMessage || "It sounds like you might not want to discuss this right now, and that is completely okay. Let's take a pause. We can try some breathing exercises or look at some comforting cards. I'm here for you.";
        const updatedHistory = [...conversationHistory, { role: "assistant", content: supportMessage, timestamp: Date.now() }];
        await ctx.runMutation(internal.cbt.updateSessionInternal, {
          sessionId: args.sessionId,
          updates: {
            conversation: updatedHistory,
            sessionStatus: "support_mode",
            currentStep: "support_mode",
            timestamp: Date.now()
          }
        });
        return { responseMessage: supportMessage, step: "support_mode" };
      }

      // 4. STEP STATE TRANSITIONS
      if (session.currentStep === "understanding") {
        if (responseJson.hasSufficientUnderstanding) {
          // Transition to next phase!
          const det = responseJson.internalDeterminations;
          const updates: any = {
            situation: det.situation,
            automaticThought: det.automaticThought,
            emotion: det.emotion,
            emotionBefore: det.emotionIntensity,
            thinkingStyle: responseJson.thinkingStyle,
            timestamp: Date.now()
          };

          if (responseJson.clarificationNeeded) {
            // Clarification needed
            updates.currentStep = "clarification";
            updates.clarificationQuestion = responseJson.clarificationQuestion;
            updates.clarificationOptions = responseJson.clarificationOptions;

            const reply = responseJson.responseMessage || `Which of these sounds closer to what you're thinking?\n1. ${responseJson.clarificationOptions[0]}\n2. ${responseJson.clarificationOptions[1]}`;
            const updatedHistory = [...conversationHistory, { role: "assistant", content: reply, timestamp: Date.now() }];
            updates.conversation = updatedHistory;

            await ctx.runMutation(internal.cbt.updateSessionInternal, { sessionId: args.sessionId, updates });
            return { responseMessage: reply, step: "clarification", options: responseJson.clarificationOptions };
          } else {
            // High confidence, skip clarification, go to Guided Discovery
            updates.currentStep = "guided_discovery";
            updates.cbtDistortion = responseJson.cbtDistortion || "General Trap";
            updates.challengeQuestions = responseJson.challengeQuestions || [
              "What evidence supports this thought?",
              "What evidence goes against it?",
              "What would you tell a close friend who had this thought?"
            ];
            updates.challengeAnswers = [];
            updates.stepIndex = 0;

            const firstQuestion = updates.challengeQuestions[0];
            const reply = `${responseJson.responseMessage || "I think I understand what you're going through. Let's look at this together."}\n\n${firstQuestion}`;
            const updatedHistory = [...conversationHistory, { role: "assistant", content: reply, timestamp: Date.now() }];
            updates.conversation = updatedHistory;

            await ctx.runMutation(internal.cbt.updateSessionInternal, { sessionId: args.sessionId, updates });
            return { responseMessage: reply, step: "guided_discovery" };
          }
        } else {
          // Keep chatting to understand
          const reply = responseJson.responseMessage || "I see. Tell me a bit more about what makes you feel that way.";
          const updatedHistory = [...conversationHistory, { role: "assistant", content: reply, timestamp: Date.now() }];
          await ctx.runMutation(internal.cbt.updateSessionInternal, {
            sessionId: args.sessionId,
            updates: { conversation: updatedHistory, timestamp: Date.now() }
          });
          return { responseMessage: reply, step: "understanding" };
        }
      }

      if (session.currentStep === "clarification") {
        // User answered clarification question.
        // Identify cognitive distortion internally, generate challenge questions, ask 1st.
        const firstQuestion = responseJson.challengeQuestions?.[0] || "What evidence supports this thought?";
        const reply = `${responseJson.responseMessage || "Thank you for clarifying."}\n\n${firstQuestion}`;

        const updatedHistory = [...conversationHistory, { role: "assistant", content: reply, timestamp: Date.now() }];
        await ctx.runMutation(internal.cbt.updateSessionInternal, {
          sessionId: args.sessionId,
          updates: {
            conversation: updatedHistory,
            clarificationAnswer: sanitizedMsg,
            currentStep: "guided_discovery",
            cbtDistortion: responseJson.cbtDistortion || "Cognitive Trap",
            challengeQuestions: responseJson.challengeQuestions || [
              "What evidence supports this thought?",
              "What evidence goes against it?",
              "What would you tell a close friend?"
            ],
            challengeAnswers: [],
            stepIndex: 0,
            timestamp: Date.now()
          }
        });
        return { responseMessage: reply, step: "guided_discovery" };
      }

      if (session.currentStep === "guided_discovery") {
        const answers = session.challengeAnswers || [];
        answers.push(sanitizedMsg);
        const index = session.stepIndex;

        if (index < 2) {
          // Move to next challenge question
          const nextIndex = index + 1;
          const nextQuestion = session.challengeQuestions?.[nextIndex] || "Could you tell me more?";
          const reply = nextQuestion;

          const updatedHistory = [...conversationHistory, { role: "assistant", content: reply, timestamp: Date.now() }];
          await ctx.runMutation(internal.cbt.updateSessionInternal, {
            sessionId: args.sessionId,
            updates: {
              conversation: updatedHistory,
              challengeAnswers: answers,
              stepIndex: nextIndex,
              timestamp: Date.now()
            }
          });
          return { responseMessage: reply, step: "guided_discovery" };
        } else {
          // Transition to Reflection
          const reflectionPrompt = "Reflecting on all of this, what do you think now?";
          const updatedHistory = [...conversationHistory, { role: "assistant", content: reflectionPrompt, timestamp: Date.now() }];

          await ctx.runMutation(internal.cbt.updateSessionInternal, {
            sessionId: args.sessionId,
            updates: {
              conversation: updatedHistory,
              challengeAnswers: answers,
              currentStep: "reflection",
              timestamp: Date.now()
            }
          });
          return { responseMessage: reflectionPrompt, step: "reflection" };
        }
      }

      if (session.currentStep === "reflection") {
        // User has submitted reflection. Generate 3 balanced thoughts.
        const thoughts = responseJson.balancedThoughts || [
          "I might make mistakes, but I can learn and improve over time.",
          "This situation is stressful, but it doesn't define my whole value.",
          "I don't have to be perfect to do a good job."
        ];
        const intro = responseJson.responseMessage || "I've drafted three balanced thoughts based on our chat. Which one feels most helpful to you? Feel free to select and customize it:";

        const updatedHistory = [...conversationHistory, { role: "assistant", content: `${intro}\n\n1. ${thoughts[0]}\n\n2. ${thoughts[1]}\n\n3. ${thoughts[2]}`, timestamp: Date.now() }];
        await ctx.runMutation(internal.cbt.updateSessionInternal, {
          sessionId: args.sessionId,
          updates: {
            conversation: updatedHistory,
            reflection: sanitizedMsg,
            balancedThoughtsOptions: thoughts,
            currentStep: "balanced_thought",
            timestamp: Date.now()
          }
        });

        return { responseMessage: intro, step: "balanced_thought", thoughtsOptions: thoughts };
      }

      // Default fallback
      return { responseMessage: "I see. Let's continue.", step: session.currentStep };

    } catch (error) {
      console.warn("Gemini API call unavailable/timed out. Switching to offline CBT fallback logic:", error);
      return await handleMockResponse(ctx, args.sessionId, session, sanitizedMsg, conversationHistory);
    }
  }
});

// ----------------------------------------------------
// 4. AI ACTION - RECOVERY COACH GOAL RECOMMENDATION (BRAIN 3)
// ----------------------------------------------------

export const getRecentPatientGoals = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("microGoals")
      .withIndex("by_userId", (q: any) => q.eq("userId", args.userId))
      .order("desc")
      .take(15);
  }
});

export const recommendGoalAction = action({
  args: { sessionId: v.id("cbtSessions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    // Fetch session details
    const session = await ctx.runQuery(api.cbt.getSession, { sessionId: args.sessionId });
    if (!session) throw new Error("Session not found");

    // Fetch student clinical context for high-quality recommendations
    const screenings = await ctx.runQuery(api.screening.getAll, { userId });
    const wellness = await ctx.runQuery(api.wellness.getProfile, { userId });
    const streak = await ctx.runQuery(api.microGoals.getStreak, { userId });
    const recentGoals = await ctx.runQuery(api.cbt.getRecentPatientGoals, { userId });

    const latestScreening = screenings?.[0];
    const phq9 = latestScreening?.phq9_total ?? 0;
    const gad7 = latestScreening?.gad7_total ?? 0;

    const isHighRisk = session.riskFlags !== undefined && session.riskFlags.length > 0;

    const dbKey = await ctx.runQuery(api.cbt.getActiveApiKey);
    const envKey = process.env.GEMINI_API_KEY;
    const apiKeys = Array.from(new Set([dbKey, envKey].filter(Boolean) as string[]));

    if (apiKeys.length === 0) {
      // Mock Fallback goal recommendation
      const mockGoals = getMockGoalRecommendations(session.situation || "stress", phq9, gad7, isHighRisk);
      await ctx.runMutation(internal.cbt.updateSessionInternal, {
        sessionId: args.sessionId,
        updates: {
          recommendedGoals: mockGoals,
          recommendedGoal: mockGoals[0],
          timestamp: Date.now()
        }
      });
      return mockGoals;
    }

    try {
      const recentGoalsText = recentGoals && recentGoals.length > 0
        ? recentGoals.map((g: any) => `- Goal: "${g.goalTitle}" | Category: "${g.category}" | Completed: ${g.completed} | Skipped: ${g.skipped}`).join("\n")
        : "No goals completed yet.";

      let prompt = "";
      if (isHighRisk) {
        prompt = `You are a supportive clinical CBT recovery coach. The student's CBT session has been flagged as HIGH RISK (extreme distress, self-harm, or critical indicators).
Do NOT recommend ordinary behavioral activation goals (like studying, exercising, or social outings).
Instead, recommend exactly 4 supportive recovery or crisis support actions to help them stay safe and grounded today.

Personalize based on context:
- Situation: "${session.situation || "Crisis Distress"}"
- Automatic Thought: "${session.automaticThought || "Crisis Distress"}"
- Emotion: "${session.emotion || "Overwhelm"}"
- Screening: PHQ-9 ${phq9}, GAD-7 ${gad7}

Choose from actions like:
1. Contacting a trusted person (friend, parent, relative) for support.
2. Reaching out to their clinical counselor.
3. Conducting a 5-4-3-2-1 sensory grounding exercise.
4. Accessing emergency crisis resources (dialing 988 Lifeline).

Output the result ONLY as a JSON object matching this structure:
{
  "goals": [
    {
      "id": "string",
      "title": "Clear, Short Goal Title (max 6 words)",
      "description": "Short, supportive explanation of what to do (1-2 sentences)",
      "category": "Self Care" | "Mindfulness" | "Social Connection",
      "difficulty": "Easy",
      "estimatedMinutes": number (e.g. 2, 5),
      "points": 25,
      "icon": "string" (Ionicons name like "call", "heart", "shield", "people"),
      "targetEmotion": "Distress",
      "targetBehaviour": "Crisis Support",
      "aiReason": "Supportive reasoning explaining that safety and emotional containment are top priorities right now.",
      "completed": false,
      "skipped": false
    }
  ]
}

Do NOT output markdown format, other text, or wrapper tags. Return raw JSON.`;
      } else {
        prompt = `You are a clinical CBT recovery coach recommending exactly 4 micro-goals for behavioural activation based on the student's counselling session.
Use the student context and history to personalize the goals so they feel relevant, achievable, and helpful:

Context:
- Situation: "${session.situation || "Unknown context"}"
- Automatic Thought: "${session.automaticThought || "Unknown"}"
- Emotion: "${session.emotion || "Anxiety/Stress"}" (Intensity: ${session.emotionBefore || 5}/10)
- Thinking Style: "${session.thinkingStyle || "General"}"
- Identified CBT Distortion: "${session.cbtDistortion || "General"}"
- Student Clinical Screener: PHQ-9: ${phq9}/27, GAD-7: ${gad7}/21
- Wellness Goals: ${JSON.stringify(wellness?.wellness_goals || [])}
- Current Streak: ${streak?.currentStreak || 0} days

User's Recent Goal History:
${recentGoalsText}

Instructions for memory:
1. Recommend exactly 4 distinct, bite-sized micro-goals. They must be extremely small, highly actionable, and simple to help the student feel success today (e.g. Study for 10 minutes, Drink water, Grounding exercise, Walk for 5 minutes, Message a friend).
2. Learn from previous behavior:
   - If the student repeatedly skipped a goal (e.g. mindfulness or meditation), do NOT recommend it. Suggest an alternate activity.
   - If they consistently completed a goal (e.g. journaling), prioritize reflective journaling exercises.
   - Avoid recommending identical goals to what they completed or skipped within the last 7 days unless clinically appropriate.
3. Keep the goals realistic. If the student has high depression (PHQ-9 >= 15) or high anxiety (GAD-7 >= 15), make the goals extremely simple (e.g., "Splash face with water", "Take 3 deep breaths", "Look out window for 1 minute"). Do not overwhelm them.
4. Output the result ONLY as a JSON object matching this structure:
{
  "goals": [
    {
      "id": "string",
      "title": "Clear, Short Goal Title (max 6 words)",
      "description": "Short, supportive explanation of what to do (1-2 sentences)",
      "category": "Exercise" | "Mindfulness" | "Breathing" | "Hydration" | "Journaling" | "Self Care" | "Social Connection" | "Study Balance",
      "difficulty": "Easy" | "Medium",
      "estimatedMinutes": number,
      "points": 25,
      "icon": "string" (Ionicons name like "walk", "water", "book", "chatbubble", "create", "heart", "leaf"),
      "targetEmotion": "string" (the emotion this goal targets),
      "targetBehaviour": "string" (the maladaptive behavior or avoidance it addresses),
      "aiReason": "Supportive rationale explaining why this helps their specific situation (max 1 sentence)",
      "completed": false,
      "skipped": false
    }
  ]
}

Do NOT output markdown format, other text, or wrapper tags. Return raw JSON.`;
      }

      const resJson = await fetchGeminiWithFallback(apiKeys, {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2048 }
      }, 25000);

      const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
      const cleaned = cleanJsonResponse(text);
      let goalJson;
      try {
        goalJson = JSON.parse(cleaned);
      } catch (e) {
        console.warn("Failed to parse Gemini Goal Recommendation JSON:", cleaned);
        throw e;
      }

      const goalsList = goalJson.goals || [];

      await ctx.runMutation(internal.cbt.updateSessionInternal, {
        sessionId: args.sessionId,
        updates: {
          recommendedGoals: goalsList,
          recommendedGoal: goalsList[0], // backward compatibility
          timestamp: Date.now()
        }
      });

      return goalsList;

    } catch (err) {
      console.warn("Error generating goal recommendation, falling back to mock goals:", err);
      const mockGoals = getMockGoalRecommendations(session.situation || "stress", phq9, gad7, isHighRisk);
      await ctx.runMutation(internal.cbt.updateSessionInternal, {
        sessionId: args.sessionId,
        updates: {
          recommendedGoals: mockGoals,
          recommendedGoal: mockGoals[0],
          timestamp: Date.now()
        }
      });
      return mockGoals;
    }
  }
});

// ----------------------------------------------------
// 5. HELPER FUNCTIONS & MOCK FALLBACKS
// ----------------------------------------------------

function cleanJsonResponse(rawText: string | undefined): string {
  if (!rawText) return "{}";
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/i, "");
    cleaned = cleaned.replace(/\n?```$/, "");
    cleaned = cleaned.trim();
  }

  // Replace invalid escaped apostrophes \' or \’ with normal apostrophe '
  cleaned = cleaned.replace(/\\'/g, "'");
  cleaned = cleaned.replace(/\\’/g, "’");

  // Auto-repair JSON if truncated
  if (!cleaned.endsWith("}")) {
    // If trailing comma, strip it
    if (cleaned.endsWith(",")) {
      cleaned = cleaned.substring(0, cleaned.length - 1).trim();
    }
    // Check if double quote is open
    let openQuotes = 0;
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '"' && (i === 0 || cleaned[i - 1] !== '\\')) {
        openQuotes++;
      }
    }
    if (openQuotes % 2 !== 0) {
      cleaned += '"';
    }

    // Balance braces and brackets
    const braces: string[] = [];
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{') {
        braces.push('}');
      } else if (cleaned[i] === '[') {
        braces.push(']');
      } else if (cleaned[i] === '}') {
        braces.pop();
      } else if (cleaned[i] === ']') {
        braces.pop();
      }
    }
    while (braces.length > 0) {
      cleaned += braces.pop();
    }
  }

  const startIdx = cleaned.indexOf("{");
  if (startIdx === -1) return cleaned;

  let braceCount = 0;
  for (let i = startIdx; i < cleaned.length; i++) {
    if (cleaned[i] === "{") {
      braceCount++;
    } else if (cleaned[i] === "}") {
      braceCount--;
      if (braceCount === 0) {
        return cleaned.substring(startIdx, i + 1);
      }
    }
  }
  return cleaned;
}

async function fetchGeminiWithFallback(apiKeys: string | string[], payload: any, timeoutMs = 45000): Promise<any> {
  const keys = (Array.isArray(apiKeys) ? apiKeys : [apiKeys]).filter((k): k is string => Boolean(k) && typeof k === "string");
  // gemini-3.1-flash-lite first (faster, lower latency), gemini-3.5-flash as fallback
  const models = ["gemini-3.1-flash-lite", "gemini-3.5-flash"];
  let lastError: any = null;

  for (const apiKey of keys) {
    let keyFailedWithRateLimitOrAuth = false;
    for (const model of models) {
      if (keyFailedWithRateLimitOrAuth) break;

      for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (response.ok) {
            return await response.json();
          }

          const status = response.status;
          lastError = new Error(`Gemini API HTTP ${status} on ${model}`);
          if (status === 401 || status === 403 || status === 429) {
            console.warn(`Gemini API key hit rate limit/auth error (HTTP ${status}). Trying next key/fallback...`);
            keyFailedWithRateLimitOrAuth = true;
            break;
          } else if (status === 503 || status >= 500) {
            console.warn(`Gemini API ${model} returned HTTP ${status} (attempt ${attempt + 1}). Retrying...`);
            await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
            continue;
          } else {
            break; // Move to next model if 404
          }
        } catch (err: any) {
          clearTimeout(timeoutId);
          lastError = err;
          const isAbort = err.name === "AbortError" || err.message === "AbortError" || err.message?.includes("abort");
          if (isAbort) {
            console.warn(`Gemini API call timed out after ${timeoutMs}ms for model ${model}. Trying next model...`);
            break; // Don't retry on timeout — move to next model immediately
          } else {
            console.warn(`Gemini API call network error for model ${model}:`, err?.message || err);
            await new Promise((resolve) => setTimeout(resolve, 400));
          }
        }
      }
    }
  }

  throw lastError || new Error("All Gemini API keys and models failed");
}

async function callGeminiEngine(apiKey: string | string[], step: string, history: any[]): Promise<any> {
  let promptDetails = "";

  if (step === "understanding") {
    promptDetails = `You are Brain 1 (Understanding Engine).
Your goal is to understand the student's concern. Listen carefully and ask follow-up questions.
NEVER rush into CBT. NEVER use clinical terms like CBT, Cognitive Distortion, catastrophizing, emotional reasoning, overgeneralization, personalization, should statements, etc.
Assess risk: suicide risk, self-harm, worthlessness, panic, extreme emotional distress, psychosis.

Analyze history. If you have sufficient understanding of the Situation, Automatic Thought, and Emotion, set hasSufficientUnderstanding to true and fill internalDeterminations and distortions fields.
Otherwise, set hasSufficientUnderstanding to false, and ask one follow-up question in responseMessage.
If the user repeatedly types "leave me alone", "I don't know", "nothing", set isUnresponsiveOrRejecting to true and provide a gentle close message.

JSON schema to return:
{
  "riskDetected": boolean,
  "riskFlags": ["suicide" | "self_harm" | "extreme_distress" | "psychosis" | "abuse"],
  "isUnresponsiveOrRejecting": boolean,
  "hasSufficientUnderstanding": boolean,
  "internalDeterminations": {
    "situation": "string",
    "automaticThought": "string",
    "emotion": "string",
    "emotionIntensity": number (0-10)
  },
  "thinkingStyle": "I'm worried about what might happen" | "I'm being hard on myself" | "I keep blaming myself" | "I'm worried about what others think" | "I feel I should have done better" | "I feel stuck because I can't control things",
  "clarificationNeeded": boolean,
  "clarificationQuestion": "student-friendly choice question presenting the two traps, e.g. Which of these sounds closer?",
  "clarificationOptions": ["option A", "option B"] (exactly 2 user-friendly choices representing the traps),
  "cbtDistortion": "Internal clinical distortion name (e.g. Catastrophizing, Overgeneralization, Should Statements, Personalization, Black-and-White Thinking, Mental Filtering, Jumping to Conclusions, Blaming, Control Fallacy)",
  "challengeQuestions": ["question 1", "question 2", "question 3"] (exactly 3 challenge questions tailored to the distortion),
  "responseMessage": "Compassionate reply: follow-up question, or opening line to clarification/guided discovery. Keep it brief (2-3 sentences max) and natural."
}`;
  } else if (step === "clarification") {
    promptDetails = `You are Brain 2 (CBT Therapist).
The student has selected a clarification answer.
Identify the exact CBT distortion internally (do not display it in responseMessage).
Generate exactly 3 custom Guided Discovery questions tailored to challenge this distortion (e.g., "What evidence supports this?", "What evidence goes against it?", "What would you tell a friend?").
Response format:
{
  "riskDetected": false,
  "cbtDistortion": "Internal distortion name",
  "challengeQuestions": ["question 1", "question 2", "question 3"],
  "responseMessage": "Warm transition validating the user's choice and introducing the challenge. Max 2 sentences."
}`;
  } else if (step === "reflection") {
    promptDetails = `You are Brain 2 (CBT Therapist).
The student has reflected on the challenges.
Based on the situation, automatic thought, distortion, and their reflection, generate exactly three personalized balanced thoughts.
Each thought must be realistic, constructive, and comforting.
Response format:
{
  "riskDetected": false,
  "balancedThoughts": ["thought 1", "thought 2", "thought 3"] (exactly 3 options),
  "responseMessage": "Gentle transition presenting the options. Keep it short."
}`;
  }

  const systemInstruction = `You are an experienced human mental health counsellor.
You maintain a supportive, warm, natural, and safe environment.
You NEVER use technical psychological jargon (CBT, cognitive distortions, catastrophizing, should statements, etc.) when talking to the user.
You reply in a text-message format: brief, engaging, empathetic, typically 2-3 sentences.
You must output ONLY raw JSON that strictly adheres to the requested schema. Do not enclose in markdown blocks.`;

  const payload = {
    contents: [
      ...history.map(msg => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }]
      })),
      { role: "user", parts: [{ text: promptDetails }] }
    ],
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2048 }
  };

  const resJson = await fetchGeminiWithFallback(apiKey, payload, 25000);
  const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
  const cleaned = cleanJsonResponse(text);
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn("Failed to parse Gemini Dialogue Response JSON:", cleaned);
    throw e;
  }
}

// Handler for local mock/offline fallback
async function handleMockResponse(ctx: any, sessionId: Id<"cbtSessions">, session: any, userMsg: string, history: any[]): Promise<any> {
  const clean = userMsg.toLowerCase();
  const now = Date.now();

  // Safety trigger mock check
  const safetyRegex = /\b(die|suicide|kill myself|self harm|hurt myself)\b/i;
  if (safetyRegex.test(clean)) {
    const safetyMessage = "I'm really concerned to hear that, and I want to support your safety. Please reach out to the Crisis Lifeline by dialing 988 immediately, or contact a trusted friend or counsellor. You are not alone, and there is help available.";

    await ctx.runMutation(api.alerts.createAlert, {
      userId: session.userId,
      type: "suicideRisk",
    });

    const updated = [...history, { role: "assistant", content: safetyMessage, timestamp: now }];
    await ctx.runMutation(internal.cbt.updateSessionInternal, {
      sessionId,
      updates: {
        conversation: updated,
        sessionStatus: "safety_mode",
        currentStep: "safety_mode",
        riskFlags: ["suicide"],
        timestamp: now
      }
    });
    return { responseMessage: safetyMessage, step: "safety_mode" };
  }

  // Unresponsive mock check
  if (clean === "nothing" || clean === "leave me alone" || clean === "i don't know") {
    const supportMessage = "I understand. Taking a break is completely okay. Let's pause and guide you to some calming exercises. I'm here when you're ready.";
    const updated = [...history, { role: "assistant", content: supportMessage, timestamp: now }];
    await ctx.runMutation(internal.cbt.updateSessionInternal, {
      sessionId,
      updates: {
        conversation: updated,
        sessionStatus: "support_mode",
        currentStep: "support_mode",
        timestamp: now
      }
    });
    return { responseMessage: supportMessage, step: "support_mode" };
  }

  // State-by-state transitions in Mock mode
  if (session.currentStep === "understanding") {
    const reply = "I hear you. That sounds really tough. What worries you the most about this situation?";
    // Force transition after 3 turns in mock mode
    const userTurns = history.filter(m => m.role === "user").length;
    if (userTurns >= 3) {
      // Transition to guided discovery directly (skip clarification for mock ease)
      const firstQuestion = "What evidence supports the idea that this is completely ruined?";
      const transitionReply = `I understand. You feel like you're being hard on yourself about this situation.\n\nLet's work through it. First: ${firstQuestion}`;
      const updated = [...history, { role: "assistant", content: transitionReply, timestamp: now }];

      await ctx.runMutation(internal.cbt.updateSessionInternal, {
        sessionId,
        updates: {
          conversation: updated,
          situation: "Stressful event",
          automaticThought: userMsg,
          emotion: "Anxiety",
          emotionBefore: 7,
          thinkingStyle: "I'm being hard on myself",
          cbtDistortion: "All-or-Nothing Thinking",
          challengeQuestions: [
            "What evidence supports this idea?",
            "What evidence goes against it?",
            "What would you tell a friend in this situation?"
          ],
          challengeAnswers: [],
          stepIndex: 0,
          currentStep: "guided_discovery",
          timestamp: now
        }
      });
      return { responseMessage: transitionReply, step: "guided_discovery" };
    } else {
      const updated = [...history, { role: "assistant", content: reply, timestamp: now }];
      await ctx.runMutation(internal.cbt.updateSessionInternal, {
        sessionId,
        updates: { conversation: updated, timestamp: now }
      });
      return { responseMessage: reply, step: "understanding" };
    }
  }

  if (session.currentStep === "guided_discovery") {
    const answers = session.challengeAnswers || [];
    answers.push(userMsg);
    const index = session.stepIndex;

    if (index < 2) {
      const nextIndex = index + 1;
      const nextQuestion = session.challengeQuestions?.[nextIndex] || "Could you tell me more?";
      const updated = [...history, { role: "assistant", content: nextQuestion, timestamp: now }];

      await ctx.runMutation(internal.cbt.updateSessionInternal, {
        sessionId,
        updates: {
          conversation: updated,
          challengeAnswers: answers,
          stepIndex: nextIndex,
          timestamp: now
        }
      });
      return { responseMessage: nextQuestion, step: "guided_discovery" };
    } else {
      const reflectionPrompt = "Reflecting on all of this, what do you think now?";
      const updated = [...history, { role: "assistant", content: reflectionPrompt, timestamp: now }];

      await ctx.runMutation(internal.cbt.updateSessionInternal, {
        sessionId,
        updates: {
          conversation: updated,
          challengeAnswers: answers,
          currentStep: "reflection",
          timestamp: now
        }
      });
      return { responseMessage: reflectionPrompt, step: "reflection" };
    }
  }

  if (session.currentStep === "reflection") {
    const thoughts = [
      "I made a mistake, but it's one event and I can learn from it.",
      "This is challenging, but I have handled tough things before.",
      "I am doing my best, and that is enough for today."
    ];
    const intro = "I've drafted three balanced thoughts based on our chat. Choose the one that fits best:";
    const updated = [...history, { role: "assistant", content: `${intro}\n\n1. ${thoughts[0]}\n\n2. ${thoughts[1]}`, timestamp: now }];

    await ctx.runMutation(internal.cbt.updateSessionInternal, {
      sessionId,
      updates: {
        conversation: updated,
        reflection: userMsg,
        balancedThoughtsOptions: thoughts,
        currentStep: "balanced_thought",
        timestamp: now
      }
    });
    return { responseMessage: intro, step: "balanced_thought", thoughtsOptions: thoughts };
  }

  return { responseMessage: "I see.", step: session.currentStep };
}

function getMockGoalRecommendations(situation: string, phq9: number, gad7: number, isHighRisk = false) {
  if (isHighRisk) {
    return [
      {
        id: "crisis_call",
        title: "Call or text 988 Lifeline",
        description: "Reach out to the 988 Suicide & Crisis Lifeline for free, confidential, 24/7 support.",
        category: "Self Care",
        difficulty: "Easy",
        estimatedMinutes: 2,
        points: 25,
        icon: "call",
        targetEmotion: "Distress",
        targetBehaviour: "Crisis Support",
        aiReason: "Your safety is the top priority right now. Connecting with a support specialist can help you ground yourself.",
        completed: false,
        skipped: false
      },
      {
        id: "crisis_grounding",
        title: "5-4-3-2-1 Grounding exercise",
        description: "Focus on 5 things you see, 4 you feel, 3 you hear, 2 you smell, and 1 you taste.",
        category: "Mindfulness",
        difficulty: "Easy",
        estimatedMinutes: 5,
        points: 25,
        icon: "leaf",
        targetEmotion: "Panic",
        targetBehaviour: "Grounding",
        aiReason: "Grounding yourself helps calm physical panic and brings your focus back to the present.",
        completed: false,
        skipped: false
      },
      {
        id: "crisis_trusted",
        title: "Reach out to a trusted person",
        description: "Send a quick text or call a friend, family member, or someone you feel safe with.",
        category: "Social Connection",
        difficulty: "Easy",
        estimatedMinutes: 3,
        points: 25,
        icon: "people",
        targetEmotion: "Isolation",
        targetBehaviour: "Support seeking",
        aiReason: "You don't have to carry this alone. Reaching out to someone close can provide a safe space.",
        completed: false,
        skipped: false
      },
      {
        id: "crisis_counsellor",
        title: "Message your counselor",
        description: "Leave a message for your school mental health counselor to schedule a check-in.",
        category: "Self Care",
        difficulty: "Easy",
        estimatedMinutes: 2,
        points: 25,
        icon: "mail",
        targetEmotion: "Overwhelm",
        targetBehaviour: "Professional care",
        aiReason: "Informing your counselor ensures you can follow up together when they are online.",
        completed: false,
        skipped: false
      }
    ];
  }

  const breatheGoal = {
    id: "breathe_simple",
    title: "Take 3 deep breaths",
    description: "Close your eyes, breathe in slowly for 4 seconds, and release. Do this three times.",
    category: "Breathing",
    difficulty: "Easy",
    estimatedMinutes: 2,
    points: 25,
    icon: "leaf",
    targetEmotion: "Anxiety",
    targetBehaviour: "Physical Tension",
    aiReason: "Deep breathing activates the vagus nerve to reduce physical anxiety.",
    completed: false,
    skipped: false
  };

  const waterGoal = {
    id: "drink_water",
    title: "Drink a glass of water",
    description: "Go to the kitchen, pour yourself a fresh glass of water, and drink it slowly.",
    category: "Hydration",
    difficulty: "Easy",
    estimatedMinutes: 1,
    points: 25,
    icon: "water",
    targetEmotion: "Tiredness",
    targetBehaviour: "Inaction",
    aiReason: "Hydrating is a quick, low-barrier physical action that breaks the feeling of being stuck.",
    completed: false,
    skipped: false
  };

  const walkGoal = {
    id: "walk_5m",
    title: "Take a 5-minute walk",
    description: "Step outside or walk around your building for five minutes to clear your head.",
    category: "Exercise",
    difficulty: "Easy",
    estimatedMinutes: 5,
    points: 25,
    icon: "walk",
    targetEmotion: "Sadness",
    targetBehaviour: "Avoidance",
    aiReason: "A brief walk shifts your physical environment and increases active circulation.",
    completed: false,
    skipped: false
  };

  const studyGoal = {
    id: "study_5m",
    title: "Study for five minutes",
    description: "Set a timer for just 5 minutes and focus on one single page. You can stop when it goes off.",
    category: "Study Balance",
    difficulty: "Easy",
    estimatedMinutes: 5,
    points: 25,
    icon: "book",
    targetEmotion: "Overwhelm",
    targetBehaviour: "Procrastination",
    aiReason: "Starting with a micro study block helps lower academic panic and builds study momentum.",
    completed: false,
    skipped: false
  };

  const journalGoal = {
    id: "journal_feelings",
    title: "Journal your feelings",
    description: "Write down what happened for five minutes to get the thoughts out of your head.",
    category: "Journaling",
    difficulty: "Easy",
    estimatedMinutes: 5,
    points: 25,
    icon: "create",
    targetEmotion: "Anger",
    targetBehaviour: "Rumination",
    aiReason: "Putting thoughts on paper helps discharge strong emotions and gain clinical distance.",
    completed: false,
    skipped: false
  };

  const sit = situation.toLowerCase();

  if (phq9 >= 15 || gad7 >= 15) {
    return [
      breatheGoal,
      waterGoal,
      {
        id: "look_outside",
        title: "Look outside for 1 minute",
        description: "Stand by a window and notice three things you see outside.",
        category: "Self Care",
        difficulty: "Easy",
        estimatedMinutes: 1,
        points: 25,
        icon: "eye",
        targetEmotion: "Apathy",
        targetBehaviour: "Withdrawal",
        aiReason: "Focusing outside the room interrupts repetitive negative internal dialogue.",
        completed: false,
        skipped: false
      },
      {
        id: "stretch_simple",
        title: "Do 3 gentle stretches",
        description: "Stretch your arms up high, roll your shoulders, and gently tilt your neck.",
        category: "Self Care",
        difficulty: "Easy",
        estimatedMinutes: 2,
        points: 25,
        icon: "body",
        targetEmotion: "Numbness",
        targetBehaviour: "Physical Freeze",
        aiReason: "Gentle stretches bring conscious awareness back into the body to release tension.",
        completed: false,
        skipped: false
      }
    ];
  }

  if (sit.includes("exam") || sit.includes("test") || sit.includes("fail") || sit.includes("study") || sit.includes("work")) {
    return [studyGoal, breatheGoal, waterGoal, walkGoal];
  }

  if (sit.includes("friend") || sit.includes("relationship") || sit.includes("parent") || sit.includes("lonely") || sit.includes("argue")) {
    return [journalGoal, waterGoal, walkGoal, breatheGoal];
  }

  return [walkGoal, breatheGoal, waterGoal, journalGoal];
}
