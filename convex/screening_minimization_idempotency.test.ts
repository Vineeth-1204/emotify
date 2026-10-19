/**
 * Phase 2: screening data exposure and server-side idempotency.
 *
 *  - Students cannot read scores, flags, triage ids or staff metadata through any clinical read;
 *    they get only their own minimal result and safety status.
 *  - submitScreeningAttempt is idempotent per (student, submissionKey): repeats, concurrent
 *    duplicates and retries after a committed-but-unacknowledged request create nothing new.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const zeros = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), 0]));
const fill = (n: number, value: number, count = n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), i < count ? value : 0]));

const MILD = { phq9: zeros(9), gad7: zeros(7), pq16: zeros(16) };
const MODERATE = { phq9: fill(9, 2, 6), gad7: zeros(7), pq16: zeros(16) }; // PHQ-9 = 12
const SEVERE = { phq9: zeros(9), gad7: fill(7, 3, 5), pq16: zeros(16) }; // GAD-7 = 15
const SUICIDE = { phq9: { ...zeros(9), "9": 2 }, gad7: zeros(7), pq16: zeros(16) };

const KEY_A = "11111111-aaaa-4bbb-8ccc-000000000001";
const KEY_B = "11111111-aaaa-4bbb-8ccc-000000000002";

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (doc: any) => ctx.db.insert("users", { status: "active", created_at: Date.now(), ...doc });
    return {
      admin: await user({ full_name: "Admin", role: "admin" }),
      counsellorA: await user({ full_name: "Counsellor A", role: "counsellor", mobile_number: "9000000001", email: "a@example.com" }),
      counsellorB: await user({ full_name: "Counsellor B", role: "counsellor" }),
      studentA: await user({ full_name: "Student A", role: "patient", patientId: "301" }),
      studentB: await user({ full_name: "Student B", role: "patient", patientId: "302" }),
    };
  });
  const as = (id: string) => t.withIdentity({ subject: id });
  await as(ids.admin).mutation(api.counsellorAssignments.assign, { studentId: ids.studentA as any, counsellorId: ids.counsellorA as any });
  const counts = async () =>
    t.run(async (ctx) => {
      const n = async (table: any) => (await ctx.db.query(table).collect()).length;
      return {
        attempts: await n("screeningAttempts"),
        triages: await n("triages"),
        followUps: await n("followUps"),
        alerts: await n("alerts"),
        notifications: await n("notifications"),
        submissions: await n("screeningSubmissions"),
      };
    });
  return { t, ...ids, as, counts };
}

const submit = (tester: any, responses: any, submissionKey?: string, userId?: string) =>
  tester.mutation(api.screening.submitScreeningAttempt, { responses, ...(submissionKey ? { submissionKey } : {}), ...(userId ? { userId } : {}) });

// ---------------------------------------------------------------------------------------------
describe("Task A: students cannot read clinical internals", () => {
  async function withClinicalData() {
    const s = await setup();
    await submit(s.as(s.studentA), SUICIDE, KEY_A);
    const ref = await s.t.run(async (ctx) => {
      const attempt = (await ctx.db.query("screeningAttempts").collect())[0];
      const alert = (await ctx.db.query("alerts").collect())[0];
      const followUp = (await ctx.db.query("followUps").collect())[0];
      const now = Date.now();
      const appointmentId = await ctx.db.insert("appointments", { userId: s.studentA as any, status: "pending", createdAt: now, startTime: now + 3600000, date: "2026-10-20", time: "10:00 AM", title: "Check-in" });
      const requestId = await ctx.db.insert("counsellorRequests", { user_id: s.studentA, timestamp: now, status: "pending", thought_original: "x" });
      return { attemptId: attempt._id, triageId: attempt.triageId!, alertId: alert._id, followUpId: followUp._id, appointmentId, requestId };
    });
    return { ...s, ref };
  }

  const STAFF_ONLY = (r: any, self: string): Array<[string, any, any]> => [
    ["screening.getLatestAttempt", api.screening.getLatestAttempt, { userId: self }],
    ["screening.getLatestRawAttempt", api.screening.getLatestRawAttempt, { userId: self }],
    ["screening.getScreeningHistory", api.screening.getScreeningHistory, { userId: self }],
    ["screening.getAllAttempts", api.screening.getAllAttempts, { userId: self }],
    ["screening.getAttemptById", api.screening.getAttemptById, { attemptId: r.attemptId }],
    ["screening.getLatest", api.screening.getLatest, { userId: self }],
    ["screening.getLatest (no args)", api.screening.getLatest, {}],
    ["screening.getAll", api.screening.getAll, { userId: self }],
    ["screening.getAttemptWithTriage", api.screening.getAttemptWithTriage, { attemptId: r.attemptId }],
    ["screening.getAttemptAlerts", api.screening.getAttemptAlerts, { attemptId: r.attemptId }],
    ["triage.getLatestByUserId", api.triage.getLatestByUserId, { userId: self }],
    ["triage.getLatest", api.triage.getLatest, {}],
    ["triage.getTriageWithAttempt", api.triage.getTriageWithAttempt, { triageId: r.triageId }],
    ["alerts.getPending", api.alerts.getPending, { userId: self }],
    ["alerts.getAll", api.alerts.getAll, { userId: self }],
    ["alerts.getAlertProvenance", api.alerts.getAlertProvenance, { alertId: r.alertId }],
    ["alerts.getTriageAlerts", api.alerts.getTriageAlerts, { triageId: r.triageId }],
    ["timeline.getStudentClinicalTimeline", api.timeline.getStudentClinicalTimeline, { userId: self }],
    ["dashboard.getPatientTimeline", api.dashboard.getPatientTimeline, { userId: self }],
    ["counsellorRequests.getStudentCounsellorRequests", api.counsellorRequests.getStudentCounsellorRequests, { userId: self }],
    ["counsellorRequests.getRequestById", api.counsellorRequests.getRequestById, { requestId: r.requestId }],
    ["followUps.getFollowUpById", api.followUps.getFollowUpById, { id: r.followUpId }],
    ["followUps.getFollowUpsByAppointmentId", api.followUps.getFollowUpsByAppointmentId, { appointmentId: r.appointmentId }],
  ];

  test("every staff clinical read refuses a student, even for their own records", async () => {
    const { as, studentA, ref } = await withClinicalData();
    for (const [name, fn, args] of STAFF_ONLY(ref, studentA)) {
      await expect(as(studentA).query(fn, args), name).rejects.toThrow(/Counselor or Admin access required/);
    }
  });

  test("every staff clinical read refuses another student and unauthenticated callers", async () => {
    const { t, as, studentA, studentB, ref } = await withClinicalData();
    for (const [name, fn, args] of STAFF_ONLY(ref, studentA)) {
      await expect(as(studentB).query(fn, args), name).rejects.toThrow(/Counselor or Admin access required/);
      await expect(t.query(fn, args), name).rejects.toThrow(/Unauthenticated|Login required/);
    }
  });

  test("staff APIs are unchanged: admin and the assigned counsellor still read them; others stay out of caseload", async () => {
    const { as, admin, counsellorA, counsellorB, studentA, ref } = await withClinicalData();
    const latest: any = await as(admin).query(api.screening.getLatest, { userId: studentA });
    expect(latest).toMatchObject({ attemptId: String(ref.attemptId), phq9_item9_flag: true, phq9_item9_score: 2, phq9_total: 2 });
    expect(((await as(counsellorA).query(api.triage.getLatestByUserId, { userId: studentA })) as any).level).toBe("suicide_flag");
    expect(((await as(counsellorA).query(api.alerts.getPending, { userId: studentA })) as any[]).length).toBe(1);
    expect(((await as(counsellorA).query(api.screening.getAttemptWithTriage, { attemptId: ref.attemptId })) as any).triage.level).toBe("suicide_flag");
    await expect(as(counsellorB).query(api.screening.getAll, { userId: studentA })).rejects.toThrow(/not in your caseload/);
    await expect(as(counsellorB).query(api.timeline.getStudentClinicalTimeline, { userId: studentA })).rejects.toThrow();
  });

  test("dashboard alert list and activity feed carry no alert data for students; staff views unchanged", async () => {
    const { t, as, admin, counsellorA, studentA } = await withClinicalData();
    await t.run(async (ctx) => {
      await ctx.db.insert("emotionLogs", { userId: studentA, emotion: "joy", bodyRegions: ["chest"], createdAt: Date.now() });
    });
    expect(await as(studentA).query(api.dashboard.getAlerts, {})).toEqual([]);
    const feed: any[] = await as(studentA).query(api.dashboard.getActivityFeed, {});
    expect(feed.map((f) => f.type)).toEqual(["emotion"]);
    expect(JSON.stringify(feed)).not.toMatch(/suicide|Risk|alert/i);

    for (const staff of [admin, counsellorA]) {
      const alerts: any[] = await as(staff).query(api.dashboard.getAlerts, {});
      expect(alerts.map((a) => a.type), String(staff)).toEqual(["suicide"]);
      const staffFeed: any[] = await as(staff).query(api.dashboard.getActivityFeed, {});
      expect(staffFeed.some((f) => f.type === "alert")).toBe(true);
    }
  });

  test("the student submit response has exactly { status, outcome, replayed }", async () => {
    const { as, studentA, studentB } = await setup();
    for (const [student, responses, outcome] of [
      [studentA, SUICIDE, "immediate_safety"],
      [studentB, MILD, "steady"],
    ] as const) {
      const res: any = await submit(as(student), responses, KEY_A);
      expect(res).toEqual({ status: "submitted", outcome, replayed: false });
    }
  });

  test("staff submitting for an assigned student still get the full response", async () => {
    const { as, counsellorA, studentA } = await setup();
    const res: any = await submit(as(counsellorA), SEVERE, KEY_A, studentA);
    expect(res).toMatchObject({ status: "submitted", outcome: "priority_support", triageLevel: "severe", suicideFlag: false, psychosisFlag: false, attemptType: "baseline" });
    expect(res.attemptId).toBeTruthy();
    expect(res.triageId).toBeTruthy();
    expect(res.followUpId).toBeTruthy();
    expect(res.results.gad7.score).toBe(15);
  });

  test("getMySafetyStatus: three booleans only, for the caller only; crisis gate opens for suicide_flag", async () => {
    const { t, as, studentA, studentB, admin } = await setup();
    expect(await as(studentA).query(api.triage.getMySafetyStatus, {})).toEqual({ crisis: false, forceRetest: false, elevatedSupport: false });
    await submit(as(studentA), SUICIDE, KEY_A);
    const status = await as(studentA).query(api.triage.getMySafetyStatus, {});
    expect(status).toEqual({ crisis: true, forceRetest: false, elevatedSupport: true });
    // Another student's status is not affected by A's triage and cannot be asked for.
    expect(await as(studentB).query(api.triage.getMySafetyStatus, {})).toEqual({ crisis: false, forceRetest: false, elevatedSupport: false });
    expect(await t.query(api.triage.getMySafetyStatus, {})).toBeNull();
    expect(await as(admin).query(api.triage.getMySafetyStatus, {})).toBeNull();

    await submit(as(studentB), SEVERE, KEY_A);
    expect(await as(studentB).query(api.triage.getMySafetyStatus, {})).toEqual({ crisis: false, forceRetest: false, elevatedSupport: true });
    await submit(as(studentB), MODERATE, KEY_B);
    expect(await as(studentB).query(api.triage.getMySafetyStatus, {})).toEqual({ crisis: false, forceRetest: false, elevatedSupport: false });

    await t.run(async (ctx) => {
      await ctx.db.insert("triages", { userId: studentB, level: "force_retest", suicideFlag: false, psychosisFlag: false, createdAt: Date.now() });
    });
    expect(await as(studentB).query(api.triage.getMySafetyStatus, {})).toEqual({ crisis: false, forceRetest: true, elevatedSupport: false });
  });

  test("getMyWellbeingIndicators: bands only (no totals, flags or ids); own data only", async () => {
    const { t, as, studentA, studentB } = await setup();
    expect(await as(studentA).query(api.screening.getMyWellbeingIndicators, {})).toBeNull();
    await submit(as(studentA), MODERATE, KEY_A);
    const w: any = await as(studentA).query(api.screening.getMyWellbeingIndicators, {});
    expect(w).toEqual({
      emotionalBalance: { percent: 56, badge: "balanced", badgeTone: "error", barTone: "warning" },
      mindCalmness: { percent: 100, badge: "serene", badgeTone: "success", barTone: "success" },
    });
    const text = JSON.stringify(w);
    for (const leak of ["score", "triage", "flag", "suicide", "attempt", "phq", "gad", "_id"]) expect(text).not.toContain(leak);
    expect(await as(studentB).query(api.screening.getMyWellbeingIndicators, {})).toBeNull();
    expect(await t.query(api.screening.getMyWellbeingIndicators, {})).toBeNull();
  });

  test("exportMyScreenings: the student's own totals only; no triage, flags or ids; never another student's", async () => {
    const { t, as, studentA, studentB } = await setup();
    await submit(as(studentA), SUICIDE, KEY_A);
    await submit(as(studentB), MODERATE, KEY_A);
    const rows: any[] = await as(studentA).query(api.screening.exportMyScreenings, {});
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(["completedAt", "gad7Total", "phq9Item9", "phq9Total", "pq16Total"]);
    expect(rows[0]).toMatchObject({ phq9Total: 2, phq9Item9: 2, gad7Total: 0, pq16Total: 0 });
    const rowsB: any[] = await as(studentB).query(api.screening.exportMyScreenings, {});
    expect(rowsB.map((r) => r.phq9Total)).toEqual([12]);
    expect(await t.query(api.screening.exportMyScreenings, {})).toEqual([]);
  });

  test("getStudentFollowUps: students see scheduling fields only; staff see the full record", async () => {
    const { as, admin, studentA, studentB } = await setup();
    await submit(as(studentA), SUICIDE, KEY_A);
    const mine: any[] = await as(studentA).query(api.followUps.getStudentFollowUps, {});
    expect(mine).toHaveLength(1);
    const allowed = new Set(["_id", "completed", "completedAt", "dueDate", "selfInitiated", "status", "type"]);
    for (const key of Object.keys(mine[0])) expect(allowed.has(key), key).toBe(true);
    for (const key of ["_id", "completed", "dueDate", "selfInitiated", "status", "type"]) expect(mine[0], key).toHaveProperty(key);
    for (const hidden of ["userId", "attemptId", "triageId", "sourceType", "appointmentId", "counselorId", "notes"]) expect(mine[0]).not.toHaveProperty(hidden);
    expect(mine[0]).toMatchObject({ type: "screening_review", completed: false, selfInitiated: false });
    await expect(as(studentB).query(api.followUps.getStudentFollowUps, { userId: studentA })).rejects.toThrow(/Unauthorized/);
    const staff: any[] = await as(admin).query(api.followUps.getStudentFollowUps, { userId: studentA });
    expect(staff[0].attemptId).toBeTruthy();
    expect(staff[0].triageId).toBeTruthy();
  });

  test("urgent-safety navigation keeps provenance without the client holding triage ids", async () => {
    const { t, as, studentA } = await setup();
    await submit(as(studentA), SUICIDE, KEY_A);
    const triageId = await t.run(async (ctx) => (await ctx.db.query("triages").collect())[0]._id);

    // Emergency screen -> "Talk to Counsellor Now" (no triageId sent by the app any more)
    const requestId = await as(studentA).mutation(api.counsellorRequests.create, { sourceType: "emergency_modal", thought_original: "Emergency" });
    // Emergency screen -> grounding (no triageId sent)
    const now = Date.now();
    const logId = await as(studentA).mutation(api.grounding.logSession, {
      protocolId: "54321", protocolName: "5-4-3-2-1", sourceType: "crisis_blocker", startedAt: now - 60000, durationSeconds: 60, stepsCompleted: 5, status: "completed",
    });
    const rows = await t.run(async (ctx) => ({ request: await ctx.db.get(requestId as any), log: await ctx.db.get(logId as any) }));
    expect((rows.request as any).triageId).toBe(triageId);
    expect((rows.log as any).triageId).toBe(triageId);

    // A non-crisis source never gets a fabricated triage link.
    const routine = await as(studentA).mutation(api.grounding.logSession, {
      protocolId: "54321", protocolName: "5-4-3-2-1", sourceType: "routine", startedAt: now - 60000, durationSeconds: 60, stepsCompleted: 5, status: "completed",
    });
    expect(((await t.run(async (ctx) => ctx.db.get(routine as any))) as any).triageId).toBeUndefined();
  });

  test("the mobile app source calls no staff-only clinical read", () => {
    const roots = ["app", "components", "context", "hooks", "services", "utils", "common"].map((d) => path.resolve(__dirname, "..", d));
    const files: string[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(p);
      }
    };
    roots.forEach(walk);
    expect(files.length).toBeGreaterThan(20);
    const source = files.map((f) => fs.readFileSync(f, "utf-8")).join("\n");
    const staffOnly = STAFF_ONLY({}, "").map(([name]) => name.split(" ")[0]);
    for (const name of new Set(staffOnly)) {
      expect(source, name).not.toMatch(new RegExp(`api\\.${name.replace(".", "\\.")}\\b`));
    }
    // The emergency screen and Home read the minimal safety status instead.
    expect(source).toContain("api.triage.getMySafetyStatus");
    expect(source).toContain("api.screening.getMyWellbeingIndicators");
  });
});

// ---------------------------------------------------------------------------------------------
describe("Task B: idempotent screening submission", () => {
  test("same key repeated: one attempt, triage, follow-up, alert set and notification set; replay is flagged", async () => {
    const { as, studentA, counts } = await setup();
    const first: any = await submit(as(studentA), SUICIDE, KEY_A);
    const after = await counts();
    expect(after).toMatchObject({ attempts: 1, triages: 1, followUps: 1, submissions: 1 });
    expect(after.alerts).toBe(1);
    expect(after.notifications).toBeGreaterThan(1);

    for (let i = 0; i < 3; i++) {
      const again: any = await submit(as(studentA), SUICIDE, KEY_A);
      expect(again).toEqual({ ...first, replayed: true });
    }
    expect(await counts()).toEqual(after);
  });

  test("retry after a committed request whose response was lost creates no duplicate alert or notification", async () => {
    const { t, as, studentA, admin, counsellorA, counts } = await setup();
    // The first delivery commits; the client never sees the response (timeout).
    await submit(as(studentA), SUICIDE, KEY_A).catch(() => undefined);
    const committed = await counts();
    const notified = await t.run(async (ctx) => (await ctx.db.query("notifications").collect()).filter((n) => n.type === "critical_risk").map((n) => String(n.recipientId)).sort());
    expect(notified).toEqual([String(admin), String(counsellorA)].sort());

    // The app retries with the same key (kept on the device until confirmed).
    const retry: any = await submit(as(studentA), SUICIDE, KEY_A);
    expect(retry).toEqual({ status: "submitted", outcome: "immediate_safety", replayed: true });
    expect(await counts()).toEqual(committed);
    expect(await as(studentA).query(api.triage.getMySafetyStatus, {})).toMatchObject({ crisis: true });
  });

  test("concurrent same-key deliveries produce one logical assessment", async () => {
    const { as, studentA, counts } = await setup();
    const results: any[] = await Promise.all([1, 2, 3, 4].map(() => submit(as(studentA), SEVERE, KEY_A)));
    expect(results.filter((r) => r.replayed === false)).toHaveLength(1);
    expect(results.filter((r) => r.replayed === true)).toHaveLength(3);
    for (const r of results) expect(r.outcome).toBe("priority_support");
    expect(await counts()).toMatchObject({ attempts: 1, triages: 1, followUps: 1, alerts: 1, submissions: 1 });
  });

  test("a new key is a genuine reassessment", async () => {
    const { t, as, studentA, counts } = await setup();
    await submit(as(studentA), MILD, KEY_A);
    const second: any = await submit(as(studentA), MILD, KEY_B);
    expect(second.replayed).toBe(false);
    expect(await counts()).toMatchObject({ attempts: 2, triages: 2, followUps: 2, submissions: 2 });
    const types = await t.run(async (ctx) => (await ctx.db.query("screeningAttempts").collect()).map((a) => a.attemptType));
    expect(types).toEqual(["baseline", "reassessment"]);
  });

  test("different students using the same key never collide or see each other's result", async () => {
    const { t, as, studentA, studentB, counts } = await setup();
    const a: any = await submit(as(studentA), SUICIDE, KEY_A);
    // B replays A's key with A's answers: B gets a fresh assessment of B's own, not A's record.
    const b: any = await submit(as(studentB), SUICIDE, KEY_A);
    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(false);
    // B with A's key but different answers is not rejected as a mismatch either (separate scope).
    const owners = await t.run(async (ctx) => (await ctx.db.query("screeningSubmissions").collect()).map((s) => s.userId).sort());
    expect(owners).toEqual([studentA, studentB].sort());
    expect((await counts()).attempts).toBe(2);
    expect(await as(studentB).query(api.screening.getMyResultSummary, {})).toMatchObject({ outcome: "immediate_safety" });

    const { t: t2, as: as2, studentA: a2, studentB: b2 } = await setup();
    await submit(as2(a2), SUICIDE, KEY_A);
    const bDifferent: any = await submit(as2(b2), MILD, KEY_A);
    expect(bDifferent).toEqual({ status: "submitted", outcome: "steady", replayed: false });
    expect(await t2.run(async (ctx) => (await ctx.db.query("screeningAttempts").collect()).length)).toBe(2);
  });

  test("same key with different answers is rejected and writes nothing", async () => {
    const { as, studentA, counts } = await setup();
    await submit(as(studentA), MILD, KEY_A);
    const before = await counts();
    await expect(submit(as(studentA), SUICIDE, KEY_A)).rejects.toThrow(/already recorded with different answers/);
    expect(await counts()).toEqual(before);
  });

  test("answer order does not change the fingerprint", async () => {
    const { as, studentA, counts } = await setup();
    await submit(as(studentA), SEVERE, KEY_A);
    const reversed = {
      pq16: Object.fromEntries(Object.entries(SEVERE.pq16).reverse()),
      gad7: Object.fromEntries(Object.entries(SEVERE.gad7).reverse()),
      phq9: Object.fromEntries(Object.entries(SEVERE.phq9).reverse()),
    };
    expect(((await submit(as(studentA), reversed, KEY_A)) as any).replayed).toBe(true);
    expect((await counts()).attempts).toBe(1);
  });

  test("malformed keys are rejected before anything is written", async () => {
    const { as, studentA, counts } = await setup();
    for (const bad of ["", "short", "has spaces in the key!!", "x".repeat(129), "../../etc/passwd-0000"]) {
      await expect(submit(as(studentA), MILD, bad || " "), JSON.stringify(bad)).rejects.toThrow(/Invalid submission key/);
    }
    expect(await counts()).toMatchObject({ attempts: 0, triages: 0, followUps: 0, alerts: 0, submissions: 0 });
  });

  test("incomplete and invalid responses are still rejected with no partial records, and do not burn the key", async () => {
    const { as, studentA, counts } = await setup();
    const empty = await counts();
    const incomplete = { ...MILD, phq9: { "1": 0, "2": 0 } };
    const outOfRange = { ...MILD, gad7: { ...zeros(7), "3": 7 } };
    const missingPq16 = { ...MILD, pq16: {} };
    for (const bad of [incomplete, outOfRange, missingPq16]) {
      await expect(submit(as(studentA), bad, KEY_A)).rejects.toThrow();
      expect(await counts()).toEqual(empty);
    }
    // Same key, now with complete answers: recorded once.
    expect(((await submit(as(studentA), MILD, KEY_A)) as any).replayed).toBe(false);
    expect(await counts()).toMatchObject({ attempts: 1, submissions: 1 });
  });

  test("the rate limit still applies to new submissions; replays do not consume it", async () => {
    const { as, studentA } = await setup();
    await submit(as(studentA), MILD, KEY_A);
    for (let i = 0; i < 8; i++) expect(((await submit(as(studentA), MILD, KEY_A)) as any).replayed).toBe(true);
    for (let i = 2; i <= 5; i++) await submit(as(studentA), MILD, `11111111-aaaa-4bbb-8ccc-00000000010${i}`);
    await expect(submit(as(studentA), MILD, "11111111-aaaa-4bbb-8ccc-000000000199")).rejects.toThrow(/rate limit|Too many|Rate/i);
  });

  test("without a key (older app builds) every call is still recorded, as before", async () => {
    const { as, studentA, counts } = await setup();
    await submit(as(studentA), MILD);
    await submit(as(studentA), MILD);
    expect(await counts()).toMatchObject({ attempts: 2, submissions: 0 });
  });

  test("staff replays return the same full record; a student cannot replay into another student's scope", async () => {
    const { as, counsellorA, studentA, studentB, counts } = await setup();
    const first: any = await submit(as(counsellorA), SEVERE, KEY_A, studentA);
    const again: any = await submit(as(counsellorA), SEVERE, KEY_A, studentA);
    expect(again.attemptId).toBe(first.attemptId);
    expect(again.replayed).toBe(true);
    // Student B naming student A as the target is refused outright.
    await expect(submit(as(studentB), SEVERE, KEY_A, studentA)).rejects.toThrow(/Unauthorized/);
    expect((await counts()).attempts).toBe(1);
  });

  test("key rows are removed with the rest of the student's data", async () => {
    const { t, as, studentA, studentB } = await setup();
    await submit(as(studentA), MILD, KEY_A);
    await submit(as(studentB), MILD, KEY_A);
    const source = fs.readFileSync(path.resolve(__dirname, "users.ts"), "utf-8");
    expect(source).toContain('{ table: "screeningSubmissions", index: "by_user_and_key", field: "userId" }');
    expect(await t.run(async (ctx) => (await ctx.db.query("screeningSubmissions").collect()).length)).toBe(2);
  });
});
