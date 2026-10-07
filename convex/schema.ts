import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    // Custom authentication fields
    patientId: v.optional(v.string()), // Unique patient ID like 101, 102, 103 based on creation order
    full_name: v.optional(v.string()),
    email: v.optional(v.string()),
    mobile_number: v.optional(v.string()),
    password_hash: v.optional(v.string()),
    role: v.optional(v.string()), // "admin" | "patient"
    status: v.optional(v.string()), // "active" | "inactive"
    is_first_login: v.optional(v.boolean()),
    created_at: v.optional(v.number()),
    updated_at: v.optional(v.number()),
    failedLoginAttempts: v.optional(v.number()),
    lockoutUntil: v.optional(v.number()),
    createdAt: v.optional(v.number()), // For backward compatibility with existing DB records
    biometricToken: v.optional(v.string()),
    xp: v.optional(v.number()),
    level: v.optional(v.number()),
    coins: v.optional(v.number()),
    lastStreakFreezeUsed: v.optional(v.number()),

    // Existing fields made optional for backward compatibility
    clerkId: v.optional(v.string()),
    alias: v.optional(v.string()),
    age: v.optional(v.number()),
    campus: v.optional(v.string()),
    department: v.optional(v.string()),
    year: v.optional(v.string()),
    gender: v.optional(v.string()),
    consentVersion: v.optional(v.string()),
    consentTimestamp: v.optional(v.number()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
    onboardingComplete: v.optional(v.boolean()),
    screeningComplete: v.optional(v.boolean()),
    biometricEnabled: v.optional(v.boolean()),
    lastLoginAt: v.optional(v.number()),
    temp_password: v.optional(v.string()), // Transient plain-text password shown to admin after reset, cleared after viewing
    mitraPreferences: v.optional(
      v.object({
        name: v.string(),
        avatarGender: v.string(), // "female" | "male"
        avatarVariant: v.optional(v.string()),
        updatedAt: v.optional(v.number()),
      })
    ),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_mobile_number", ["mobile_number"])
    .index("by_role", ["role"])
    .index("by_role_and_created_at", ["role", "created_at"]),

  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_userId", ["userId"]),

  appointments: defineTable({
    userId: v.id("users"),
    startTime: v.optional(v.number()), // Kept optional for backward compatibility
    endTime: v.optional(v.number()), // Kept optional for backward compatibility
    description: v.optional(v.string()),
    status: v.string(), // "pending" | "waiting" | "accepted" | "rejected" | "completed" | "scheduled" | "cancelled"
    createdAt: v.number(),
    sourceType: v.optional(v.string()), // "self_initiated" | "triage" | "counselor" | "screening"
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),

    // New fields for two-way system
    title: v.optional(v.string()),
    createdBy: v.optional(v.string()), // "admin" | "user"
    patientName: v.optional(v.string()),
    date: v.optional(v.string()), // YYYY-MM-DD
    time: v.optional(v.string()), // 12-hour format
    reason: v.optional(v.string()),
    rejectionReason: v.optional(v.string()),
    rescheduledBy: v.optional(v.string()), // "admin" | "user"
    rescheduleDate: v.optional(v.string()),
    rescheduleTime: v.optional(v.string()),
    feedback: v.optional(v.string()),
    rating: v.optional(v.number()),
    attended: v.optional(v.string()), // "yes" | "no"
    isFeedbackCompleted: v.optional(v.boolean()),
    counsellorRequestId: v.optional(v.id("counsellorRequests")),
  })
    .index("by_userId", ["userId"])
    .index("by_startTime", ["startTime"])
    .index("by_counsellorRequestId", ["counsellorRequestId"]),


  screenings: defineTable({
    userId: v.string(),
    phq9_total: v.number(),
    gad7_total: v.number(),
    pq16_total: v.number(),
    wsas_total: v.optional(v.number()),
    reqol10_total: v.optional(v.number()),
    phq9_item9_flag: v.boolean(),
    phq9_item9_score: v.number(),
    createdAt: v.number(),
    attemptId: v.optional(v.string()),
  }).index("by_userId", ["userId"]),

  screeningAttempts: defineTable({
    userId: v.string(),
    patientId: v.optional(v.string()),
    status: v.string(), // "in_progress" | "completed" | "abandoned"
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    instrumentVersions: v.object({
      phq9: v.string(),
      gad7: v.string(),
      pq16: v.string(),
      wsas: v.optional(v.string()),
      reqol10: v.optional(v.string()),
    }),
    responses: v.object({
      phq9: v.optional(v.record(v.string(), v.number())),
      gad7: v.optional(v.record(v.string(), v.number())),
      pq16: v.optional(v.record(v.string(), v.number())),
      wsas: v.optional(v.record(v.string(), v.number())),
      reqol10: v.optional(v.record(v.string(), v.number())),
    }),
    results: v.object({
      phq9: v.object({
        administered: v.boolean(),
        score: v.number(),
        maxScore: v.number(),
        severity: v.string(),
        level: v.string(),
        item9Score: v.number(),
        item9Flag: v.boolean(),
      }),
      gad7: v.object({
        administered: v.boolean(),
        score: v.number(),
        maxScore: v.number(),
        severity: v.string(),
        level: v.string(),
      }),
      pq16: v.object({
        administered: v.boolean(),
        score: v.number(),
        maxScore: v.number(),
        severity: v.string(),
        level: v.string(),
      }),
      wsas: v.optional(
        v.object({
          administered: v.boolean(),
          score: v.number(),
          maxScore: v.number(),
          severity: v.string(),
          level: v.string(),
        })
      ),
      reqol10: v.optional(
        v.object({
          administered: v.boolean(),
          score: v.number(),
          maxScore: v.number(),
          severity: v.string(),
          level: v.string(),
        })
      ),
    }),
    triageLevel: v.string(),
    suicideFlag: v.boolean(),
    psychosisFlag: v.boolean(),
    triageId: v.optional(v.id("triages")),
    screeningId: v.optional(v.id("screenings")),
    attemptType: v.optional(v.union(v.literal("baseline"), v.literal("reassessment"), v.literal("force_retest"))),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_startedAt", ["userId", "startedAt"])
    .index("by_status", ["status"])
    .index("by_startedAt", ["startedAt"])
    .index("by_triageId", ["triageId"]),

  triages: defineTable({
    userId: v.string(),
    level: v.string(),
    suicideFlag: v.boolean(),
    psychosisFlag: v.boolean(),
    attemptId: v.optional(v.id("screeningAttempts")),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_createdAt", ["userId", "createdAt"])
    .index("by_attemptId", ["attemptId"]),

  alerts: defineTable({
    userId: v.string(),
    type: v.string(),
    status: v.string(),
    createdAt: v.number(),
    acknowledgedAt: v.optional(v.number()),
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
    source: v.optional(v.string()), // "screening" | "companion" | "cbt" | "system"
    sourceId: v.optional(v.string()), // e.g. companion messageId or cbtSessions._id
    studentDismissedAt: v.optional(v.number()), // last time the student closed the emergency screen
    studentDismissCount: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_attemptId", ["attemptId"])
    .index("by_triageId", ["triageId"]),

  emotionLogs: defineTable({
    userId: v.string(),
    emotion: v.string(),
    bodyRegions: v.array(v.string()),
    intensity: v.optional(v.number()), // legacy
    preIntensity: v.optional(v.number()),
    postIntensity: v.optional(v.number()),
    selectedEmotions: v.optional(v.array(v.string())),
    strongestEmotion: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_createdAt", ["userId", "createdAt"]),

  jpmrLogs: defineTable({
    userId: v.string(),
    completed: v.optional(v.boolean()),
    durationSeconds: v.optional(v.number()),
    preIntensity: v.number(),
    postIntensity: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    duration: v.optional(v.number()), // Legacy
    sourceType: v.optional(v.string()), // "self_initiated" | "routine" | "screening" | "triage" | "counselor"
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_completedAt", ["userId", "completedAt"]),

  microGoals: defineTable({
    userId: v.string(),
    goalId: v.string(),
    goalTitle: v.string(),
    goalDescription: v.string(),
    category: v.string(),
    difficulty: v.string(),
    points: v.number(),
    scheduledTime: v.optional(v.number()),
    completed: v.boolean(),
    completedAt: v.optional(v.number()),
    skipped: v.boolean(),
    createdAt: v.number(),
    cbtSessionId: v.optional(v.string()),
    estimatedMinutes: v.optional(v.number()),
    targetEmotion: v.optional(v.string()),
    targetBehaviour: v.optional(v.string()),
    aiReason: v.optional(v.string()),
    status: v.optional(v.string()), // "pending" | "completed" | "skipped" | "rescheduled"
    // Legacy fields for backward compatibility
    goal: v.optional(v.string()),
    date: v.optional(v.string()),
    feelingAfter: v.optional(v.string()),
    reminderStatus: v.optional(v.string()),
    snoozeCount: v.optional(v.number()),
    isDailyChallenge: v.optional(v.boolean()),
    xpAwarded: v.optional(v.number()),
    coinsAwarded: v.optional(v.number()),
    sourceType: v.optional(v.string()), // "cbt" | "self_initiated" | "routine" | "screening"
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
  }).index("by_userId", ["userId"]),

  points: defineTable({
    userId: v.string(),
    totalPoints: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  badges: defineTable({
    userId: v.string(),
    badgeId: v.string(),
    badgeName: v.string(),
    earnedAt: v.number(),
  }).index("by_userId", ["userId"]),

  streaks: defineTable({
    userId: v.string(),
    currentStreak: v.number(),
    longestStreak: v.number(),
    lastCompletionDate: v.string(), // YYYY-MM-DD
    freezeCount: v.optional(v.number()),
    streakFrozenToday: v.optional(v.boolean()),
  }).index("by_userId", ["userId"]),

  reframes: defineTable({
    userId: v.string(),
    situation: v.string(),
    originalThought: v.string(),
    thinkingTrap: v.string(),
    guidedAnswers: v.array(v.string()),
    newThought: v.string(),
    preIntensity: v.number(),
    postIntensity: v.number(),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]),

  reframeLogs: defineTable({
    userId: v.string(),
    situation_text: v.string(),
    thought_original: v.string(),
    thinking_trap_choice: v.string(),
    guided_answers: v.array(v.string()),
    reframe_text: v.string(),
    pre_reframe_intensity: v.number(),
    post_reframe_intensity: v.number(),
    improvement_percentage: v.number(),
    saved_reframe_flag: v.boolean(),
    favorite: v.optional(v.boolean()),
    createdAt: v.number(),
    sourceType: v.optional(v.string()), // "self_initiated" | "cbt" | "screening" | "counselor" | "routine"
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
    cbtSessionId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_userId_and_createdAt", ["userId", "createdAt"])
    .index("by_createdAt", ["createdAt"])
    .index("by_cbtSessionId", ["cbtSessionId"]),

  counsellorRequests: defineTable({
    user_id: v.string(),
    thought_original: v.optional(v.string()),
    situation_text: v.optional(v.string()),
    timestamp: v.number(),
    status: v.optional(v.string()), // "pending" | "scheduled" | "completed" | "dismissed"
    notes: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
    sourceType: v.optional(v.string()), // "self_initiated" | "cbt_crisis" | "screening" | "triage"
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
  })
    .index("by_user_id", ["user_id"])
    .index("by_timestamp", ["timestamp"]),

  followUps: defineTable({
    userId: v.string(),
    type: v.string(),
    dueDate: v.number(),
    completed: v.boolean(),
    createdAt: v.number(),
    sourceType: v.optional(v.string()), // "screening" | "triage" | "counselor" | "appointment"
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
    appointmentId: v.optional(v.id("appointments")),
    notes: v.optional(v.string()),
    status: v.optional(v.string()), // "pending" | "scheduled" | "completed" | "cancelled"
    completedAt: v.optional(v.number()),
    completedBy: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_appointmentId", ["appointmentId"]),

  wellnessProfiles: defineTable({
    userId: v.string(),
    personality_traits: v.array(v.string()),
    mood_pattern: v.string(),
    wellness_goals: v.array(v.string()),
    energy_pattern: v.string(),
    last_updated: v.number(),
  }).index("by_userId", ["userId"]),

  emotionMaps: defineTable({
    userId: v.string(),
    emotionLabel: v.string(),
    selectedRegions: v.array(v.string()),
    bodyRatings: v.array(
      v.object({
        region: v.string(),
        intensity: v.number(),
      })
    ),
    averageIntensity: v.number(),
    suggestedAction: v.string(),
    selectedEmotions: v.optional(v.array(v.string())),
    strongestEmotion: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_createdAt", ["createdAt"]),

  companionMessages: defineTable({
    messageId: v.string(),
    userId: v.string(),
    role: v.string(), // "user" | "assistant"
    content: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_createdAt", ["userId", "createdAt"]),

  aiCompanionLogs: defineTable({
    messageId: v.string(),
    userId: v.string(),
    role: v.string(), // "user" | "assistant"
    content: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_createdAt", ["userId", "createdAt"]),

  rateLimits: defineTable({
    key: v.string(), // "userId:action"
    count: v.number(),
    windowStart: v.number(),
  }).index("by_key", ["key"]),

  companionRateLimits: defineTable({
    userId: v.string(),
    burstCount: v.number(),
    burstWindowStart: v.number(),
    dailyCount: v.number(),
    dailyWindowStart: v.number(),
    inFlight: v.boolean(),
    inFlightSince: v.optional(v.number()),
  }).index("by_userId", ["userId"]),

  aiTelemetryLogs: defineTable({
    userId: v.string(),
    timestamp: v.number(),
    durationMs: v.number(),
    path: v.string(), // "crisis" | "third_party" | "gemini" | "fallback" | "rate_limited"
    mode: v.string(),
    actionType: v.string(),
    avatarState: v.string(),
    safetyCategory: v.string(), // "normal" | "elevated" | "crisis" | "third_party" | "contextual_idiom"
    geminiCalled: v.boolean(),
    geminiSuccess: v.boolean(),
    fallbackUsed: v.boolean(),
    fallbackReason: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    model: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_path", ["path"]),

  auditLogs: defineTable({
    userId: v.optional(v.string()),
    action: v.string(),
    details: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_action", ["action"])
    .index("by_timestamp", ["timestamp"]),

  dailyCheckins: defineTable({
    userId: v.string(),
    dateStr: v.string(), // "YYYY-MM-DD"
    mood: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId_and_dateStr", ["userId", "dateStr"])
    .index("by_userId", ["userId"]),

  weeklyMissions: defineTable({
    userId: v.string(),
    weekStart: v.string(), // "YYYY-MM-DD" representing the Monday
    goalCountTarget: v.number(),
    goalCountCurrent: v.number(),
    jpmrTarget: v.number(),
    jpmrCurrent: v.number(),
    journalTarget: v.number(),
    journalCurrent: v.number(),
    completed: v.boolean(),
    xpReward: v.number(),
    coinsReward: v.number(),
  }).index("by_userId_and_weekStart", ["userId", "weekStart"]),

  monthlyChallenges: defineTable({
    userId: v.string(),
    monthStr: v.string(), // "YYYY-MM"
    goalCountTarget: v.number(),
    goalCountCurrent: v.number(),
    streakTarget: v.number(),
    streakCurrent: v.number(),
    journalTarget: v.number(),
    journalCurrent: v.number(),
    completed: v.boolean(),
    badgeRewardId: v.string(),
    badgeRewardName: v.string(),
  }).index("by_userId_and_monthStr", ["userId", "monthStr"]),

  cbtSessions: defineTable({
    userId: v.string(),
    sourceType: v.optional(v.string()), // "self_initiated" | "screening" | "triage" | "counselor" | "routine"
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
    situation: v.optional(v.string()),
    automaticThought: v.optional(v.string()),
    emotion: v.optional(v.string()),
    emotionBefore: v.optional(v.number()),
    conversation: v.array(
      v.object({
        role: v.string(),
        content: v.string(),
        timestamp: v.number(),
      })
    ),
    thinkingStyle: v.optional(v.string()),
    clarificationQuestion: v.optional(v.string()),
    clarificationOptions: v.optional(v.array(v.string())),
    clarificationAnswer: v.optional(v.string()),
    cbtDistortion: v.optional(v.string()),
    challengeQuestions: v.optional(v.array(v.string())),
    challengeAnswers: v.optional(v.array(v.string())),
    stepIndex: v.number(),
    reflection: v.optional(v.string()),
    balancedThoughtsOptions: v.optional(v.array(v.string())),
    balancedThought: v.optional(v.string()),
    beliefScore: v.optional(v.number()),
    emotionAfter: v.optional(v.number()),
    recommendedGoal: v.optional(
      v.object({
        id: v.string(),
        title: v.string(),
        description: v.string(),
        category: v.string(),
        difficulty: v.string(),
        estimatedMinutes: v.optional(v.number()),
        points: v.optional(v.number()),
        icon: v.optional(v.string()),
        targetEmotion: v.optional(v.string()),
        targetBehaviour: v.optional(v.string()),
        aiReason: v.optional(v.string()),
        completed: v.optional(v.boolean()),
        skipped: v.optional(v.boolean()),
        whyItHelps: v.optional(v.string()),
        estimatedTime: v.optional(v.string()),
      })
    ),
    recommendedGoals: v.optional(
      v.array(
        v.object({
          id: v.string(),
          title: v.string(),
          description: v.string(),
          category: v.string(),
          difficulty: v.string(),
          estimatedMinutes: v.optional(v.number()),
          points: v.optional(v.number()),
          icon: v.optional(v.string()),
          targetEmotion: v.optional(v.string()),
          targetBehaviour: v.optional(v.string()),
          aiReason: v.optional(v.string()),
          completed: v.optional(v.boolean()),
          skipped: v.optional(v.boolean()),
          whyItHelps: v.optional(v.string()),
          estimatedTime: v.optional(v.string()),
        })
      )
    ),
    selectedGoalIds: v.optional(v.array(v.string())),
    goalCompletion: v.optional(v.boolean()),
    timestamp: v.number(),
    riskFlags: v.optional(v.array(v.string())),
    sessionStatus: v.string(), // "active" | "completed" | "safety_mode" | "support_mode" | "paused"
    currentStep: v.string(), // "understanding" | "clarification" | "guided_discovery" | "reflection" | "balanced_thought" | "belief" | "emotion_after" | "recovery_coach" | "completed" | "safety_mode" | "support_mode"
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_timestamp", ["userId", "timestamp"])
    .index("by_sessionStatus", ["sessionStatus"])
    .index("by_timestamp", ["timestamp"]),

  apiKeys: defineTable({
    key: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index("by_key", ["key"]),

  // ENTERPRISE HEALTHCARE MODULE TABLES
  counsellors: defineTable({
    userId: v.optional(v.id("users")),
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    role: v.string(), // "counsellor" | "senior_psychiatrist" | "lead"
    availability: v.array(v.string()),
    maxWorkload: v.number(),
    currentWorkload: v.optional(v.number()),
    rating: v.number(),
    status: v.string(), // "active" | "inactive" | "on_leave"
    createdAt: v.number(),
  }).index("by_status", ["status"]),

  clinicalTimelines: defineTable({
    userId: v.string(),
    eventType: v.string(), // "created" | "screening" | "appointment" | "cbt" | "ai_alert" | "intervention" | "risk_reduced" | "case_closed"
    title: v.string(),
    description: v.string(),
    performedBy: v.optional(v.string()),
    timestamp: v.number(),
    metadata: v.optional(v.string()),
  }).index("by_userId", ["userId"]),

  aiMonitoringLogs: defineTable({
    userId: v.string(),
    prompt: v.string(),
    aiResponse: v.string(),
    riskScore: v.number(),
    riskCategory: v.string(), // "low" | "moderate" | "severe" | "critical"
    flaggedKeywords: v.array(v.string()),
    aiConfidence: v.number(),
    escalated: v.boolean(),
    reviewed: v.boolean(),
    reviewer: v.optional(v.string()),
    reviewNotes: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_riskCategory", ["riskCategory"]),

  notifications: defineTable({
    recipientId: v.string(),
    type: v.string(), // "critical_risk" | "appointment" | "password_reset" | "counsellor_request" | "new_user" | "reminder" | "resolved_alert"
    title: v.string(),
    message: v.string(),
    priority: v.string(), // "low" | "medium" | "high" | "critical"
    read: v.boolean(),
    archived: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_recipientId", ["recipientId"])
    .index("by_read", ["read"]),

  loginHistory: defineTable({
    userId: v.string(),
    status: v.string(), // "success" | "failed"
    ipAddress: v.optional(v.string()),
    browser: v.optional(v.string()),
    device: v.optional(v.string()),
    location: v.optional(v.string()),
    timestamp: v.number(),
  }).index("by_userId", ["userId"]),

  systemSettings: defineTable({
    key: v.string(),
    value: v.string(),
    category: v.string(), // "hospital" | "security" | "ai" | "notification" | "branding"
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  trash: defineTable({
    itemType: v.string(), // "patient" | "appointment" | "alert" | "session"
    itemId: v.string(),
    deletedData: v.string(),
    deletedBy: v.string(),
    deletedAt: v.number(),
  }).index("by_itemType", ["itemType"]),

  jpmrVideos: defineTable({
    stepIndex: v.number(),
    title: v.string(),
    storageId: v.id("_storage"),
    createdAt: v.number(),
  }).index("by_stepIndex", ["stepIndex"]),

  breathingLogs: defineTable({
    userId: v.string(),
    protocolId: v.string(), // "box_4444" | "paced_444" | "calming_434" | "belly_reset_3" | "relaxing_478"
    protocolName: v.string(),
    sourceType: v.string(), // "self_initiated" | "emotion_map" | "cbt_support" | "micro_goal" | "counselor_recommended" | "routine"
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    durationSeconds: v.number(),
    cyclesCompleted: v.number(),
    targetCycles: v.number(),
    status: v.string(), // "completed" | "partial" | "abandoned"
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_userId_and_createdAt", ["userId", "createdAt"])
    .index("by_attemptId", ["attemptId"])
    .index("by_triageId", ["triageId"]),

  groundingLogs: defineTable({
    userId: v.string(),
    protocolId: v.string(), // "sensory_54321"
    protocolName: v.string(),
    sourceType: v.string(), // "self_initiated" | "cbt_support" | "emotion_map" | "crisis_blocker" | "micro_goal"
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    durationSeconds: v.number(),
    stepsCompleted: v.number(), // 0 to 5
    totalSteps: v.number(), // 5
    status: v.string(), // "completed" | "partial" | "abandoned"
    attemptId: v.optional(v.id("screeningAttempts")),
    triageId: v.optional(v.id("triages")),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_userId_and_createdAt", ["userId", "createdAt"])
    .index("by_attemptId", ["attemptId"])
    .index("by_triageId", ["triageId"]),

  // Dedicated sequential atomic counters (Priority 11 Step 5A)
  counters: defineTable({
    name: v.string(), // e.g. "patientId"
    value: v.number(), // monotonic sequential counter value
  }).index("by_name", ["name"]),

  // Counsellor caseload: which counsellor is responsible for which student.
  // Counsellors can only access students with an active assignment; admins see everyone.
  counsellorAssignments: defineTable({
    counsellorId: v.id("users"),
    studentId: v.id("users"),
    assignedBy: v.id("users"),
    assignedAt: v.number(),
    active: v.boolean(),
    endedAt: v.optional(v.number()),
  })
    .index("by_counsellor_and_active", ["counsellorId", "active"])
    .index("by_student_and_active", ["studentId", "active"]),

  // AI-3 Step 7: Dedicated Non-Sensitive Persistent Memory Table
  emotyMemories: defineTable({
    userId: v.string(),
    category: v.string(), // "communication_preference" | "support_preference" | "routine_preference" | "goal_preference" | "chosen_name" | "conversation_summary"
    key: v.string(), // e.g., "response_length", "guidance_style", "goal_size", "routine_timing", "display_name", "last_topic"
    value: v.string(), // concise sanitized value
    source: v.optional(v.string()), // "user_stated" | "explicit_setting" | "app_context"
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.optional(v.number()), // optional expiration for temporary conversation summaries
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_category", ["userId", "category"])
    .index("by_userId_and_key", ["userId", "key"])
    .index("by_userId_and_active", ["userId", "active"]),
});



