import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { evaluateClinicalTriage } from "./clinicalScoring";

const modules = import.meta.glob("./**/*.ts");

const zeros = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), 0]));
const fill = (n: number, value: number, count = n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), i < count ? value : 0]));

/** Responses that produce each existing triage level through the real scoring code. */
const RESPONSES = {
  mild: { phq9: zeros(9), gad7: zeros(7), pq16: zeros(16) },
  moderate: { phq9: fill(9, 2, 6), gad7: zeros(7), pq16: zeros(16) }, // PHQ-9 = 12
  severe: { phq9: zeros(9), gad7: fill(7, 3, 5), pq16: zeros(16) }, // GAD-7 = 15
  psychosis_flag: { phq9: zeros(9), gad7: zeros(7), pq16: fill(16, 1, 6) }, // PQ-16 = 6
  suicide_flag: { phq9: { ...zeros(9), "9": 1 }, gad7: zeros(7), pq16: zeros(16) },
};
type Level = keyof typeof RESPONSES;

const EXPECTED = {
  mild: { outcome: "steady", alertType: null },
  moderate: { outcome: "support", alertType: null },
  severe: { outcome: "priority_support", alertType: "severe" },
  psychosis_flag: { outcome: "priority_support", alertType: "psychosis" },
  suicide_flag: { outcome: "immediate_safety", alertType: "suicide" },
} as const;

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (doc: any) => ctx.db.insert("users", { status: "active", created_at: Date.now(), ...doc });
    return {
      admin: await user({ full_name: "Admin", role: "admin" }),
      counsellorA: await user({ full_name: "Counsellor A", role: "counsellor", mobile_number: "9000000001", email: "a.login@example.com" }),
      counsellorB: await user({ full_name: "Counsellor B", role: "counsellor" }),
      inactiveCounsellor: await user({ full_name: "Counsellor Gone", role: "counsellor", status: "inactive" }),
      assigned: await user({ full_name: "Assigned Student", role: "patient", patientId: "201" }),
      unassigned: await user({ full_name: "Unassigned Student", role: "patient", patientId: "202" }),
    };
  });
  const as = (id: string) => t.withIdentity({ subject: id });
  await as(ids.admin).mutation(api.counsellorAssignments.assign, { studentId: ids.assigned as any, counsellorId: ids.counsellorA as any });
  const rows = async () =>
    t.run(async (ctx) => ({
      attempts: await ctx.db.query("screeningAttempts").collect(),
      triages: await ctx.db.query("triages").collect(),
      alerts: await ctx.db.query("alerts").collect(),
      notifications: (await ctx.db.query("notifications").collect()).filter((n) => n.type === "critical_risk" || n.type === "safety_alert"),
      followUps: await ctx.db.query("followUps").collect(),
    }));
  return { t, ...ids, as, rows };
}

describe("each triage level: same backend records as before, calm outcome for the student", () => {
  for (const level of Object.keys(RESPONSES) as Level[]) {
    test(`${level}`, async () => {
      const { as, assigned, rows } = await setup();
      const res: any = await as(assigned).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES[level] });
      // The student response carries only the calm outcome: no level, flags, scores or ids.
      expect(res).toEqual({ status: "submitted", outcome: EXPECTED[level].outcome, replayed: false });

      const after = await rows();
      expect(after.attempts[0].triageLevel).toBe(level);
      expect(after.attempts).toHaveLength(1);
      expect(after.triages).toHaveLength(1);
      expect(after.followUps).toHaveLength(1);
      const expected = EXPECTED[level];
      expect(after.alerts.map((a) => a.type)).toEqual(expected.alertType ? [expected.alertType] : []);
      if (expected.alertType) {
        expect(after.alerts[0]).toMatchObject({ source: "screening", attemptId: after.attempts[0]._id, triageId: after.triages[0]._id, status: "pending" });
      }

      // Alerts and notifications exist before the student has looked at anything
      const before = JSON.stringify(after);
      const summary: any = await as(assigned).query(api.screening.getMyResultSummary, {});
      expect(summary).toEqual({ status: "ready", outcome: expected.outcome, completedAt: expect.any(Number) });
      // Reading the summary (any number of times) changes nothing
      await as(assigned).query(api.screening.getMyResultSummary, {});
      expect(JSON.stringify(await rows())).toBe(before);
    });
  }

  test("the levels used by the fixtures are exactly what the unchanged triage rules produce", () => {
    expect(evaluateClinicalTriage({ phq9Score: 12, item9Score: 0, gad7Score: 0, pq16Score: 0, pq16Administered: true }).level).toBe("moderate");
    expect(evaluateClinicalTriage({ phq9Score: 0, item9Score: 0, gad7Score: 15, pq16Score: 0, pq16Administered: true }).level).toBe("severe");
    expect(evaluateClinicalTriage({ phq9Score: 0, item9Score: 0, gad7Score: 0, pq16Score: 6, pq16Administered: true }).level).toBe("psychosis_flag");
    expect(evaluateClinicalTriage({ phq9Score: 1, item9Score: 1, gad7Score: 0, pq16Score: 0, pq16Administered: true }).level).toBe("suicide_flag");
  });
});

