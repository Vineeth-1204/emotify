/**
 * Reported issue: an admin creates an appointment for a student; the in-app notification appears
 * but the Android tray shows nothing. These tests follow that exact path (admin proposal ->
 * appointment_proposed -> scheduled delivery -> Expo ticket -> Expo receipt) and check that every
 * stage that can stop a push leaves evidence on the notification row and in diagnosePush.
 * The Expo API is stubbed; nothing reaches a real device or the real Expo service.
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { isLivePushEnabled } from "./pushNotifications";

const modules = import.meta.glob("./**/*.ts");
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const TOKEN = "ExponentPushToken[abcdefghijklmnopqrstuv]";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.EXPO_PUSH_LIVE;
});

async function setup({ registerDevice = true } = {}) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (doc: any) => ctx.db.insert("users", { status: "active", created_at: Date.now(), ...doc });
    return {
      admin: await user({ full_name: "Admin", role: "admin" }),
      student: await user({ full_name: "Student Delta", role: "patient", patientId: "901" }),
      other: await user({ full_name: "Student Echo", role: "patient", patientId: "902" }),
    };
  });
  const as = (id: string) => t.withIdentity({ subject: id });
  if (registerDevice) await as(ids.student).mutation(api.pushTokens.registerPushToken, { token: TOKEN, platform: "android" });
  /** What the dashboard does when an admin creates an appointment for a student. */
  const adminCreatesAppointment = () =>
    as(ids.admin).mutation(api.appointments.createAppointmentRequest, {
      title: "Check-in",
      userId: ids.student as any,
      createdBy: "admin",
      patientName: "Student Delta",
      date: day(3),
      time: "11:00 AM",
      reason: "Follow-up",
    });
  const proposal = async () =>
    (await t.run(async (ctx) => ctx.db.query("notifications").collect())).find((n) => n.type === "appointment_proposed")!;
  const diagnose = () => t.query(internal.pushNotifications.diagnosePush, { userId: ids.student as any });
  const runScheduled = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  return { t, ...ids, as, adminCreatesAppointment, proposal, diagnose, runScheduled };
}

function stubExpo(receipt: Record<string, unknown> = { status: "ok" }, ticket: Record<string, unknown> = { status: "ok", id: "ticket-1" }) {
  const sent: any[] = [];
  vi.stubGlobal("fetch", async (url: string, init: any) => {
    if (url.endsWith("/push/send")) {
      const messages = JSON.parse(init.body);
      sent.push(...messages);
      return new Response(JSON.stringify({ data: messages.map(() => ticket) }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: { "ticket-1": receipt } }), { status: 200 });
  });
  return sent;
}

