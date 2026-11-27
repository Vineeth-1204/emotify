/**
 * Device registration lifecycle and the notification fixes from the push audit:
 * - registration is an idempotent upsert, recorded as an event; failures reported by the device
 *   and tokens invalidated by the provider are visible (status, Beta report, diagnosePush);
 * - a student can send themselves a test push and see its result;
 * - the afternoon MicroGoal engagement notification is pushed (it had no push copy);
 * - the engagement scheduler reaches students beyond the first 100 accounts;
 * - students get their companion avatar as the large icon; staff get none.
 * Expo is stubbed; nothing reaches a real device.
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { PUSH_COPY } from "./notify";
import { notificationAvatarUrl } from "./pushNotifications";

const modules = import.meta.glob("./**/*.ts");
const TOKEN = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";
const TOKEN_2 = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.EXPO_PUSH_LIVE;
});

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (doc: any) => ctx.db.insert("users", { status: "active", created_at: Date.now(), ...doc });
    return {
      student: await user({ full_name: "Asha", role: "patient", patientId: "601", mitraPreferences: { name: "Emoty", avatarGender: "male" } }),
      other: await user({ full_name: "Ravi", role: "patient", patientId: "602" }),
      counsellor: await user({ full_name: "Counsellor", role: "counsellor" }),
      admin: await user({ full_name: "Admin", role: "admin" }),
    };
  });
  const as = (id: string) => t.withIdentity({ subject: id });
  const tokens = () => t.run((ctx) => ctx.db.query("pushTokens").collect());
  const events = () => t.run((ctx) => ctx.db.query("pushRegistrationEvents").collect());
  return { t, ...ids, as, tokens, events };
}

describe("device registration", () => {
  test("registering is an idempotent upsert against the signed-in student, recorded as an event", async () => {
    const { as, student, tokens, events } = await setup();
    await as(student).mutation(api.pushTokens.registerPushToken, { token: TOKEN, platform: "android", appVersion: "1.0.0" });
    await as(student).mutation(api.pushTokens.registerPushToken, { token: TOKEN, platform: "android", appVersion: "1.0.1" });
    const rows = await tokens();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: student, token: TOKEN, platform: "android", appVersion: "1.0.1" });
    const ev = await events();
    expect(ev.filter((e) => e.stage === "registered" && e.status === "ok")).toHaveLength(1); // deduplicated within 10 min
  });

  test("account switch on a shared phone moves the token; logout removes it", async () => {
    const { as, student, other, tokens } = await setup();
    await as(student).mutation(api.pushTokens.registerPushToken, { token: TOKEN, platform: "android" });
    await as(other).mutation(api.pushTokens.registerPushToken, { token: TOKEN, platform: "android" });
    expect((await tokens()).map((r) => r.userId)).toEqual([other]);
    await as(other).mutation(api.pushTokens.removePushToken, { token: TOKEN });
    expect(await tokens()).toHaveLength(0);
  });

  test("devices report failed steps; repeats are deduplicated and tokens never stored", async () => {
    const { as, t, student, events } = await setup();
    const report = (errorCode?: string) =>
      as(student).mutation(api.pushTokens.reportRegistration, { stage: "token", status: "error", errorCode, permission: "granted", platform: "android" });
    await report(`Default FirebaseApp is not initialized ${TOKEN}`);
    await report(`Default FirebaseApp is not initialized ${TOKEN}`);
    const ev = await events();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ userId: student, stage: "token", status: "error" });
    expect(ev[0].errorCode).toContain("Default FirebaseApp is not initialized");
    expect(JSON.stringify(ev)).not.toContain("aaaaaaaa");
    expect(await t.mutation(api.pushTokens.reportRegistration, { stage: "token", status: "error" })).toEqual({ recorded: false });
  });

  test("a token the provider rejects as DeviceNotRegistered is removed and recorded", async () => {
    const { t, student, tokens, events } = await setup();
    await t.run((ctx) => ctx.db.insert("pushTokens", { userId: student, token: TOKEN, platform: "android", updatedAt: Date.now() }));
    await t.mutation(internal.pushTokens.deleteToken, { token: TOKEN });
    expect(await tokens()).toHaveLength(0);
    expect((await events())[0]).toMatchObject({ userId: student, stage: "invalidated", errorCode: "DeviceNotRegistered" });
  });

  test("students see only their own status, without tokens", async () => {
    const { as, student, other } = await setup();
    await as(student).mutation(api.pushTokens.registerPushToken, { token: TOKEN, platform: "android" });
    const mine: any = await as(student).query(api.pushTokens.getMyPushStatus, {});
    expect(mine).toMatchObject({ deviceCount: 1, lastEvent: { stage: "registered", status: "ok" } });
    expect(JSON.stringify(mine)).not.toContain("aaaa");
    expect(await as(other).query(api.pushTokens.getMyPushStatus, {})).toMatchObject({ deviceCount: 0, lastEvent: null });
  });
});

