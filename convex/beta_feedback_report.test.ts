/**
 * Beta test tooling: in-app feedback and the admin daily summary.
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import fs from "fs";
import path from "path";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { isBetaBuild } from "../common/beta";

const modules = import.meta.glob("./**/*.ts");
const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf-8");

// 2026-11-20 in India (UTC+5:30) runs from 2026-11-19T18:30Z to 2026-11-20T18:30Z.
const DAY = "2026-11-20";
const IST = -330;
const at = (iso: string) => vi.setSystemTime(new Date(iso));

afterEach(() => vi.useRealTimers());

async function setup() {
  vi.useFakeTimers({ toFake: ["Date"] });
  at("2026-11-18T10:00:00Z");
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (doc: any) => ctx.db.insert("users", { status: "active", created_at: Date.now(), ...doc });
    return {
      admin: await user({ full_name: "Admin", role: "admin" }),
      counsellor: await user({ full_name: "Counsellor", role: "counsellor" }),
      asha: await user({ full_name: "Asha", role: "patient", patientId: "501", clerkId: "legacy_asha" }),
      ravi: await user({ full_name: "Ravi", role: "patient", patientId: "502" }),
    };
  });
  const as = (id: string) => t.withIdentity({ subject: id });
  return { t, ...ids, as };
}

