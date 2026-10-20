/**
 * Notification system: persistent in-app notification centre (record of truth) and OS push
 * delivery (best effort, privacy-safe), including token lifecycle and safety-alert fan-out.
 * Push delivery is exercised in mock mode, and against a stubbed Expo push API for the live path.
 * Nothing here reaches a real device or the real Expo service.
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { PUSH_COPY, createNotification } from "./notify";
import { validatePrivacySafePushContent } from "./pushNotifications";
import {
  ALLOWED_NOTIFICATION_ROUTES,
  DASHBOARD_DESTINATION_ROUTES,
  MOBILE_DESTINATION_ROUTES,
  NOTIFICATION_DESTINATIONS,
  mobileRouteForPushData,
} from "../common/notificationRoutes";

const modules = import.meta.glob("./**/*.ts");
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const TOKEN_A = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";
const TOKEN_B = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]";
const zeros = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), 0]));
const SUICIDE = { phq9: { ...zeros(9), "9": 1 }, gad7: zeros(7), pq16: zeros(16) };

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
      admin: await user({ full_name: "Admin", role: "admin" }),
      counsellorA: await user({ full_name: "Counsellor A", role: "counsellor" }),
      counsellorB: await user({ full_name: "Counsellor B", role: "counsellor" }),
      counsellorGone: await user({ full_name: "Counsellor Gone", role: "counsellor", status: "inactive" }),
      studentA: await user({ full_name: "Student Alpha", role: "patient", patientId: "801" }),
      studentB: await user({ full_name: "Student Beta", role: "patient", patientId: "802" }),
      studentC: await user({ full_name: "Student Gamma", role: "patient", patientId: "803" }),
    };
  });
  const as = (id: string) => t.withIdentity({ subject: id });
  await as(ids.admin).mutation(api.counsellorAssignments.assign, { studentId: ids.studentA as any, counsellorId: ids.counsellorA as any });
  const rows = () => t.run(async (ctx) => ctx.db.query("notifications").collect());
  const request = (student: string, extra: any = {}) =>
    as(student).mutation(api.appointments.createAppointmentRequest, { title: "Check-in", userId: student as any, createdBy: "user", date: day(3), time: "10:00 AM", reason: "Talk", ...extra });
  const runScheduled = async () => {
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  };
  return { t, ...ids, as, rows, request, runScheduled };
}

