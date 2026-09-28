import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertCanAccessStudent } from "./authz";

/**
 * Normalized Canonical Clinical Timeline Event Model
 * Authorized read model representing longitudinal clinical milestones.
 */
export interface CanonicalTimelineEvent {
  /** Deterministic composite identifier: `${sourceTable}_${sourceId}` or suffix for multi-event sources */
  id: string;

  /** Canonical student identifier (users._id) */
  studentId: string;

  /** Clinical domain category */
  category: "screening" | "triage" | "safety" | "counseling" | "intervention" | "monitoring" | "note";

  /** Specific clinical event type */
  eventType: string;

  /** Authoritative unix timestamp (ms) */
  occurredAt: number;

  /** Authoritative source table */
  sourceTable: string;

  /** Underlying Convex document ID */
  sourceId: string;

  /** Clinician-facing event title */
  title: string;

  /** Clinical summary or narrative details */
  summary: string;

  /** Standardized severity level */
  severity?: "normal" | "mild" | "moderate" | "severe" | "critical";

  /** Execution status of the underlying event */
  status?: string;

  /** Explicit causal document relationships established in Priority 4 Step 4 */
  provenance?: {
    attemptId?: string; // Originating screeningAttempts._id
    triageId?: string;  // Originating triages._id
    alertId?: string;   // Associated alerts._id
    sessionId?: string; // Originating cbtSessions._id
  };

  /** Structured, source-specific metadata for clinical slide-outs */
  metadata?: Record<string, any>;
}

/** Severity mapping helper */
function mapTriageSeverity(level?: string): "normal" | "mild" | "moderate" | "severe" | "critical" {
  if (!level) return "normal";
  switch (level.toLowerCase()) {
    case "suicide_flag":
    case "psychosis_flag":
      return "critical";
    case "severe":
      return "severe";
    case "moderate":
      return "moderate";
    case "mild":
      return "mild";
    default:
      return "normal";
  }
}

/**
 * Aggregates all authoritative clinical records into a unified longitudinal timeline for a student.
 * 
 * Enforces Priority 4 Step 3 authorization:
 * - Student: Can access ONLY their own timeline.
 * - Counselor / Admin: Can access authorized student clinical timelines.
 * - Unauthenticated: Denied.
 */