describe("beta feedback", () => {
  test("students send feedback; it is stored with category, screen and build", async () => {
    const { t, as, asha } = await setup();
    const res = await as(asha).mutation(api.betaFeedback.submit, { category: "bug", message: "  The check-in button did nothing.  ", screen: "Home", appVersion: "1.0.0", platform: "android" });
    expect(res).toEqual({ success: true, showCrisisResources: false });
    const rows = await t.run((ctx) => ctx.db.query("betaFeedback").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: asha, role: "patient", category: "bug", message: "The check-in button did nothing.", screen: "Home", flagged: false });
  });

  test("crisis language shows the crisis numbers and is flagged for the admin (no alert is created)", async () => {
    const { t, as, ravi } = await setup();
    const res = await as(ravi).mutation(api.betaFeedback.submit, { category: "other", message: "Honestly I want to die, nothing helps." });
    expect(res.showCrisisResources).toBe(true);
    const row = (await t.run((ctx) => ctx.db.query("betaFeedback").collect()))[0];
    expect(row.flagged).toBe(true);
    expect(await t.run((ctx) => ctx.db.query("alerts").collect())).toHaveLength(0);
  });

  test("validation, sign-in and rate limit", async () => {
    const { t, as, asha } = await setup();
    await expect(t.mutation(api.betaFeedback.submit, { category: "bug", message: "no session" })).rejects.toThrow(/Unauthenticated/);
    await expect(as(asha).mutation(api.betaFeedback.submit, { category: "bug", message: " a " })).rejects.toThrow(/write a little more/);
    await expect(as(asha).mutation(api.betaFeedback.submit, { category: "bug", message: "x".repeat(2001) })).rejects.toThrow(/under 2000/);
    await expect(as(asha).mutation(api.betaFeedback.submit, { category: "complaint" as any, message: "bad category" })).rejects.toThrow();
    for (let i = 0; i < 10; i++) await as(asha).mutation(api.betaFeedback.submit, { category: "idea", message: `idea number ${i}` });
    await expect(as(asha).mutation(api.betaFeedback.submit, { category: "idea", message: "one too many" })).rejects.toThrow(/Rate limit/);
  });

  test("only admins can read feedback", async () => {
    const { as, admin, counsellor, asha } = await setup();
    await as(asha).mutation(api.betaFeedback.submit, { category: "praise", message: "Breathing exercise was lovely." });
    const page = await as(admin).query(api.betaFeedback.listAll, { paginationOpts: { numItems: 10, cursor: null } });
    expect(page.page[0]).toMatchObject({ category: "praise", from: "Asha (Student 501)", flagged: false });
    await expect(as(counsellor).query(api.betaFeedback.listAll, { paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow(/Administrative/);
    await expect(as(asha).query(api.betaFeedback.listAll, { paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow(/Administrative/);
  });
});

describe("daily beta summary", () => {
  async function seeded() {
    const env = await setup();
    const { t, asha, ravi, admin } = env;
    const insert = (iso: string, table: string, doc: any) => {
      at(iso);
      const stamp = table === "aiTelemetryLogs" ? {} : { createdAt: Date.now() }; // telemetry uses `timestamp`
      return t.run((ctx) => ctx.db.insert(table as any, { ...stamp, ...doc }));
    };
    // Previous local day (19 Nov, 23:00 IST): must not count.
    await insert("2026-11-19T17:30:00Z", "dailyCheckins", { userId: asha, dateStr: "2026-11-19", mood: "low" });
    // The day itself.
    await insert("2026-11-20T03:00:00Z", "dailyCheckins", { userId: asha, dateStr: DAY, mood: "low" });
    await insert("2026-11-20T03:05:00Z", "companionMessages", { messageId: "m1", userId: "legacy_asha", role: "user", content: "secret words" });
    await insert("2026-11-20T03:05:01Z", "companionMessages", { messageId: "m2", userId: asha, role: "assistant", content: "reply" });
    await insert("2026-11-20T04:00:00Z", "breathingLogs", { userId: ravi, protocolId: "box_4444", protocolName: "Box", sourceType: "self_initiated", startedAt: Date.now(), durationSeconds: 60, cyclesCompleted: 4, targetCycles: 4, status: "completed" });
    // A MicroGoal created the day before but completed today counts today.
    const goal = await insert("2026-11-19T05:00:00Z", "microGoals", { userId: ravi, goalId: "water", goalTitle: "Water", goalDescription: "", category: "body", difficulty: "easy", points: 1, completed: false, skipped: false });
    at("2026-11-20T06:00:00Z");
    await t.run((ctx) => ctx.db.patch(goal as any, { completed: true, completedAt: Date.now() }));
    await insert("2026-11-20T07:00:00Z", "notifications", { recipientId: asha, type: "appointment_confirmed", title: "t", message: "m", priority: "medium", read: true, archived: false, pushStatus: "provider_accepted" });
    await insert("2026-11-20T07:01:00Z", "notifications", { recipientId: ravi, type: "counsellor_assigned", title: "t", message: "m", priority: "medium", read: false, archived: false, pushStatus: "failed", pushError: "receipt:InvalidCredentials" });
    await insert("2026-11-20T08:00:00Z", "alerts", { userId: asha, type: "suicideRisk", status: "active", externalDispatchStatus: "delivered" });
    await insert("2026-11-20T08:30:00Z", "aiTelemetryLogs", { userId: asha, timestamp: Date.now(), durationMs: 900, path: "fallback", mode: "chat", actionType: "none", avatarState: "calm", safetyCategory: "normal", geminiCalled: true, geminiSuccess: false, fallbackUsed: true, errorCode: "GEMINI_TIMEOUT" });
    await insert("2026-11-20T09:00:00Z", "betaFeedback", { userId: ravi, role: "patient", category: "bug", message: "Reminder came twice", flagged: false });
    await insert("2026-11-20T09:05:00Z", "betaFeedback", { userId: asha, role: "patient", category: "other", message: "flagged one", flagged: true });
    at("2026-11-21T10:00:00Z");
    return { ...env, admin };
  }

  test("counts each person's activity for the local day only", async () => {
    const { as, admin } = await seeded();
    const r = await as(admin).query(api.betaReport.getDailySummary, { date: DAY, tzOffsetMinutes: IST });
    expect(r.window).toMatchObject({ date: DAY, from: Date.parse("2026-11-19T18:30:00Z"), to: Date.parse("2026-11-20T18:30:00Z") });
    expect(r.activity.activeStudents).toBe(2);
    const asha = r.activity.users.find((u: any) => u.name === "Asha")!;
    // The legacy clerkId message is merged into the same person; assistant replies are not counted.
    expect(asha).toMatchObject({ label: "Student 501", activity: { checkIns: 1, companionMessages: 1, feedback: 1 } });
    const ravi = r.activity.users.find((u: any) => u.name === "Ravi")!;
    expect(ravi.activity).toEqual({ breathing: 1, microGoalsCompleted: 1, feedback: 1 });
    expect(r.activity.totals.checkIns).toBe(1);
  });

  test("reports errors, notification delivery, safety and feedback (flagged first)", async () => {
    const { as, admin } = await seeded();
    const r = await as(admin).query(api.betaReport.getDailySummary, { date: DAY, tzOffsetMinutes: IST });
    expect(r.errors.ai).toMatchObject({ requests: 1, geminiFailures: 1, fallbacks: 1, byErrorCode: { GEMINI_TIMEOUT: 1 } });
    expect(r.errors.pushFailures).toBe(1);
    expect(r.notifications).toMatchObject({ created: 2, read: 1, pushByStatus: { provider_accepted: 1, failed: 1 }, pushErrors: { "receipt:InvalidCredentials": 1 } });
    expect(r.safety).toMatchObject({ alertsCreated: 1, byType: { suicideRisk: 1 }, openAlertsNow: 1, emergencyContactDispatch: { delivered: 1 } });
    expect(r.feedback.map((f: any) => [f.flagged, f.message])).toEqual([
      [true, "flagged one"],
      [false, "Reminder came twice"],
    ]);
  });

  test("never includes what students wrote in the app (only feedback they sent to the test team)", async () => {
    const { as, admin } = await seeded();
    const r = await as(admin).query(api.betaReport.getDailySummary, { date: DAY, tzOffsetMinutes: IST });
    const json = JSON.stringify(r);
    expect(json).not.toContain("secret words");
    expect(json).not.toMatch(/"mood"|"low"/);
  });

  test("admins only on the dashboard; the deployment owner can run it from the CLI", async () => {
    const { t, as, counsellor, asha } = await seeded();
    await expect(as(counsellor).query(api.betaReport.getDailySummary, { date: DAY })).rejects.toThrow(/Administrative/);
    await expect(as(asha).query(api.betaReport.getDailySummary, { date: DAY })).rejects.toThrow(/Administrative/);
    const cli = await t.query(internal.betaReport.dailySummary, { date: DAY });
    expect(cli.activity.activeStudents).toBe(2);
    await expect(t.query(internal.betaReport.dailySummary, { date: "20-11-2026" })).rejects.toThrow(/Invalid date/);
  });
});

describe("beta labelling", () => {
  test("on unless the build sets EXPO_PUBLIC_BETA=false", () => {
    expect(isBetaBuild(undefined)).toBe(true);
    expect(isBetaBuild("true")).toBe(true);
    expect(isBetaBuild("false")).toBe(false);
    expect(isBetaBuild(" FALSE ")).toBe(false);
  });

  test("the notice is mounted at the root, shows the real crisis numbers, and is shown once", () => {
    expect(read("app/_layout.tsx")).toContain("<BetaNotice />");
    const notice = read("components/BetaNotice.tsx");
    expect(notice).toContain("CRISIS_RESOURCES.helplineNumber");
    expect(notice).toContain("CRISIS_RESOURCES.emergencyNumber");
    expect(notice).toContain("BETA_NOTICE_KEY");
    expect(read("app/(auth)/(tabs)/index.tsx")).toContain("<BetaBadge />");
    expect(read("app/(auth)/(tabs)/profile.tsx")).toContain('router.push("/(auth)/feedback"');
    const en = JSON.parse(read("i18n/locales/en.json"));
    for (const k of ["title", "testVersion", "whoSees", "notTherapy", "feedback", "crisisTitle", "accept"]) expect(en.beta.notice[k], k).toEqual(expect.any(String));
  });

  test("feedback is deleted with the account; the dashboard page is admin-only", () => {
    expect(read("convex/users.ts")).toContain('{ table: "betaFeedback", index: "by_userId", field: "userId" }');
    expect(read("dashboard/src/App.tsx")).toContain('<Route path="beta-report" element={<AdminRoute><BetaReport /></AdminRoute>} />');
  });
});
