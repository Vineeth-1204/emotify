import { v } from "convex/values";
import { query } from "./functions";
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
    counsellorRequestId?: string; // Originating counsellorRequests._id
    appointmentId?: string; // Originating appointments._id
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

export interface TimelineCursorPayload {
  t: number;
  id: string;
  u: string;
}

export type PaginatedTimelineResult = CanonicalTimelineEvent[] & {
  events: CanonicalTimelineEvent[];
  nextCursor: string | null;
};

export function encodeTimelineCursor(payload: TimelineCursorPayload): string {
  const json = JSON.stringify(payload);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf-8").toString("base64");
  }
  return btoa(json);
}

export function decodeTimelineCursor(cursorStr: string, expectedUserId: string): TimelineCursorPayload {
  let json = "";
  try {
    if (typeof Buffer !== "undefined") {
      json = Buffer.from(cursorStr, "base64").toString("utf-8");
    } else {
      json = atob(cursorStr);
    }
    const parsed = JSON.parse(json);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.t !== "number" ||
      isNaN(parsed.t) ||
      typeof parsed.id !== "string" ||
      parsed.id.trim() === "" ||
      typeof parsed.u !== "string"
    ) {
      throw new Error("Invalid cursor structure");
    }
    if (parsed.u !== expectedUserId) {
      throw new Error("Cursor does not match requested student timeline");
    }
    return parsed as TimelineCursorPayload;
  } catch (err: any) {
    if (err.message === "Cursor does not match requested student timeline") {
      throw err;
    }
    throw new Error(`Malformed or invalid timeline cursor: ${err.message}`);
  }
}