describe("admin-created appointment -> student's phone", () => {
  test("the event creates the in-app record and queues a push for the student only", async () => {
    vi.useFakeTimers();
    const { student, adminCreatesAppointment, proposal } = await setup();
    await adminCreatesAppointment();
    const note = await proposal();
    expect(note).toMatchObject({ recipientId: student, pushStatus: "queued", destination: "appointments", read: false });
  });

  test("live push disabled: nothing is sent, and the row and diagnostic say why", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { adminCreatesAppointment, proposal, diagnose, runScheduled } = await setup();
    await adminCreatesAppointment();
    await runScheduled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await proposal()).toMatchObject({ pushStatus: "mock", pushError: "live_push_disabled" });

    const report: any = await diagnose();
    expect(report.deployment).toEqual({ livePushEnabled: false, expoPushLiveSet: false, expoAccessTokenSet: false });
    expect(report.notifications[0]).toMatchObject({ type: "appointment_proposed", pushStatus: "mock" });
    expect(report.notifications[0].stage).toMatch(/^5 live push disabled/);
    // The device is listed without its usable token.
    expect(report.recipients[0].devices).toEqual([{ platform: "android", token: "ExponentPushToken[…stuv]", registeredAt: expect.any(String) }]);
    expect(JSON.stringify(report)).not.toContain(TOKEN);
    expect(JSON.stringify(report)).not.toMatch(/Check-in|Follow-up|Delta/);
  });

  test("live: Expo receives a neutral, high-priority message on the appointments channel; FCM acceptance is recorded", async () => {
    vi.useFakeTimers();
    process.env.EXPO_PUSH_LIVE = "stubbed-fetch";
    const sent = stubExpo();
    const { adminCreatesAppointment, proposal, diagnose, runScheduled } = await setup();
    await adminCreatesAppointment();
    await runScheduled(); // includes the receipt check 15 minutes later

    const toPhone = sent.filter((m) => m.body === "You have a new appointment request.");
    expect(toPhone).toHaveLength(1);
    expect(toPhone[0]).toMatchObject({ to: TOKEN, title: "Emotify", channelId: "appointments", priority: "high", sound: "default" });
    expect(toPhone[0].data).toMatchObject({ destination: "appointments", route: "/(auth)/tools/appointments" });
    expect(JSON.stringify(toPhone[0])).not.toMatch(/Check-in|Follow-up|11:00|Delta/);

    expect(await proposal()).toMatchObject({ pushStatus: "provider_accepted", pushTicketIds: ["ticket-1"] });
    const report: any = await diagnose();
    expect(report.notifications[0].stage).toMatch(/^7 accepted by FCM/);
  });

  test("FCM rejection reported in the Expo receipt is recorded with its error code", async () => {
    vi.useFakeTimers();
    process.env.EXPO_PUSH_LIVE = "stubbed-fetch";
    stubExpo({ status: "error", message: "Unable to retrieve the FCM server key", details: { error: "InvalidCredentials" } });
    const { adminCreatesAppointment, proposal, diagnose, runScheduled } = await setup();
    await adminCreatesAppointment();
    await runScheduled();
    expect(await proposal()).toMatchObject({ pushStatus: "failed", pushError: "receipt:InvalidCredentials" });
    expect((await diagnose() as any).notifications[0].stage).toMatch(/^7 rejected by FCM\/APNs.*InvalidCredentials/);
  });

  test("an Expo ticket error is recorded without the push token", async () => {
    vi.useFakeTimers();
    process.env.EXPO_PUSH_LIVE = "stubbed-fetch";
    stubExpo(undefined, { status: "error", message: `"${TOKEN}" is not a registered push notification recipient` });
    const { adminCreatesAppointment, proposal, runScheduled } = await setup();
    await adminCreatesAppointment();
    await runScheduled();
    const note = await proposal();
    expect(note.pushStatus).toBe("failed");
    expect(note.pushError).toBe('ticket:"[token]" is not a registered push notification recipient');
  });

  test("no registered device: recorded as no_tokens, and only the student's own devices are ever used", async () => {
    vi.useFakeTimers();
    process.env.EXPO_PUSH_LIVE = "stubbed-fetch";
    const sent = stubExpo();
    const { t, other, adminCreatesAppointment, proposal, diagnose, runScheduled } = await setup({ registerDevice: false });
    // Another student's phone must never receive this student's notification.
    await t.run(async (ctx) => {
      await ctx.db.insert("pushTokens", { userId: other, token: "ExponentPushToken[otherdevice000000000000]", platform: "android", updatedAt: Date.now() });
    });
    await adminCreatesAppointment();
    await runScheduled();
    expect(sent).toHaveLength(0);
    expect(await proposal()).toMatchObject({ pushStatus: "no_tokens" });
    expect((await diagnose() as any).notifications[0].stage).toMatch(/^4 no device token/);
  });

  test("repeating the delivery does not send a second push", async () => {
    vi.useFakeTimers();
    process.env.EXPO_PUSH_LIVE = "stubbed-fetch";
    const sent = stubExpo();
    const { t, adminCreatesAppointment, proposal, runScheduled } = await setup();
    await adminCreatesAppointment();
    await runScheduled();
    const before = sent.length;
    await t.action(internal.pushNotifications.deliverNotification, { notificationId: (await proposal())._id });
    expect(sent.length).toBe(before);
  });
});

describe("live-push flag", () => {
  test("accepts common spellings outside tests and nothing else", () => {
    const original = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = "production";
      for (const value of ["true", "TRUE", " true ", "1", "yes", "on"]) {
        process.env.EXPO_PUSH_LIVE = value;
        expect(isLivePushEnabled(), value).toBe(true);
      }
      for (const value of ["", "false", "0", "no", "stubbed-fetch"]) {
        process.env.EXPO_PUSH_LIVE = value;
        expect(isLivePushEnabled(), value).toBe(false);
      }
      // Under tests only the explicit stub value turns it on, so tests never reach the real API.
      (process.env as any).NODE_ENV = "test";
      process.env.EXPO_PUSH_LIVE = "true";
      expect(isLivePushEnabled()).toBe(false);
    } finally {
      (process.env as any).NODE_ENV = original;
    }
  });
});