describe("in-app notification centre", () => {
  test("users list, count and mark only their own notifications", async () => {
    const { as, t, studentA, studentB, counsellorA, request } = await setup();
    await request(studentA);
    const mine = await as(studentA).query(api.notificationCenter.listMine, { paginationOpts: { numItems: 50, cursor: null } });
    expect(mine.page.map((n: any) => n.type).sort()).toEqual(["appointment_requested", "counsellor_assigned"].sort());
    for (const n of mine.page) expect(Object.keys(n).sort()).toEqual(["_id", "createdAt", "destination", "message", "priority", "read", "title", "type"]);
    expect((await as(studentB).query(api.notificationCenter.listMine, { paginationOpts: { numItems: 50, cursor: null } })).page).toHaveLength(0);
    expect(await as(studentA).query(api.notificationCenter.unreadCount, {})).toEqual({ count: 2, capped: false });

    // Another user's notification cannot be read, marked or opened (same error as "missing").
    const counsellorNote = (await as(counsellorA).query(api.notificationCenter.listMine, { paginationOpts: { numItems: 50, cursor: null } })).page[0];
    await expect(as(studentA).mutation(api.notificationCenter.markRead, { notificationId: counsellorNote._id })).rejects.toThrow(/Notification not found/);
    await expect(as(studentA).mutation(api.notificationCenter.openNotification, { notificationId: counsellorNote._id })).rejects.toThrow(/Notification not found/);
    await expect(t.mutation(api.notificationCenter.markRead, { notificationId: counsellorNote._id })).rejects.toThrow(/Unauthenticated/);
    expect((await t.query(api.notificationCenter.listMine, { paginationOpts: { numItems: 5, cursor: null } })).page).toEqual([]);

    // Mark read is idempotent; mark-all clears the rest.
    await as(studentA).mutation(api.notificationCenter.markRead, { notificationId: mine.page[0]._id });
    await as(studentA).mutation(api.notificationCenter.markRead, { notificationId: mine.page[0]._id });
    expect((await as(studentA).query(api.notificationCenter.unreadCount, {})).count).toBe(1);
    expect(await as(studentA).mutation(api.notificationCenter.markAllRead, {})).toEqual({ updated: 1, remaining: false });
    expect((await as(studentA).query(api.notificationCenter.unreadCount, {})).count).toBe(0);
    const readRow = await t.run(async (ctx) => ctx.db.get(mine.page[0]._id));
    expect(readRow?.readAt).toEqual(expect.any(Number));
  });

  test("the unread badge is capped and mark-all works in batches", async () => {
    const { t, as, studentC } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 230; i++) await createNotification(ctx, { recipientId: studentC, type: "appointment_completed", title: `n${i}`, message: "m" });
    });
    expect(await as(studentC).query(api.notificationCenter.unreadCount, {})).toEqual({ count: 99, capped: true });
    expect(await as(studentC).mutation(api.notificationCenter.markAllRead, {})).toEqual({ updated: 200, remaining: true });
    expect(await as(studentC).mutation(api.notificationCenter.markAllRead, {})).toEqual({ updated: 30, remaining: false });
  });

  test("opening re-checks access: a reassigned counsellor is sent to the notification centre", async () => {
    const { as, admin, studentA, counsellorA, counsellorB, request } = await setup();
    await request(studentA);
    const note = (await as(counsellorA).query(api.notificationCenter.listMine, { paginationOpts: { numItems: 50, cursor: null } })).page.find((n: any) => n.type === "appointment_request_received")!;
    expect(await as(counsellorA).mutation(api.notificationCenter.openNotification, { notificationId: note._id })).toEqual({ destination: "appointments" });
    await as(admin).mutation(api.counsellorAssignments.assign, { studentId: studentA as any, counsellorId: counsellorB as any });
    expect(await as(counsellorA).mutation(api.notificationCenter.openNotification, { notificationId: note._id })).toEqual({ destination: "notifications" });
    const studentNote = (await as(studentA).query(api.notificationCenter.listMine, { paginationOpts: { numItems: 50, cursor: null } })).page.find((n: any) => n.type === "appointment_requested")!;
    expect(await as(studentA).mutation(api.notificationCenter.openNotification, { notificationId: studentNote._id })).toEqual({ destination: "appointments" });
  });

  test("a staff-only destination never opens for a student", async () => {
    const { t, as, studentC } = await setup();
    const id = await t.run(async (ctx) => (await createNotification(ctx, { recipientId: studentC, type: "safety_alert", title: "x", message: "y", destination: "alerts" })).id);
    expect(await as(studentC).mutation(api.notificationCenter.openNotification, { notificationId: id })).toEqual({ destination: "notifications" });
  });

  test("repeated processing of one event creates one notification", async () => {
    const { t, studentC } = await setup();
    await t.run(async (ctx) => {
      const first = await createNotification(ctx, { recipientId: studentC, type: "appointment_confirmed", title: "x", message: "y", dedupeKey: "evt-1" });
      const second = await createNotification(ctx, { recipientId: studentC, type: "appointment_confirmed", title: "x", message: "y", dedupeKey: "evt-1" });
      expect(second).toEqual({ id: first.id, created: false });
    });
    expect((await t.run(async (ctx) => ctx.db.query("notifications").collect())).filter((n) => n.dedupeKey === "evt-1")).toHaveLength(1);
  });
});