/**
 * Aggregates authoritative clinical records into a unified longitudinal timeline for a student.
 * Database-bounded per source with deterministic cursor pagination (Priority 11 Step 5C).
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
    cursor: v.optional(v.union(v.string(), v.null())),
    paginate: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<PaginatedTimelineResult> => {
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

    // Bounded candidate limits per source (Priority 11 Step 5C)
    const effectiveLimit = Math.max(1, Math.min(args.limit ?? 50, 100));
    const targetEligible = effectiveLimit + 1;

    let cursorObj: TimelineCursorPayload | null = null;
    if (args.cursor) {
      cursorObj = decodeTimelineCursor(args.cursor, canonicalUserId);
    }

    const cat = args.categoryFilter;
    const shouldQueryScreening = !cat || cat === "screening";
    const shouldQueryTriage = !cat || cat === "triage";
    const shouldQuerySafety = !cat || cat === "safety";
    const shouldQueryCounseling = !cat || cat === "counseling";
    const shouldQueryIntervention = !cat || cat === "intervention";
    const shouldQueryMonitoring = cat === "monitoring";
    const shouldQueryNote = !cat || cat === "note";

    // Helper: Iteratively fetch bounded candidate stream for a given table across user IDs
    async function fetchSourceForUserIds<T extends { _id: any }>(
      shouldQuery: boolean,
      queryFactory: (id: string) => any,
      getDocTimestamp: (doc: T) => number,
      getDocId: (doc: T) => string,
      isDocEligible: (doc: T) => boolean,
      maxScanBudget: number = 1000
    ): Promise<{ docs: T[]; hasMore: boolean }> {
      if (!shouldQuery) {
        return { docs: [], hasMore: false };
      }

      const allDocs: T[] = [];
      const seenIds = new Set<string>();
      let anyHasMore = false;

      for (const uid of searchUserIds) {
        const q = queryFactory(uid);
        let scanned = 0;
        let countForUid = 0;

        for await (const doc of q) {
          scanned++;
          if (scanned > maxScanBudget) {
            anyHasMore = true;
            break;
          }

          if (!isDocEligible(doc)) {
            continue;
          }

          const t = getDocTimestamp(doc);
          const id = getDocId(doc);

          if (cursorObj) {
            if (t > cursorObj.t) continue;
            if (t === cursorObj.t && id.localeCompare(cursorObj.id) >= 0) {
              continue;
            }
          }

          const idStr = String(doc._id);
          if (!seenIds.has(idStr)) {
            seenIds.add(idStr);
            allDocs.push(doc);
            countForUid++;
          }

          if (countForUid >= targetEligible) {
            anyHasMore = true;
            break;
          }
        }
      }

      return { docs: allDocs, hasMore: anyHasMore };
    }

    // 3. Query authoritative tables in parallel with database-level bounding
    const [
      resScreeningAttempts,
      resScreenings,
      resTriages,
      resAlerts,
      resCounsellorRequests,
      resAppointments,
      resFollowUps,
      resCbtSessions,
      resJpmrLogs,
      resReframeLogs,
      resMicroGoals,
      resClinicalTimelines,
      resAiMonitoringLogs,
      resBreathingLogs,
      resGroundingLogs,
      resEmotionLogs,
      resDailyCheckins,
      resEmotionMaps,
    ] = await Promise.all([
      // 1. screeningAttempts (Uses by_userId_and_startedAt compound index from Step 5B)
      fetchSourceForUserIds(
        shouldQueryScreening,
        (id) =>
          cursorObj
            ? ctx.db
                .query("screeningAttempts")
                .withIndex("by_userId_and_startedAt", (q: any) =>
                  q.eq("userId", id).lte("startedAt", cursorObj!.t)
                )
                .order("desc")
            : ctx.db
                .query("screeningAttempts")
                .withIndex("by_userId_and_startedAt", (q: any) => q.eq("userId", id))
                .order("desc"),
        (d: any) => d.completedAt || d.startedAt,
        (d: any) => `screeningAttempts_${d._id}`,
        (d: any) => d.status === "completed" || d.status === "in_progress"
      ),
      // 2. screenings (legacy mirror table for historical deduplication)
      fetchSourceForUserIds(
        shouldQueryScreening,
        (id) =>
          ctx.db
            .query("screenings")
            .withIndex("by_userId", (q: any) => q.eq("userId", id))
            .order("desc"),
        (d: any) => d.completedAt || d.createdAt,
        (d: any) => `screenings_${d._id}`,
        (d: any) => !d.attemptId
      ),
      // 3. triages (Uses by_userId_and_createdAt compound index from Step 5B)
      fetchSourceForUserIds(
        shouldQueryTriage,
        (id) =>
          cursorObj
            ? ctx.db
                .query("triages")
                .withIndex("by_userId_and_createdAt", (q: any) =>
                  q.eq("userId", id).lte("createdAt", cursorObj!.t)
                )
                .order("desc")
            : ctx.db
                .query("triages")
                .withIndex("by_userId_and_createdAt", (q: any) => q.eq("userId", id))
                .order("desc"),
        (d: any) => d.createdAt,
        (d: any) => `triages_${d._id}`,
        () => true
      ),
      // 4. alerts
      fetchSourceForUserIds(
        shouldQuerySafety,
        (id) =>
          ctx.db
            .query("alerts")
            .withIndex("by_userId", (q: any) => q.eq("userId", id))
            .order("desc"),
        (d: any) => d.createdAt,
        (d: any) => `alerts_${d._id}`,
        () => true
      ),
      // 5. counsellorRequests (Note: indexed by by_user_id)
      fetchSourceForUserIds(
        shouldQueryCounseling,
        (id) =>
          ctx.db
            .query("counsellorRequests")
            .withIndex("by_user_id", (q: any) => q.eq("user_id", id))
            .order("desc"),
        (d: any) => d.timestamp,
        (d: any) => `counsellorRequests_${d._id}`,
        () => true
      ),
      // 6. appointments (Note: indexed by userId as v.id("users"))
      fetchSourceForUserIds(
        shouldQueryCounseling,
        (id) =>
          userDocId
            ? ctx.db
                .query("appointments")
                .withIndex("by_userId", (q: any) => q.eq("userId", userDocId))
                .order("desc")
            : ctx.db
                .query("appointments")
                .withIndex("by_userId", (q: any) => q.eq("userId", id as any))
                .order("desc"),
        (d: any) =>
          d.status === "completed" || d.attended === "yes"
            ? d.endTime || d.startTime || d.createdAt
            : d.startTime || d.createdAt,
        (d: any) => `appointments_${d._id}`,
        () => true
      ),
      // 7. followUps
      fetchSourceForUserIds(
        shouldQueryCounseling,
        (id) =>
          ctx.db
            .query("followUps")
            .withIndex("by_userId", (q: any) => q.eq("userId", id))
            .order("desc"),
        (d: any) => d.createdAt,
        (d: any) => `followUps_${d._id}`,
        () => true
      ),
      // 8. cbtSessions (Uses by_userId_and_timestamp compound index from Step 5B)
      fetchSourceForUserIds(
        shouldQueryIntervention,
        (id) =>
          cursorObj
            ? ctx.db
                .query("cbtSessions")
                .withIndex("by_userId_and_timestamp", (q: any) =>
                  q.eq("userId", id).lte("timestamp", cursorObj!.t)
                )
                .order("desc")
            : ctx.db
                .query("cbtSessions")
                .withIndex("by_userId_and_timestamp", (q: any) => q.eq("userId", id))
                .order("desc"),
        (d: any) => d.timestamp,
        (d: any) =>
          d.sessionStatus === "safety_mode"
            ? `cbtSessions_${d._id}_safety`
            : `cbtSessions_${d._id}`,
        (d: any) => d.sessionStatus === "completed" || d.sessionStatus === "safety_mode"
      ),
      // 9. jpmrLogs (Uses by_userId_and_completedAt compound index from Step 5B)
      fetchSourceForUserIds(
        shouldQueryIntervention,
        (id) =>
          cursorObj
            ? ctx.db
                .query("jpmrLogs")
                .withIndex("by_userId_and_completedAt", (q: any) =>
                  q.eq("userId", id).lte("completedAt", cursorObj!.t)
                )
                .order("desc")
            : ctx.db
                .query("jpmrLogs")
                .withIndex("by_userId_and_completedAt", (q: any) => q.eq("userId", id))
                .order("desc"),
        (d: any) => d.completedAt || d.createdAt,
        (d: any) => `jpmrLogs_${d._id}`,
        (d: any) => !!d.completed
      ),
      // 10. reframeLogs (Uses by_userId_and_createdAt compound index from Step 5B)
      fetchSourceForUserIds(
        shouldQueryIntervention,
        (id) =>
          cursorObj
            ? ctx.db
                .query("reframeLogs")
                .withIndex("by_userId_and_createdAt", (q: any) =>
                  q.eq("userId", id).lte("createdAt", cursorObj!.t)
                )
                .order("desc")
            : ctx.db
                .query("reframeLogs")
                .withIndex("by_userId_and_createdAt", (q: any) => q.eq("userId", id))
                .order("desc"),
        (d: any) => d.createdAt,
        (d: any) => `reframeLogs_${d._id}`,
        (d: any) => !d.cbtSessionId
      ),
      // 11. microGoals
      fetchSourceForUserIds(
        shouldQueryIntervention,
        (id) =>
          ctx.db
            .query("microGoals")
            .withIndex("by_userId", (q: any) => q.eq("userId", id))
            .order("desc"),
        (d: any) => d.completedAt || d.createdAt,
        (d: any) => `microGoals_${d._id}`,
        () => true
      ),
      // 12. clinicalTimelines (Staff manual notes)
      fetchSourceForUserIds(
        shouldQueryNote,
        (id) =>
          ctx.db
            .query("clinicalTimelines")
            .withIndex("by_userId", (q: any) => q.eq("userId", id))
            .order("desc"),
        (d: any) => d.timestamp || d.createdAt,
        (d: any) => `clinicalTimelines_${d._id}`,
        () => true
      ),
      // 13. aiMonitoringLogs
      fetchSourceForUserIds(
        shouldQueryMonitoring,
        (id) =>
          ctx.db
            .query("aiMonitoringLogs")
            .withIndex("by_userId", (q: any) => q.eq("userId", id))
            .order("desc"),
        (d: any) => d.createdAt,
        (d: any) => `aiMonitoringLogs_${d._id}`,
        () => true
      ),
      // 14. breathingLogs (Priority 9 Step 6B - Paced/Box/Calming Breathing)
      fetchSourceForUserIds(
        shouldQueryIntervention,
        (id) =>
          ctx.db
            .query("breathingLogs")
            .withIndex("by_userId", (q: any) => q.eq("userId", id))
            .order("desc"),
        (d: any) => d.completedAt || d.startedAt || d.createdAt,
        (d: any) => `breathingLogs_${d._id}`,
        (d: any) => d.status === "completed" || d.status === "partial"
      ),
      // 15. groundingLogs (Priority 9 Step 6B - 5-4-3-2-1 Sensory Grounding)
      fetchSourceForUserIds(
        shouldQueryIntervention,
        (id) =>
          ctx.db
            .query("groundingLogs")
            .withIndex("by_userId", (q: any) => q.eq("userId", id))
            .order("desc"),
        (d: any) => d.completedAt || d.startedAt || d.createdAt,
        (d: any) => `groundingLogs_${d._id}`,
        (d: any) => d.status === "completed" || d.status === "partial"
      ),
      // 16. emotionLogs (Optional telemetry - Uses by_userId_and_createdAt from Step 5B)
      fetchSourceForUserIds(
        shouldQueryMonitoring,
        (id) =>
          cursorObj
            ? ctx.db
                .query("emotionLogs")
                .withIndex("by_userId_and_createdAt", (q: any) =>
                  q.eq("userId", id).lte("createdAt", cursorObj!.t)
                )
                .order("desc")
            : ctx.db
                .query("emotionLogs")
                .withIndex("by_userId_and_createdAt", (q: any) => q.eq("userId", id))
                .order("desc"),
        (d: any) => d.createdAt,
        (d: any) => `emotionLogs_${d._id}`,
        () => true
      ),
      // 17. dailyCheckins (Optional telemetry - uses by_userId index)
      fetchSourceForUserIds(
        shouldQueryMonitoring,
        (id) =>
          ctx.db
            .query("dailyCheckins")
            .withIndex("by_userId", (q: any) => q.eq("userId", id))
            .order("desc"),
        (d: any) => d.createdAt,
        (d: any) => `dailyCheckins_${d._id}`,
        () => true
      ),
      // 18. emotionMaps (Optional somatic telemetry)
      fetchSourceForUserIds(
        shouldQueryMonitoring,
        (id) =>
          ctx.db
            .query("emotionMaps")
            .withIndex("by_userId", (q: any) => q.eq("userId", id))
            .order("desc"),
        (d: any) => d.createdAt,
        (d: any) => `emotionMaps_${d._id}`,
        () => true
      ),
    ]);

    const screeningAttempts = resScreeningAttempts.docs;
    const screenings = resScreenings.docs;
    const triages = resTriages.docs;
    const alerts = resAlerts.docs;
    const counsellorRequests = resCounsellorRequests.docs;
    const appointmentsList = resAppointments.docs;
    const followUps = resFollowUps.docs;
    const cbtSessions = resCbtSessions.docs;
    const jpmrLogs = resJpmrLogs.docs;
    const reframeLogs = resReframeLogs.docs;
    const microGoals = resMicroGoals.docs;
    const clinicalTimelines = resClinicalTimelines.docs;
    const aiMonitoringLogs = resAiMonitoringLogs.docs;
    const breathingLogs = resBreathingLogs.docs;
    const groundingLogs = resGroundingLogs.docs;
    const emotionLogs = resEmotionLogs.docs;
    const dailyCheckins = resDailyCheckins.docs;
    const emotionMaps = resEmotionMaps.docs;

    const anySourceHasMore = [
      resScreeningAttempts,
      resScreenings,
      resTriages,
      resAlerts,
      resCounsellorRequests,
      resAppointments,
      resFollowUps,
      resCbtSessions,
      resJpmrLogs,
      resReframeLogs,
      resMicroGoals,
      resClinicalTimelines,
      resAiMonitoringLogs,
      resBreathingLogs,
      resGroundingLogs,
      resEmotionLogs,
      resDailyCheckins,
      resEmotionMaps,
    ].some((r) => r.hasMore);

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
      if (s.attemptId) {
        let attemptExists = knownAttemptIds.has(s.attemptId);
        if (!attemptExists) {
          try {
            const attemptDoc = await ctx.db.get(s.attemptId as any);
            if (attemptDoc) attemptExists = true;
          } catch {}
        }
        if (attemptExists) {
          continue;
        }
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

      // 4a-ii. Student closed the emergency safety screen while this alert was open
      if (a.studentDismissedAt) {
        events.push({
          id: `alerts_${a._id}_dismissed`,
          studentId: canonicalUserId,
          category: "safety",
          eventType: "emergency_screen_dismissed",
          occurredAt: a.studentDismissedAt,
          sourceTable: "alerts",
          sourceId: String(a._id),
          title: "Student Closed Emergency Screen",
          summary: `Student dismissed the safety screen ${a.studentDismissCount ?? 1} time(s) while this alert was open.`,
          severity: isCritical ? "critical" : "severe",
          status: a.status,
          provenance: {
            alertId: String(a._id),
            triageId: a.triageId ? String(a.triageId) : undefined,
            attemptId: a.attemptId ? String(a.attemptId) : undefined,
          },
          metadata: { dismissCount: a.studentDismissCount ?? 1 },
        });
      }

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
        provenance: {
          attemptId: req.attemptId ? String(req.attemptId) : undefined,
          triageId: req.triageId ? String(req.triageId) : undefined,
        },
        metadata: {
          notes: req.notes,
          status: req.status,
          sourceType: req.sourceType,
        },
      });
    }

    // ----------------------------------------------------
    // SOURCE 6: appointments (Clinical Sessions)
    // ----------------------------------------------------
    for (const appt of appointmentsList) {
      const apptProvenance = {
        attemptId: appt.attemptId ? String(appt.attemptId) : undefined,
        triageId: appt.triageId ? String(appt.triageId) : undefined,
        counsellorRequestId: appt.counsellorRequestId ? String(appt.counsellorRequestId) : undefined,
      };

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
          provenance: apptProvenance,
          metadata: {
            date: appt.date,
            time: appt.time,
            attended: appt.attended,
            rating: appt.rating,
            counsellorRequestId: appt.counsellorRequestId ? String(appt.counsellorRequestId) : undefined,
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
          provenance: apptProvenance,
          metadata: {
            rejectionReason: appt.rejectionReason,
            date: appt.date,
            time: appt.time,
            counsellorRequestId: appt.counsellorRequestId ? String(appt.counsellorRequestId) : undefined,
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
          provenance: apptProvenance,
          metadata: {
            date: appt.date,
            time: appt.time,
            status: appt.status,
            createdBy: appt.createdBy,
            counsellorRequestId: appt.counsellorRequestId ? String(appt.counsellorRequestId) : undefined,
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
        provenance: {
          attemptId: f.attemptId ? String(f.attemptId) : undefined,
          triageId: f.triageId ? String(f.triageId) : undefined,
          appointmentId: f.appointmentId ? String(f.appointmentId) : undefined,
        },
        metadata: {
          type: f.type,
          dueDate: f.dueDate,
          completed: f.completed,
          appointmentId: f.appointmentId ? String(f.appointmentId) : undefined,
        },
      });
    }

    // ----------------------------------------------------
    // SOURCE 8: cbtSessions (Therapy Sessions)
    // ----------------------------------------------------
    const knownCbtSessionIds = new Set<string>();
    const reframeBySessionId = new Map<string, any>();
    for (const r of reframeLogs) {
      if (r.cbtSessionId) {
        reframeBySessionId.set(String(r.cbtSessionId), r);
      }
    }

    for (const session of cbtSessions) {
      knownCbtSessionIds.add(String(session._id));
      let linkedReframe = reframeBySessionId.get(String(session._id));
      if (!linkedReframe) {
        const found = await ctx.db
          .query("reframeLogs")
          .withIndex("by_cbtSessionId", (q: any) => q.eq("cbtSessionId", String(session._id)))
          .first();
        if (found) {
          linkedReframe = found;
        }
      }

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
            attemptId: session.attemptId ? String(session.attemptId) : undefined,
            triageId: session.triageId ? String(session.triageId) : undefined,
          },
          metadata: {
            emotion: session.emotion,
            emotionBefore: session.emotionBefore,
            emotionAfter: session.emotionAfter,
            beliefScore: session.beliefScore,
            thinkingStyle: session.thinkingStyle,
            cbtDistortion: session.cbtDistortion,
            ...(linkedReframe ? {
              reframeCompleted: true,
              reframeImprovementPercentage: linkedReframe.improvement_percentage,
            } : {}),
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
            attemptId: session.attemptId ? String(session.attemptId) : undefined,
            triageId: session.triageId ? String(session.triageId) : undefined,
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
          provenance: {
            attemptId: j.attemptId ? String(j.attemptId) : undefined,
            triageId: j.triageId ? String(j.triageId) : undefined,
          },
          metadata: {
            preIntensity: j.preIntensity,
            postIntensity: j.postIntensity,
            durationSeconds: j.durationSeconds,
            sourceType: j.sourceType,
          },
        });
      }
    }

    // ----------------------------------------------------
    // SOURCE 10: reframeLogs (Cognitive Restructuring)
    // ----------------------------------------------------
    for (const r of reframeLogs) {
      // Deduplicate: If this reframe originated within an authoritative CBT session,
      // the CBT event is authoritative and we do not produce a duplicate top-level card.
      if (r.cbtSessionId) {
        let parentExists = knownCbtSessionIds.has(String(r.cbtSessionId));
        if (!parentExists) {
          try {
            const parentDoc = await ctx.db.get(r.cbtSessionId as any);
            if (parentDoc) parentExists = true;
          } catch {}
        }
        if (parentExists) {
          continue;
        }
      }

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
        provenance: {
          attemptId: r.attemptId ? String(r.attemptId) : undefined,
          triageId: r.triageId ? String(r.triageId) : undefined,
          sessionId: r.cbtSessionId ? String(r.cbtSessionId) : undefined,
        },
        metadata: {
          thinkingTrap: r.thinking_trap_choice,
          preIntensity: r.pre_reframe_intensity,
          postIntensity: r.post_reframe_intensity,
          improvementPercentage: r.improvement_percentage,
          sourceType: r.sourceType,
        },
      });
    }

    // ----------------------------------------------------
    // SOURCE 10B: breathingLogs (Paced/Box/Calming Breathing)
    // ----------------------------------------------------
    for (const b of breathingLogs) {
      if (b.status === "completed" || b.status === "partial") {
        events.push({
          id: `breathingLogs_${b._id}`,
          studentId: canonicalUserId,
          category: "intervention",
          eventType: b.status === "completed" ? "breathing_completed" : "breathing_partial",
          occurredAt: b.completedAt || b.startedAt || b.createdAt,
          sourceTable: "breathingLogs",
          sourceId: String(b._id),
          title: `Breathing: ${b.protocolName}`,
          summary: `${b.cyclesCompleted}/${b.targetCycles} cycles completed (${b.durationSeconds}s). Status: ${b.status}.`,
          status: b.status,
          provenance: {
            attemptId: b.attemptId ? String(b.attemptId) : undefined,
            triageId: b.triageId ? String(b.triageId) : undefined,
          },
          metadata: {
            protocolId: b.protocolId,
            protocolName: b.protocolName,
            cyclesCompleted: b.cyclesCompleted,
            targetCycles: b.targetCycles,
            durationSeconds: b.durationSeconds,
            sourceType: b.sourceType,
          },
        });
      }
    }

    // ----------------------------------------------------
    // SOURCE 10C: groundingLogs (5-4-3-2-1 Sensory Grounding)
    // ----------------------------------------------------
    for (const g of groundingLogs) {
      if (g.status === "completed" || g.status === "partial") {
        events.push({
          id: `groundingLogs_${g._id}`,
          studentId: canonicalUserId,
          category: "intervention",
          eventType: g.status === "completed" ? "grounding_completed" : "grounding_partial",
          occurredAt: g.completedAt || g.startedAt || g.createdAt,
          sourceTable: "groundingLogs",
          sourceId: String(g._id),
          title: "Sensory Grounding: 5-4-3-2-1",
          summary: `${g.stepsCompleted}/5 sensory steps completed (${g.durationSeconds}s). Status: ${g.status}.`,
          status: g.status,
          provenance: {
            attemptId: g.attemptId ? String(g.attemptId) : undefined,
            triageId: g.triageId ? String(g.triageId) : undefined,
          },
          metadata: {
            protocolId: g.protocolId,
            protocolName: g.protocolName,
            stepsCompleted: g.stepsCompleted,
            totalSteps: g.totalSteps || 5,
            durationSeconds: g.durationSeconds,
            sourceType: g.sourceType,
          },
        });
      }
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
    // 5. SORTING: occurredAt DESC, secondary deterministic tie-breaker by id DESC
    filteredEvents.sort((a, b) => {
      if (b.occurredAt !== a.occurredAt) {
        return b.occurredAt - a.occurredAt;
      }
      return b.id.localeCompare(a.id);
    });

    // 5b. CURSOR FILTERING: Keep only events strictly after cursor in descending sequence
    let paginatedPool = filteredEvents;
    if (cursorObj) {
      paginatedPool = filteredEvents.filter((e) => {
        if (e.occurredAt < cursorObj!.t) return true;
        if (e.occurredAt === cursorObj!.t) {
          return e.id.localeCompare(cursorObj!.id) < 0;
        }
        return false;
      });
    }

    // 6. BOUNDED RESULT RETRIEVAL
    const pageEvents = paginatedPool.slice(0, effectiveLimit);
    const hasMore = paginatedPool.length > effectiveLimit || anySourceHasMore;
    const nextCursor =
      hasMore && pageEvents.length > 0
        ? encodeTimelineCursor({
            t: pageEvents[pageEvents.length - 1].occurredAt,
            id: pageEvents[pageEvents.length - 1].id,
            u: canonicalUserId,
          })
        : null;

    if (args.cursor !== undefined || args.paginate === true) {
      return {
        events: pageEvents,
        nextCursor,
      } as any as PaginatedTimelineResult;
    }

    return pageEvents as any as PaginatedTimelineResult;
  },
});