describe("the summary is independent of alerting and private", () => {
  test("an escalation alert still fires when the student-facing outcome is the low-concern one", async () => {
    const { as, assigned, rows } = await setup();
    await as(assigned).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES.mild });
    // PHQ-9 rises by 7 (still below the moderate threshold): triage stays mild, escalation alert fires
    await as(assigned).mutation(api.screening.submitScreeningAttempt, { responses: { phq9: fill(9, 1, 7), gad7: zeros(7), pq16: zeros(16) } });
    const { alerts } = await rows();
    expect(alerts.map((a) => a.type)).toEqual(["escalation"]);
    expect(((await as(assigned).query(api.screening.getMyResultSummary, {})) as any).outcome).toBe("steady");
  });

  test("the summary reflects the most recent completed check-in", async () => {
    const { as, assigned } = await setup();
    await as(assigned).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES.severe });
    await as(assigned).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES.moderate });
    expect(((await as(assigned).query(api.screening.getMyResultSummary, {})) as any).outcome).toBe("support");
  });

  test("no scores, ids, triage labels or staff details reach the student; no check-in means no outcome", async () => {
    const { t, as, assigned, unassigned, counsellorA } = await setup();
    expect(await as(unassigned).query(api.screening.getMyResultSummary, {})).toEqual({ status: "none" });
    expect(await t.query(api.screening.getMyResultSummary, {})).toEqual({ status: "unauthenticated" });

    await as(assigned).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES.suicide_flag });
    const res = await t.run(async (ctx) => (await ctx.db.query("screeningAttempts").collect())[0]);
    const summary = await as(assigned).query(api.screening.getMyResultSummary, {});
    expect(Object.keys(summary).sort()).toEqual(["completedAt", "outcome", "status"]);
    const text = JSON.stringify(summary);
    for (const secret of [String(res._id), String(res.triageId), "suicide", "flag", "score", "severity", "phq", counsellorA, "9000000001"]) {
      expect(text, secret).not.toContain(secret);
    }
  });

  test("a student only ever sees their own outcome", async () => {
    const { as, assigned, unassigned } = await setup();
    await as(assigned).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES.severe });
    await as(unassigned).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES.mild });
    expect(((await as(assigned).query(api.screening.getMyResultSummary, {})) as any).outcome).toBe("priority_support");
    expect(((await as(unassigned).query(api.screening.getMyResultSummary, {})) as any).outcome).toBe("steady");
    // Staff alert lists stay closed to students
    expect(await as(unassigned).query(api.dashboard.getAlerts, {})).toEqual([]);
  });
});

describe("alert recipients are unchanged", () => {
  const recipientsFor = (notes: any[]) => notes.map((n) => n.recipientId).sort();

  test("assigned student: the assigned counsellor and admins, with critical priority for suicide", async () => {
    const { as, assigned, rows, admin, counsellorA } = await setup();
    await as(assigned).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES.suicide_flag });
    const { notifications } = await rows();
    expect(recipientsFor(notifications)).toEqual([admin, counsellorA].sort());
    expect(notifications.every((n) => n.type === "critical_risk" && n.priority === "critical")).toBe(true);
  });

  test("unassigned student: every active counsellor and every admin; never a deactivated counsellor", async () => {
    const { as, unassigned, rows, admin, counsellorA, counsellorB, inactiveCounsellor } = await setup();
    await as(unassigned).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES.severe });
    const { notifications } = await rows();
    expect(recipientsFor(notifications)).toEqual([admin, counsellorA, counsellorB].sort());
    expect(recipientsFor(notifications)).not.toContain(inactiveCounsellor);
    expect(notifications.every((n) => n.type === "safety_alert" && n.priority === "high")).toBe(true);
  });

  test("a notification grants no access: a non-assigned counsellor cannot open the student's records", async () => {
    const { as, assigned, rows, counsellorB } = await setup();
    await as(assigned).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES.psychosis_flag });
    const { alerts } = await rows();
    await expect(as(counsellorB).query(api.screening.getAll, { userId: assigned })).rejects.toThrow(/not in your caseload/);
    await expect(as(counsellorB).query(api.alerts.getAlertProvenance, { alertId: alerts[0]._id })).rejects.toThrow(/not in your caseload|Unauthorized/);
  });

  test("reassignment keeps alert history and provenance; the new counsellor sees the existing alert", async () => {
    const { as, assigned, rows, admin, counsellorB } = await setup();
    await as(assigned).mutation(api.screening.submitScreeningAttempt, { responses: RESPONSES.suicide_flag });
    const before = await rows();
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: assigned as any, counsellorId: counsellorB as any });
    const after = await rows();
    expect(after.alerts).toEqual(before.alerts);
    expect(after.triages).toEqual(before.triages);
    expect(after.attempts).toEqual(before.attempts);
    const visible: any[] = await as(counsellorB).query(api.dashboard.getAlerts, {});
    expect(visible.map((a) => String(a._id))).toContain(String(before.alerts[0]._id));
  });
});