describe("OS push delivery", () => {
  test("lock-screen copy is neutral for every pushed type and uses a known channel", () => {
    for (const [type, copy] of Object.entries(PUSH_COPY)) {
      if (!copy) continue;
      expect(validatePrivacySafePushContent(copy.title, copy.body), type).toBe(true);
      expect(copy.body, type).not.toMatch(/\d|counsell?or [A-Z]|Student [0-9]|screen|score|alert/i);
      expect(["default", "appointments", "important"]).toContain(copy.channelId);
    }
  });

  test("the in-app record is written first and push is delivered to the recipient's devices (mock mode)", async () => {
    vi.useFakeTimers();
    const { as, studentA, counsellorA, rows, request, runScheduled } = await setup();
    await as(studentA).mutation(api.pushTokens.registerPushToken, { token: TOKEN_A, platform: "android" });
    const id = await request(studentA);
    await as(counsellorA).mutation(api.appointments.updateAppointmentStatus, { appointmentId: id, status: "accepted" });
    const confirmed = (await rows()).find((n) => n.type === "appointment_confirmed")!;
    expect(confirmed.pushStatus).toBe("queued");
    await runScheduled();
    const after = (await rows()).find((n) => n.type === "appointment_confirmed")!;
    expect(after.pushStatus).toBe("mock");
    // The counsellor has no device registered: in-app only, recorded as such.
    expect((await rows()).find((n) => n.type === "appointment_request_received")!.pushStatus).toBe("no_tokens");
    // In-app-only types are never queued for push.
    expect((await rows()).find((n) => n.type === "appointment_requested")!.pushStatus).toBeUndefined();
  });

  test("live path: privacy-safe payload, invalid tokens pruned, outcome recorded (stubbed Expo API)", async () => {
    vi.useFakeTimers();
    process.env.EXPO_PUSH_LIVE = "stubbed-fetch";
    const sent: any[] = [];
    vi.stubGlobal("fetch", async (url: string, init: any) => {
      if (url.endsWith("/push/send")) {
        const messages = JSON.parse(init.body);
        sent.push(...messages);
        return new Response(JSON.stringify({ data: messages.map((m: any) => (m.to === TOKEN_B ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: "ticket-1" })) }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { "ticket-1": { status: "ok" } } }), { status: 200 });
    });
    const { t, as, studentA, counsellorA, rows, request, runScheduled } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("pushTokens", { userId: studentA, token: TOKEN_A, platform: "android", updatedAt: Date.now() });
      await ctx.db.insert("pushTokens", { userId: studentA, token: TOKEN_B, platform: "android", updatedAt: Date.now() });
    });
    const id = await request(studentA);
    await as(counsellorA).mutation(api.appointments.updateAppointmentStatus, { appointmentId: id, status: "accepted" });
    await runScheduled();

    // Every message to the student's devices (assignment + confirmation) is privacy-safe.
    const toStudent = sent.filter((m) => m.to === TOKEN_A || m.to === TOKEN_B);
    for (const m of toStudent) {
      expect(m.title).toBe("Emotify");
      expect(Object.keys(m.data).sort()).toEqual(["destination", "notificationId", "route"]);
      expect(ALLOWED_NOTIFICATION_ROUTES.has(m.data.route)).toBe(true);
      expect(JSON.stringify(m)).not.toMatch(/Alpha|Counsellor A|Check-in|Talk|10:00|80[0-9]/);
    }
    const confirmation = toStudent.filter((m) => m.body === "Your appointment status has changed.");
    expect(confirmation.map((m) => m.to).sort()).toEqual([TOKEN_A, TOKEN_B].sort());
    expect(confirmation.every((m) => m.channelId === "appointments" && m.data.destination === "appointments")).toBe(true);
    const tokens = await t.run(async (ctx) => (await ctx.db.query("pushTokens").collect()).map((r) => r.token));
    expect(tokens).toEqual([TOKEN_A]);
    const confirmed = (await rows()).find((n) => n.type === "appointment_confirmed")!;
    expect(confirmed).toMatchObject({ pushStatus: "sent", pushTicketIds: ["ticket-1"] });
  });

  test("provider failure keeps the in-app notification and records the error", async () => {
    vi.useFakeTimers();
    process.env.EXPO_PUSH_LIVE = "stubbed-fetch";
    vi.stubGlobal("fetch", async () => new Response("unavailable", { status: 503 }));
    const { as, studentA, counsellorA, rows, request, runScheduled } = await setup();
    await as(studentA).mutation(api.pushTokens.registerPushToken, { token: TOKEN_A, platform: "android" });
    const id = await request(studentA);
    await as(counsellorA).mutation(api.appointments.updateAppointmentStatus, { appointmentId: id, status: "accepted" });
    await runScheduled();
    const note = (await rows()).find((n) => n.type === "appointment_confirmed")!;
    expect(note).toMatchObject({ pushStatus: "failed", pushError: "Expo push HTTP 503", read: false });
  });

  test("no push to deactivated accounts", async () => {
    vi.useFakeTimers();
    const { t, as, admin, studentA, counsellorA, rows, request, runScheduled } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("pushTokens", { userId: counsellorA, token: TOKEN_B, platform: "android", updatedAt: Date.now() });
    });
    await request(studentA);
    await as(admin).mutation(api.users.toggleUserStatus, { userId: counsellorA as any, status: "inactive" });
    await runScheduled();
    expect((await rows()).find((n) => n.type === "appointment_request_received")!).toMatchObject({ pushStatus: "skipped", pushError: "recipient_inactive" });
  });

  test("a scheduled delivery runs once even if invoked again", async () => {
    vi.useFakeTimers();
    const { t, as, studentA, rows, request, runScheduled } = await setup();
    await as(studentA).mutation(api.pushTokens.registerPushToken, { token: TOKEN_A, platform: "android" });
    await request(studentA);
    await runScheduled();
    const note = (await rows()).find((n) => n.type === "appointment_request_received")!;
    const again = await t.action(internal.pushNotifications.deliverNotification, { notificationId: note._id });
    expect(again).toEqual({ status: "skipped" });
  });
});

