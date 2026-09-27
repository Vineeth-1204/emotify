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
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_mobile_number", ["mobile_number"])
    .index("by_role", ["role"]),

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
  })
    .index("by_userId", ["userId"])
    .index("by_startTime", ["startTime"]),


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
  })
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_startedAt", ["startedAt"]),

  triages: defineTable({
    userId: v.string(),
    level: v.string(),
    suicideFlag: v.boolean(),
    psychosisFlag: v.boolean(),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]),

  alerts: defineTable({
    userId: v.string(),
    type: v.string(),
    status: v.string(),
    createdAt: v.number(),
    acknowledgedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_status", ["status"]),

  emotionLogs: defineTable({
    userId: v.string(),
    emotion: v.string(),
    bodyRegions: v.array(v.string()),
    intensity: v.optional(v.number()), // legacy
    preIntensity: v.optional(v.number()),
    postIntensity: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]),

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
  }).index("by_userId", ["userId"]),

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
  })
    .index("by_user", ["userId"])
    .index("by_createdAt", ["createdAt"]),

  counsellorRequests: defineTable({
    user_id: v.string(),
    thought_original: v.optional(v.string()),
    situation_text: v.optional(v.string()),
    timestamp: v.number(),
    status: v.optional(v.string()), // "pending" | "scheduled" | "completed" | "dismissed"
    notes: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
  }).index("by_user_id", ["user_id"]),

  followUps: defineTable({
    userId: v.string(),
    type: v.string(),
    dueDate: v.number(),
    completed: v.boolean(),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]),

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

  auditLogs: defineTable({
    userId: v.optional(v.string()),
    action: v.string(),
    details: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_action", ["action"]),

  dailyCheckins: defineTable({
    userId: v.string(),
    dateStr: v.string(), // "YYYY-MM-DD"
    mood: v.string(),
    createdAt: v.number(),
  }).index("by_userId_and_dateStr", ["userId", "dateStr"]),

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
});