export const getStudentClinicalTimeline = query({
  args: {
    userId: v.string(),
    categoryFilter: v.optional(
      v.union(
        v.literal("screening"),
        v.literal("triage"),
        v.literal("safety"),
        v.literal("counseling"),
        v.literal("intervention"),
        v.literal("monitoring"),
        v.literal("note")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<CanonicalTimelineEvent[]> => {
    // 1. Enforce authorization
    await assertCanAccessStudent(ctx, args.userId);

    // 2. Resolve user identities (canonical users._id and legacy clerkId)
    let user = null;
    try {
      user = await ctx.db.get(args.userId as Id<"users">);
    } catch {
      // args.userId might not be an Id<"users">
    }

    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q: any) => q.eq("clerkId", args.userId))
        .first();
    }

    const canonicalUserId = user ? String(user._id) : args.userId;
    const searchUserIds = new Set<string>([canonicalUserId, args.userId]);
    if (user?.clerkId) searchUserIds.add(user.clerkId);

    const userDocId = user ? (user._id as Id<"users">) : null;
    const isMonitoringRequested = args.categoryFilter === "monitoring";

    // 3. Query authoritative tables in parallel
    const [
      screeningAttemptsNested,
      screeningsNested,
      triagesNested,
      alertsNested,
      counsellorRequestsNested,
      appointmentsList,
      followUpsNested,
      cbtSessionsNested,
      jpmrLogsNested,
      reframeLogsNested,
      microGoalsNested,
      clinicalTimelinesNested,
      aiMonitoringLogsNested,
      emotionLogsNested,
      dailyCheckinsNested,
      emotionMapsNested,
    ] = await Promise.all([
      // 1. screeningAttempts
      Promise.all(
        Array.from(searchUserIds).map((id) =>
          ctx.db.query("screeningAttempts").withIndex("by_userId", (q: any) => q.eq("userId", id)).collect()
        )
      ),
      // 2. screenings (legacy mirror table for historical deduplication)
      Promise.all(
        Array.from(searchUserIds).map((id) =>
          ctx.db.query("screenings").withIndex("by_userId", (q: any) => q.eq("userId", id)).collect()
        )
      ),
      // 3. triages
      Promise.all(
        Array.from(searchUserIds).map((id) =>
          ctx.db.query("triages").withIndex("by_userId", (q: any) => q.eq("userId", id)).collect()
        )
      ),
      // 4. alerts
      Promise.all(
        Array.from(searchUserIds).map((id) =>
          ctx.db.query("alerts").withIndex("by_userId", (q: any) => q.eq("userId", id)).collect()
        )
      ),
      // 5. counsellorRequests (Note: indexed by by_user_id)
      Promise.all(
        Array.from(searchUserIds).map((id) =>
          ctx.db.query("counsellorRequests").withIndex("by_user_id", (q: any) => q.eq("user_id", id)).collect()
        )
      ),
      // 6. appointments (Note: indexed by userId as v.id("users"))
      userDocId
        ? ctx.db.query("appointments").withIndex("by_userId", (q: any) => q.eq("userId", userDocId)).collect()
        : Promise.resolve([]),
      // 7. followUps
      Promise.all(
        Array.from(searchUserIds).map((id) =>
          ctx.db.query("followUps").withIndex("by_userId", (q: any) => q.eq("userId", id)).collect()
        )
      ),
      // 8. cbtSessions
      Promise.all(
        Array.from(searchUserIds).map((id) =>
          ctx.db.query("cbtSessions").withIndex("by_userId", (q: any) => q.eq("userId", id)).collect()
        )
      ),
      // 9. jpmrLogs
      Promise.all(
        Array.from(searchUserIds).map((id) =>
          ctx.db.query("jpmrLogs").withIndex("by_userId", (q: any) => q.eq("userId", id)).collect()
        )
      ),
      // 10. reframeLogs (Authoritative cognitive reframe records)
      Promise.all(
        Array.from(searchUserIds).map((id) =>
          ctx.db.query("reframeLogs").withIndex("by_user", (q: any) => q.eq("userId", id)).collect()
        )
      ),
      // 11. microGoals
      Promise.all(
        Array.from(searchUserIds).map((id) =>
          ctx.db.query("microGoals").withIndex("by_userId", (q: any) => q.eq("userId", id)).collect()
        )
      ),
      // 12. clinicalTimelines (Staff manual notes)
      Promise.all(
        Array.from(searchUserIds).map((id) =>
          ctx.db.query("clinicalTimelines").withIndex("by_userId", (q: any) => q.eq("userId", id)).collect()
        )
      ),
      // 13. aiMonitoringLogs
      Promise.all(
        Array.from(searchUserIds).map((id) =>
          ctx.db.query("aiMonitoringLogs").withIndex("by_userId", (q: any) => q.eq("userId", id)).collect()
        )
      ),
      // 14. emotionLogs (Optional telemetry)
      isMonitoringRequested
        ? Promise.all(
            Array.from(searchUserIds).map((id) =>
              ctx.db.query("emotionLogs").withIndex("by_userId", (q: any) => q.eq("userId", id)).collect()
            )
          )
        : Promise.resolve([]),
      // 15. dailyCheckins (Optional telemetry - uses by_userId index)
      isMonitoringRequested
        ? Promise.all(
            Array.from(searchUserIds).map((id) =>
              ctx.db.query("dailyCheckins").withIndex("by_userId", (q: any) => q.eq("userId", id)).collect()
            )
          )
        : Promise.resolve([]),
      // 16. emotionMaps (Optional somatic telemetry)
      isMonitoringRequested
        ? Promise.all(
            Array.from(searchUserIds).map((id) =>
              ctx.db.query("emotionMaps").withIndex("by_userId", (q: any) => q.eq("userId", id)).collect()
            )
          )
        : Promise.resolve([]),
    ]);

    // Helper to flatten and deduplicate by _id
    function deduplicateDocs<T extends { _id: any }>(nested: T[][]): T[] {
      const seen = new Set<string>();
      const result: T[] = [];
      for (const group of nested) {
        for (const doc of group) {
          const idStr = String(doc._id);
          if (!seen.has(idStr)) {
            seen.add(idStr);
            result.push(doc);
          }
        }
      }
      return result;
    }

    const screeningAttempts = deduplicateDocs(screeningAttemptsNested);
    const screenings = deduplicateDocs(screeningsNested);
    const triages = deduplicateDocs(triagesNested);
    const alerts = deduplicateDocs(alertsNested);
    const counsellorRequests = deduplicateDocs(counsellorRequestsNested);
    const followUps = deduplicateDocs(followUpsNested);
    const cbtSessions = deduplicateDocs(cbtSessionsNested);
    const jpmrLogs = deduplicateDocs(jpmrLogsNested);
    const reframeLogs = deduplicateDocs(reframeLogsNested);
    const microGoals = deduplicateDocs(microGoalsNested);
    const clinicalTimelines = deduplicateDocs(clinicalTimelinesNested);
    const aiMonitoringLogs = deduplicateDocs(aiMonitoringLogsNested);
    const emotionLogs = deduplicateDocs(emotionLogsNested);
    const dailyCheckins = deduplicateDocs(dailyCheckinsNested);
    const emotionMaps = deduplicateDocs(emotionMapsNested);

    const events: CanonicalTimelineEvent[] = [];

    // Track attempt IDs that are already represented to prevent duplicate mirror screenings
    const knownAttemptIds = new Set<string>();

    // ----------------------------------------------------
    // SOURCE 1: screeningAttempts (Authoritative Screening)
    // ----------------------------------------------------
    for (const attempt of screeningAttempts) {
      if (attempt.status === "completed") {
        knownAttemptIds.add(String(attempt._id));
        const phq9 = attempt.results?.phq9;
        const gad7 = attempt.results?.gad7;
        const pq16 = attempt.results?.pq16;

        events.push({
          id: `screeningAttempts_${attempt._id}`,
          studentId: canonicalUserId,
          category: "screening",
          eventType: "screening_completed",
          occurredAt: attempt.completedAt || attempt.startedAt,
          sourceTable: "screeningAttempts",
          sourceId: String(attempt._id),
          title: "Clinical Screening Completed",
          summary: `PHQ-9: ${phq9?.score ?? 0} (${phq9?.severity ?? "N/A"}), GAD-7: ${gad7?.score ?? 0} (${gad7?.severity ?? "N/A"}), PQ-16: ${pq16?.score ?? 0} (${pq16?.severity ?? "Normal"})`,
          severity: mapTriageSeverity(attempt.triageLevel || phq9?.level),
          status: attempt.status,
          provenance: {
            attemptId: String(attempt._id),
            triageId: attempt.triageId ? String(attempt.triageId) : undefined,
          },
          metadata: {
            phq9Score: phq9?.score,
            gad7Score: gad7?.score,
            pq16Score: pq16?.score,
            item9Flag: phq9?.item9Flag ?? false,
            suicideFlag: attempt.suicideFlag,
            psychosisFlag: attempt.psychosisFlag,
            triageLevel: attempt.triageLevel,
          },
        });
      } else if (attempt.status === "in_progress") {
        events.push({
          id: `screeningAttempts_${attempt._id}`,
          studentId: canonicalUserId,
          category: "screening",
          eventType: "screening_started",
          occurredAt: attempt.startedAt,
          sourceTable: "screeningAttempts",
          sourceId: String(attempt._id),
          title: "Screening Assessment Initiated",
          summary: "Student initiated multi-instrument clinical assessment.",
          status: "in_progress",
          provenance: {
            attemptId: String(attempt._id),
          },
        });
      }
    }

    // ----------------------------------------------------
    // SOURCE 2: screenings (Historical Legacy Fallback)
    // ----------------------------------------------------
    for (const s of screenings) {
      // Deduplicate: If this mirror record links to a known screening attempt, skip it!
      if (s.attemptId && knownAttemptIds.has(s.attemptId)) {
        continue;
      }

      events.push({
        id: `screenings_${s._id}`,
        studentId: canonicalUserId,
        category: "screening",
        eventType: "screening_completed",
        occurredAt: s.createdAt,
        sourceTable: "screenings",
        sourceId: String(s._id),
        title: "Historical Screening Record",
        summary: `PHQ-9: ${s.phq9_total}, GAD-7: ${s.gad7_total}, PQ-16: ${s.pq16_total}`,
        severity: s.phq9_item9_flag ? "critical" : s.phq9_total >= 15 ? "severe" : s.phq9_total >= 10 ? "moderate" : "mild",
        status: "completed",
        // Unlinked historical provenance - never fabricate
        provenance: {},
        metadata: {
          phq9Score: s.phq9_total,
          gad7Score: s.gad7_total,
          pq16Score: s.pq16_total,
          item9Flag: s.phq9_item9_flag,
        },
      });
    }

    // ----------------------------------------------------
    // SOURCE 3: triages (Authoritative Clinical Triage)
    // ----------------------------------------------------
    for (const t of triages) {
      const isOverride = t.level === "force_retest";
      events.push({
        id: `triages_${t._id}`,
        studentId: canonicalUserId,
        category: "triage",
        eventType: isOverride ? "triage_override" : "triage_assessed",
        occurredAt: t.createdAt,
        sourceTable: "triages",
        sourceId: String(t._id),
        title: isOverride ? "Clinical Triage Override" : "Clinical Triage Assessment",
        summary: `Assessed risk level: ${t.level.toUpperCase()}${t.suicideFlag ? " [Suicide Risk Flag]" : ""}${t.psychosisFlag ? " [Psychosis Risk Flag]" : ""}`,
        severity: mapTriageSeverity(t.level),
        status: t.level,
        provenance: {
          triageId: String(t._id),
          attemptId: t.attemptId ? String(t.attemptId) : undefined,
        },
        metadata: {
          level: t.level,
          suicideFlag: t.suicideFlag,
          psychosisFlag: t.psychosisFlag,
        },
      });
    }

    // ----------------------------------------------------
    // SOURCE 4: alerts (Safety Alerts & Acknowledgments)
    // ----------------------------------------------------
    for (const a of alerts) {
      const isCritical = a.type === "suicide" || a.type === "suicideRisk" || a.type === "psychosis";

      // 4a. Alert created event
      events.push({
        id: `alerts_${a._id}_created`,
        studentId: canonicalUserId,
        category: "safety",
        eventType: "safety_alert_created",
        occurredAt: a.createdAt,
        sourceTable: "alerts",
        sourceId: String(a._id),
        title: `Safety Alert: ${a.type.toUpperCase()}`,
        summary: `Clinical safety notification triggered (${a.status}).`,
        severity: isCritical ? "critical" : "severe",
        status: a.status,
        provenance: {
          alertId: String(a._id),
          triageId: a.triageId ? String(a.triageId) : undefined,
          attemptId: a.attemptId ? String(a.attemptId) : undefined,
        },
        metadata: {
          type: a.type,
          alertStatus: a.status,
        },
      });

      // 4b. Alert acknowledged event (only if acknowledgedAt actually exists)
      if (a.acknowledgedAt) {
        events.push({
          id: `alerts_${a._id}_acknowledged`,
          studentId: canonicalUserId,
          category: "safety",
          eventType: "safety_alert_acknowledged",
          occurredAt: a.acknowledgedAt,
          sourceTable: "alerts",
          sourceId: String(a._id),
          title: `Safety Alert Acknowledged: ${a.type.toUpperCase()}`,
          summary: `Clinical staff acknowledged safety alert.`,
          severity: isCritical ? "critical" : "severe",
          status: "acknowledged",
          provenance: {
            alertId: String(a._id),
            triageId: a.triageId ? String(a.triageId) : undefined,
            attemptId: a.attemptId ? String(a.attemptId) : undefined,
          },
          metadata: {
            type: a.type,
            acknowledgedAt: a.acknowledgedAt,
          },
        });
      }
    }

    // ----------------------------------------------------
    // SOURCE 5: counsellorRequests (Student Help Seeking)
    // ----------------------------------------------------
    for (const req of counsellorRequests) {
      events.push({
        id: `counsellorRequests_${req._id}`,
        studentId: canonicalUserId,
        category: "counseling",
        eventType: "counselor_requested",
        occurredAt: req.timestamp,
        sourceTable: "counsellorRequests",
        sourceId: String(req._id),
        title: "Counselor Consultation Requested",
        summary: `Student requested counseling support (Status: ${req.status || "pending"}).`,
        status: req.status || "pending",
        metadata: {
          notes: req.notes,
          status: req.status,
        },
      });
    }

    // ----------------------------------------------------
    // SOURCE 6: appointments (Clinical Sessions)
    // ----------------------------------------------------
    for (const appt of appointmentsList) {
      if (appt.status === "completed" || appt.attended === "yes") {
        events.push({
          id: `appointments_${appt._id}`,
          studentId: canonicalUserId,
          category: "counseling",
          eventType: "appointment_completed",
          occurredAt: appt.endTime || appt.startTime || appt.createdAt,
          sourceTable: "appointments",
          sourceId: String(appt._id),
          title: `Consultation Completed: ${appt.title || "Clinical Appointment"}`,
          summary: `Attended: ${appt.attended || "yes"}. Date: ${appt.date || "Recorded"}, Time: ${appt.time || "N/A"}.`,
          status: "completed",
          metadata: {
            date: appt.date,
            time: appt.time,
            attended: appt.attended,
            rating: appt.rating,
          },
        });
      } else if (appt.status === "cancelled" || appt.status === "rejected") {
        events.push({
          id: `appointments_${appt._id}`,
          studentId: canonicalUserId,
          category: "counseling",
          eventType: "appointment_cancelled",
          occurredAt: appt.createdAt,
          sourceTable: "appointments",
          sourceId: String(appt._id),
          title: `Appointment Cancelled: ${appt.title || "Clinical Appointment"}`,
          summary: `Appointment cancelled or rejected (${appt.rejectionReason || "No reason specified"}).`,
          status: appt.status,
          metadata: {
            rejectionReason: appt.rejectionReason,
            date: appt.date,
            time: appt.time,
          },
        });
      } else {
        events.push({
          id: `appointments_${appt._id}`,
          studentId: canonicalUserId,
          category: "counseling",
          eventType: "appointment_scheduled",
          occurredAt: appt.startTime || appt.createdAt,
          sourceTable: "appointments",
          sourceId: String(appt._id),
          title: `Appointment Scheduled: ${appt.title || "Clinical Appointment"}`,
          summary: `Scheduled consultation on ${appt.date || "Upcoming"} at ${appt.time || "N/A"}. Status: ${appt.status}.`,
          status: appt.status,
          metadata: {
            date: appt.date,
            time: appt.time,
            status: appt.status,
            createdBy: appt.createdBy,
          },
        });
      }
    }

    // ----------------------------------------------------
    // SOURCE 7: followUps (Clinical Follow-ups)
    // ----------------------------------------------------
    for (const f of followUps) {
      events.push({
        id: `followUps_${f._id}`,
        studentId: canonicalUserId,
        category: "counseling",
        eventType: f.completed ? "follow_up_completed" : "follow_up_scheduled",
        occurredAt: f.createdAt,
        sourceTable: "followUps",
        sourceId: String(f._id),
        title: f.completed ? "Clinical Follow-up Completed" : "Clinical Follow-up Scheduled",
        summary: `Type: ${f.type}. Due date: ${new Date(f.dueDate).toLocaleDateString()}. Status: ${f.completed ? "Completed" : "Pending"}.`,
        status: f.completed ? "completed" : "pending",
        metadata: {
          type: f.type,
          dueDate: f.dueDate,
          completed: f.completed,
        },
      });
    }

    // ----------------------------------------------------
    // SOURCE 8: cbtSessions (Therapy Sessions)
    // ----------------------------------------------------
    for (const session of cbtSessions) {
      if (session.sessionStatus === "completed") {
        events.push({
          id: `cbtSessions_${session._id}`,
          studentId: canonicalUserId,
          category: "intervention",
          eventType: "cbt_session_completed",
          occurredAt: session.timestamp,
          sourceTable: "cbtSessions",
          sourceId: String(session._id),
          title: "CBT Intervention Completed",
          summary: `Emotion: ${session.emotion || "Stress"} improved from ${session.emotionBefore ?? 0} to ${session.emotionAfter ?? 0}. Thinking trap: ${session.cbtDistortion || session.thinkingStyle || "Restructured"}.`,
          status: "completed",
          provenance: {
            sessionId: String(session._id),
          },
          metadata: {
            emotion: session.emotion,
            emotionBefore: session.emotionBefore,
            emotionAfter: session.emotionAfter,
            beliefScore: session.beliefScore,
            thinkingStyle: session.thinkingStyle,
            cbtDistortion: session.cbtDistortion,
          },
        });
      } else if (session.sessionStatus === "safety_mode") {
        events.push({
          id: `cbtSessions_${session._id}_safety`,
          studentId: canonicalUserId,
          category: "safety",
          eventType: "cbt_safety_triggered",
          occurredAt: session.timestamp,
          sourceTable: "cbtSessions",
          sourceId: String(session._id),
          title: "CBT Crisis Safety Mode Activated",
          summary: "Immediate safety mode triggered during cognitive therapy session.",
          severity: "critical",
          status: "safety_mode",
          provenance: {
            sessionId: String(session._id),
          },
          metadata: {
            riskFlags: session.riskFlags,
          },
        });
      }
    }

    // ----------------------------------------------------
    // SOURCE 9: jpmrLogs (Somatic Relaxation)
    // ----------------------------------------------------
    for (const j of jpmrLogs) {
      if (j.completed === true) {
        events.push({
          id: `jpmrLogs_${j._id}`,
          studentId: canonicalUserId,
          category: "intervention",
          eventType: "jpmr_completed",
          occurredAt: j.completedAt || j.createdAt,
          sourceTable: "jpmrLogs",
          sourceId: String(j._id),
          title: "JPMR Relaxation Exercise Completed",
          summary: `Somatic muscle relaxation completed (${j.durationSeconds ?? 0}s). Tension reduced from ${j.preIntensity} to ${j.postIntensity}.`,
          status: "completed",
          metadata: {
            preIntensity: j.preIntensity,
            postIntensity: j.postIntensity,
            durationSeconds: j.durationSeconds,
          },
        });
      }
    }

    // ----------------------------------------------------
    // SOURCE 10: reframeLogs (Cognitive Restructuring)
    // ----------------------------------------------------
    for (const r of reframeLogs) {
      events.push({
        id: `reframeLogs_${r._id}`,
        studentId: canonicalUserId,
        category: "intervention",
        eventType: "reframe_completed",
        occurredAt: r.createdAt,
        sourceTable: "reframeLogs",
        sourceId: String(r._id),
        title: `Cognitive Reframe: ${r.thinking_trap_choice || "Thought Challenge"}`,
        summary: `Distress reduced from ${r.pre_reframe_intensity} to ${r.post_reframe_intensity} (${r.improvement_percentage}% improvement).`,
        status: "completed",
        metadata: {
          thinkingTrap: r.thinking_trap_choice,
          preIntensity: r.pre_reframe_intensity,
          postIntensity: r.post_reframe_intensity,
          improvementPercentage: r.improvement_percentage,
        },
      });
    }

    // ----------------------------------------------------
    // SOURCE 11: microGoals (Behavioral Activation Milestones)
    // ----------------------------------------------------
    for (const g of microGoals) {
      if (g.completed) {
        events.push({
          id: `microGoals_${g._id}`,
          studentId: canonicalUserId,
          category: "intervention",
          eventType: "micro_goal_completed",
          occurredAt: g.completedAt || g.createdAt,
          sourceTable: "microGoals",
          sourceId: String(g._id),
          title: `Goal Completed: ${g.goalTitle}`,
          summary: `Category: ${g.category}, Difficulty: ${g.difficulty} (+${g.points} XP).`,
          status: "completed",
          provenance: g.cbtSessionId ? { sessionId: g.cbtSessionId } : undefined,
          metadata: {
            category: g.category,
            difficulty: g.difficulty,
            points: g.points,
          },
        });
      }
    }

    // ----------------------------------------------------
    // SOURCE 12: clinicalTimelines (Staff-Authored Case Notes)
    // ----------------------------------------------------
    for (const note of clinicalTimelines) {
      events.push({
        id: `clinicalTimelines_${note._id}`,
        studentId: canonicalUserId,
        category: "note",
        eventType: "staff_case_note",
        occurredAt: note.timestamp,
        sourceTable: "clinicalTimelines",
        sourceId: String(note._id),
        title: note.title || "Clinical Staff Case Note",
        summary: note.description,
        metadata: {
          performedBy: note.performedBy,
          originalEventType: note.eventType,
          rawMetadata: note.metadata,
        },
      });
    }

    // ----------------------------------------------------
    // SOURCE 13: aiMonitoringLogs (High-Risk Escalations Only)
    // ----------------------------------------------------
    for (const log of aiMonitoringLogs) {
      if (log.escalated || log.riskCategory === "severe" || log.riskCategory === "critical") {
        events.push({
          id: `aiMonitoringLogs_${log._id}`,
          studentId: canonicalUserId,
          category: "safety",
          eventType: "ai_safety_flag",
          occurredAt: log.timestamp,
          sourceTable: "aiMonitoringLogs",
          sourceId: String(log._id),
          title: "AI Safety Monitoring Escalation",
          summary: `Safety filter flagged interaction with ${log.riskCategory} risk (${log.escalated ? "Escalated to Staff" : "High Distress"}).`,
          severity: log.riskCategory === "critical" ? "critical" : "severe",
          metadata: {
            riskCategory: log.riskCategory,
            escalated: log.escalated,
            reviewed: log.reviewed,
          },
        });
      }
    }

    // ----------------------------------------------------
    // SOURCE 14 & 15: Optional Telemetry (Only when explicitly filtered by 'monitoring')
    // ----------------------------------------------------
    if (isMonitoringRequested) {
      for (const el of emotionLogs) {
        events.push({
          id: `emotionLogs_${el._id}`,
          studentId: canonicalUserId,
          category: "monitoring",
          eventType: "emotion_checkin",
          occurredAt: el.createdAt,
          sourceTable: "emotionLogs",
          sourceId: String(el._id),
          title: `Emotion Check-in: ${el.emotion}`,
          summary: `Logged emotion ${el.emotion}. Intensity: ${el.postIntensity ?? el.preIntensity ?? "N/A"}.`,
          metadata: {
            emotion: el.emotion,
            preIntensity: el.preIntensity,
            postIntensity: el.postIntensity,
          },
        });
      }

      for (const dc of dailyCheckins) {
        events.push({
          id: `dailyCheckins_${dc._id}`,
          studentId: canonicalUserId,
          category: "monitoring",
          eventType: "daily_mood_checkin",
          occurredAt: dc.createdAt,
          sourceTable: "dailyCheckins",
          sourceId: String(dc._id),
          title: `Daily Mood: ${dc.mood}`,
          summary: `Daily calendar mood check-in for ${dc.dateStr}.`,
          metadata: {
            dateStr: dc.dateStr,
            mood: dc.mood,
          },
        });
      }

      for (const em of emotionMaps) {
        events.push({
          id: `emotionMaps_${em._id}`,
          studentId: canonicalUserId,
          category: "monitoring",
          eventType: "emotion_map",
          occurredAt: em.createdAt,
          sourceTable: "emotionMaps",
          sourceId: String(em._id),
          title: `Emotion Body Map: ${em.emotionLabel}`,
          summary: `Mapped somatic tension across ${em.selectedRegions?.length || 0} regions (${(em.selectedRegions || []).join(", ")}). Average intensity: ${em.averageIntensity}/10. Suggested action: ${em.suggestedAction || "None"}.`,
          metadata: {
            emotionLabel: em.emotionLabel,
            selectedRegions: em.selectedRegions,
            bodyRatings: em.bodyRatings,
            averageIntensity: em.averageIntensity,
            suggestedAction: em.suggestedAction,
          },
        });
      }
    }

    // ----------------------------------------------------
    // 4. FILTERING BY CATEGORY
    // ----------------------------------------------------
    let filteredEvents = events;
    if (args.categoryFilter) {
      filteredEvents = events.filter((e) => e.category === args.categoryFilter);
    } else {
      // Default: Exclude granular monitoring telemetry so timeline is not flooded
      filteredEvents = events.filter((e) => e.category !== "monitoring");
    }

    // ----------------------------------------------------
    // 5. SORTING: occurredAt DESC, secondary deterministic tie-breaker by id
    // ----------------------------------------------------
    filteredEvents.sort((a, b) => {
      if (b.occurredAt !== a.occurredAt) {
        return b.occurredAt - a.occurredAt;
      }
      return a.id.localeCompare(b.id);
    });

    // ----------------------------------------------------
    // 6. BOUNDED RESULT RETRIEVAL
    // ----------------------------------------------------
    const effectiveLimit = Math.max(1, Math.min(args.limit ?? 100, 500));
    return filteredEvents.slice(0, effectiveLimit);
  },
});