describe("device token lifecycle", () => {
  test("a token belongs to the last account that signed in on the device", async () => {
    const { t, as, studentA, studentB } = await setup();
    await as(studentA).mutation(api.pushTokens.registerPushToken, { token: TOKEN_A, platform: "android" });
    await as(studentB).mutation(api.pushTokens.registerPushToken, { token: TOKEN_A, platform: "android" });
    const owners = await t.run(async (ctx) => (await ctx.db.query("pushTokens").collect()).map((r) => r.userId));
    expect(owners).toEqual([studentB]);
    // Removal is scoped to the caller's own tokens.
    expect(await as(studentA).mutation(api.pushTokens.removePushToken, { token: TOKEN_A })).toEqual({ status: "not_found" });
    expect(await as(studentB).mutation(api.pushTokens.removePushToken, { token: TOKEN_A })).toEqual({ status: "removed" });
    await expect(t.mutation(api.pushTokens.registerPushToken, { token: TOKEN_A, platform: "android" })).rejects.toThrow(/Unauthenticated/);
    await expect(as(studentA).mutation(api.pushTokens.registerPushToken, { token: "not-a-token", platform: "android" })).rejects.toThrow(/Invalid push token/);
  });

  test("deleting an account removes its device tokens", async () => {
    const { t, as, admin, studentB } = await setup();
    await as(studentB).mutation(api.pushTokens.registerPushToken, { token: TOKEN_B, platform: "android" });
    await as(admin).mutation(api.users.deleteUser, { userId: studentB as any });
    await t.finishAllScheduledFunctions(() => {});
    expect(await t.run(async (ctx) => ctx.db.query("pushTokens").collect())).toHaveLength(0);
  });
});