describe("self test push", () => {
  test("goes only to the caller's devices through the normal pipeline, with the result visible", async () => {
    vi.useFakeTimers();
    process.env.EXPO_PUSH_LIVE = "stubbed-fetch";
    const sent: any[] = [];
    vi.stubGlobal("fetch", async (url: string, init: any) => {
      if (url.endsWith("/push/send")) {
        const messages = JSON.parse(init.body);
        sent.push(...messages);
        return new Response(JSON.stringify({ data: messages.map(() => ({ status: "ok", id: "ticket-1" })) }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { "ticket-1": { status: "ok" } } }), { status: 200 });
    });
    const { t, as, student, other } = await setup();
    await as(student).mutation(api.pushTokens.registerPushToken, { token: TOKEN, platform: "android" });
    await as(other).mutation(api.pushTokens.registerPushToken, { token: TOKEN_2, platform: "android" });
    await as(student).mutation(api.pushNotifications.sendMyTestNotification, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(sent.map((m) => m.to)).toEqual([TOKEN]);
    expect(sent[0]).toMatchObject({ title: "Emotify notification test", channelId: "default" });
    expect(sent[0].richContent.image).toMatch(/\/api\/avatar\/boy\.jpg$/);
    const status: any = await as(student).query(api.pushTokens.getMyPushStatus, {});
    expect(status.lastTest).toMatchObject({ pushStatus: "provider_accepted" });
  });

  test("requires sign-in and is rate-limited", async () => {
    const { t, as, student } = await setup();
    await expect(t.mutation(api.pushNotifications.sendMyTestNotification, {})).rejects.toThrow(/Unauthenticated/);
    for (let i = 0; i < 5; i++) await as(student).mutation(api.pushNotifications.sendMyTestNotification, {});
    await expect(as(student).mutation(api.pushNotifications.sendMyTestNotification, {})).rejects.toThrow(/Rate limit/);
  });
});

describe("scheduled notifications", () => {
  test("the afternoon MicroGoal engagement notification now has push copy", () => {
    expect(PUSH_COPY.engagement_afternoon).toEqual(PUSH_COPY.engagement_microgoal);
    for (const type of ["engagement_morning", "engagement_afternoon", "engagement_evening", "engagement_night", "routine_morning", "routine_evening", "microgoal_reminder"]) {
      expect(PUSH_COPY[type], type).toBeTruthy();
    }
  });

  test("the scheduler reaches students who joined after the first 100 accounts, and queues their push", async () => {
    const { t } = await setup();
    const late = await t.run(async (ctx) => {
      for (let i = 0; i < 120; i++) await ctx.db.insert("users", { full_name: `Staff ${i}`, role: "counsellor", status: "active", created_at: Date.now() });
      const s = await ctx.db.insert("users", { full_name: "Late Student", role: "patient", patientId: "999", status: "active", created_at: Date.now() });
      await ctx.db.insert("microGoals", { userId: s, goalId: "water", goalTitle: "Water", goalDescription: "", category: "body", difficulty: "easy", points: 1, completed: false, skipped: false, createdAt: Date.now() });
      return s;
    });
    // 14:00 in India: the afternoon (MicroGoal) window.
    const afternoon = Date.parse("2026-11-27T08:30:00Z");
    await t.mutation(internal.engagementScheduler.evaluateAllEligibleStudents, { nowMs: afternoon });
    const note = (await t.run((ctx) => ctx.db.query("notifications").collect())).find((n) => n.recipientId === String(late));
    expect(note).toMatchObject({ type: "engagement_afternoon", pushStatus: "queued" });
  });
});

describe("avatar large icon", () => {
  test("students get their companion (default companion if none chosen); staff and unknown users get none", () => {
    expect(notificationAvatarUrl("patient", "male")).toMatch(/\/api\/avatar\/boy\.jpg$/);
    expect(notificationAvatarUrl(undefined, "female")).toMatch(/\/api\/avatar\/girl\.jpg$/);
    expect(notificationAvatarUrl("patient", null)).toMatch(/\/api\/avatar\/girl\.jpg$/);
    expect(notificationAvatarUrl("counsellor", "male")).toBeNull();
    expect(notificationAvatarUrl("admin", null)).toBeNull();
  });
});

describe("visibility for the admin", () => {
  test("the Beta report and diagnosePush show who has no phone registered and why", async () => {
    const { t, as, student, other, admin } = await setup();
    await as(student).mutation(api.pushTokens.registerPushToken, { token: TOKEN, platform: "android" });
    await as(other).mutation(api.pushTokens.reportRegistration, { stage: "permission", status: "denied", permission: "denied", platform: "android" });
    const report: any = await as(admin).query(api.betaReport.getDailySummary, {});
    expect(report.pushRegistration).toMatchObject({ students: 2, studentsWithDevice: 1, registeredToday: 1 });
    expect(report.pushRegistration.studentsWithoutDevice.map((s: any) => s.name)).toEqual(["Ravi"]);
    expect(report.pushRegistration.problemsToday).toEqual({ "permission: denied": 1 });
    await t.run(async (ctx) => {
      await ctx.db.insert("notifications", { recipientId: String(other), type: "routine_evening", title: "t", message: "m", priority: "low", read: false, archived: false, createdAt: Date.now(), pushStatus: "no_tokens" });
    });
    const diag: any = await t.query(internal.pushNotifications.diagnosePush, { userId: other as any });
    expect(diag.recipients[0].registrationEvents[0]).toMatchObject({ stage: "permission", status: "denied" });
  });
});