describe("safety alerts", () => {
  test("unassigned student: every active counsellor and admin is notified (in-app + push), never the inactive one", async () => {
    vi.useFakeTimers();
    const { as, admin, counsellorA, counsellorB, counsellorGone, studentC, rows, runScheduled } = await setup();
    await as(studentC).mutation(api.screening.submitScreeningAttempt, { responses: SUICIDE });
    const critical = (await rows()).filter((n) => n.type === "critical_risk");
    expect(critical.map((n) => n.recipientId).sort()).toEqual([admin, counsellorA, counsellorB].sort());
    expect(critical.map((n) => n.recipientId)).not.toContain(counsellorGone);
    for (const n of critical) {
      expect(n).toMatchObject({ destination: "alerts", pushStatus: "queued", priority: "critical" });
      expect(n.message).not.toMatch(/Gamma/);
    }
    // Notification is not access: an unassigned counsellor still cannot open the student's records.
    await expect(as(counsellorB).query(api.screening.getAll, { userId: studentC })).rejects.toThrow(/not in your caseload/);
    const note = critical.find((n) => n.recipientId === counsellorB)!;
    expect(await as(counsellorB).mutation(api.notificationCenter.openNotification, { notificationId: note._id })).toEqual({ destination: "alerts" });
    await runScheduled();
    expect((await rows()).filter((n) => n.type === "critical_risk").every((n) => n.pushStatus === "no_tokens")).toBe(true);
  });

  test("assigned student: the assigned counsellor and admins only", async () => {
    const { as, admin, counsellorA, studentA, rows } = await setup();
    await as(studentA).mutation(api.screening.submitScreeningAttempt, { responses: SUICIDE });
    expect((await rows()).filter((n) => n.type === "critical_risk").map((n) => n.recipientId).sort()).toEqual([admin, counsellorA].sort());
  });

  test("a repeated urgent request from the crisis screen re-alerts staff, at most once an hour", async () => {
    const { as, admin, counsellorA, studentA, rows } = await setup();
    const first: any = await as(studentA).mutation(api.counsellorRequests.create, { sourceType: "emergency_modal", situation_text: "now", returnOutcome: true });
    expect(first).toMatchObject({ deduplicated: false, deliveryStatus: "notified" });
    const again: any = await as(studentA).mutation(api.counsellorRequests.create, { sourceType: "emergency_modal", situation_text: "now", returnOutcome: true });
    expect(again).toMatchObject({ deduplicated: true, deliveryStatus: "notified", notifiedStaffCount: 2 });
    await as(studentA).mutation(api.counsellorRequests.create, { sourceType: "emergency_modal", situation_text: "now", returnOutcome: true });
    const requests = (await rows()).filter((n) => n.type === "counsellor_request");
    expect(requests.map((n) => n.recipientId).sort()).toEqual([admin, admin, counsellorA, counsellorA].sort());
    expect(requests.every((n) => n.priority === "critical" && !/Alpha/.test(n.message))).toBe(true);
  });
});

describe("destinations", () => {
  test("every destination maps to an allowlisted mobile route and a dashboard path", () => {
    for (const d of NOTIFICATION_DESTINATIONS) {
      expect(ALLOWED_NOTIFICATION_ROUTES.has(MOBILE_DESTINATION_ROUTES[d]), d).toBe(true);
      expect(DASHBOARD_DESTINATION_ROUTES[d].startsWith("/"), d).toBe(true);
    }
    expect(mobileRouteForPushData({ destination: "appointments" })).toBe("/(auth)/tools/appointments");
    expect(mobileRouteForPushData({ route: "/(auth)/screening" })).toBe("/(auth)/screening");
    for (const bad of [{ destination: "admin" }, { route: "https://evil.example" }, { route: "/(auth)/../../x" }, null, "x", { destination: 3 }]) {
      expect(mobileRouteForPushData(bad)).toBeNull();
    }
  });
});
