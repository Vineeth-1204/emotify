import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import {
  allowedActions,
  appointmentSlotKey,
  appointmentStatusLabel,
  awaitingResponseFrom,
  parseAppointmentTime,
  validateAppointmentSlot,
} from "./appointmentStatus";
import { badgeLabel, notificationIcon, relativeTime } from "./notificationCentre";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf-8");

describe("appointment lifecycle rules", () => {
  test("the receiver answers; nobody confirms their own proposal", () => {
    const studentRequest = { status: "pending", createdBy: "user" };
    expect(awaitingResponseFrom(studentRequest)).toBe("staff");
    expect(allowedActions(studentRequest, "staff")).toEqual(["accept", "decline", "propose_time", "cancel"]);
    expect(allowedActions(studentRequest, "student")).toEqual(["propose_time", "cancel"]);

    const staffProposal = { status: "pending", createdBy: "admin" };
    expect(allowedActions(staffProposal, "student")).toContain("accept");
    expect(allowedActions(staffProposal, "staff")).not.toContain("accept");

    const studentNewTime = { status: "waiting", rescheduledBy: "user" };
    expect(allowedActions(studentNewTime, "staff")).toContain("accept");
    expect(allowedActions(studentNewTime, "student")).not.toContain("accept");
  });

  test("only staff complete; students give feedback once", () => {
    const confirmed = { status: "accepted" };
    expect(allowedActions(confirmed, "staff")).toContain("complete");
    expect(allowedActions(confirmed, "student")).not.toContain("complete");
    expect(allowedActions(confirmed, "student")).toContain("feedback");
    expect(allowedActions({ status: "completed", isFeedbackCompleted: true }, "student")).toEqual([]);
    expect(allowedActions({ status: "scheduled" }, "staff")).toContain("complete");
    for (const terminal of ["completed", "cancelled", "rejected"]) {
      expect(allowedActions({ status: terminal }, "staff")).toEqual([]);
    }
  });

  test("labels are plain language for each audience", () => {
    expect(appointmentStatusLabel({ status: "pending", createdBy: "user" }, "student")).toBe("Requested");
    expect(appointmentStatusLabel({ status: "pending", createdBy: "user" }, "staff")).toBe("New request");
    expect(appointmentStatusLabel({ status: "pending", createdBy: "admin" }, "student")).toBe("Your counsellor suggested a time");
    expect(appointmentStatusLabel({ status: "waiting", rescheduledBy: "admin" }, "student")).toBe("New time proposed");
    expect(appointmentStatusLabel({ status: "waiting", rescheduledBy: "admin" }, "staff")).toBe("Waiting for a reply");
    expect(appointmentStatusLabel({ status: "scheduled" }, "student")).toBe("Confirmed");
    expect(appointmentStatusLabel({ status: "rejected" }, "student")).toBe("Declined");
  });

  test("date and time validation", () => {
    const now = Date.UTC(2026, 9, 20, 12);
    expect(validateAppointmentSlot("2026-10-22", "09:30 AM", now)).toBeNull();
    expect(validateAppointmentSlot("2026-10-19", "09:30 AM", now)).toBeNull(); // one day of timezone slack
    expect(validateAppointmentSlot("2026-10-17", "09:30 AM", now)).toMatch(/has not passed/);
    expect(validateAppointmentSlot("2026-02-30", "09:30 AM", now)).toMatch(/valid date/);
    expect(validateAppointmentSlot("2027-06-01", "09:30 AM", now)).toMatch(/within the next/);
    expect(validateAppointmentSlot("2026-10-22", "13:00 PM", now)).toMatch(/valid time/);
    expect(parseAppointmentTime("12:00 AM")).toBe(0);
    expect(parseAppointmentTime("12:15 PM")).toBe(12 * 60 + 15);
    expect(appointmentSlotKey("2026-10-22", "02:05 PM")).toBe("2026-10-22 14:05");
    expect(appointmentSlotKey("2026-10-22", "2:05 pm")).toBe("2026-10-22 14:05");
  });
});

describe("notification centre helpers", () => {
  test("relative time, icons and badge", () => {
    const now = 10_000_000_000;
    expect(relativeTime(now - 10_000, now).key).toBe("notifications.centre.justNow");
    expect(relativeTime(now - 5 * 60_000, now)).toEqual({ key: "notifications.centre.minutesAgo", count: 5 });
    expect(relativeTime(now - 3 * 3_600_000, now)).toEqual({ key: "notifications.centre.hoursAgo", count: 3 });
    expect(relativeTime(now - 2 * 86_400_000, now)).toEqual({ key: "notifications.centre.daysAgo", count: 2 });
    expect(relativeTime(now - 9 * 86_400_000, now).key).toBe("date");
    expect(notificationIcon("appointment_confirmed")).toBe("calendar-outline");
    expect(badgeLabel({ count: 0, capped: false })).toBeNull();
    expect(badgeLabel({ count: 7, capped: false })).toBe("7");
    expect(badgeLabel({ count: 99, capped: true })).toBe("99+");
    expect(badgeLabel(undefined)).toBeNull();
  });

  test("every centre string exists in English", () => {
    const en = JSON.parse(read("i18n/locales/en.json"));
    for (const key of ["title", "markAllRead", "empty", "error", "retry", "loading", "loadMore", "unread", "bellLabel", "justNow", "minutesAgo", "hoursAgo", "daysAgo"]) {
      expect(en.notifications.centre[key], key).toEqual(expect.any(String));
    }
    for (const key of ["title", "body", "notNow", "allow"]) expect(en.notifications.permission[key], key).toEqual(expect.any(String));
    expect(en.notifications.permission.body).toMatch(/lock screen/);
  });
});

describe("mobile push wiring (source checks; device behaviour is verified manually)", () => {
  const helper = read("utils/notifications.ts");
  const hook = read("hooks/usePushNotifications.ts");
  const layout = read("app/_layout.tsx");
  const auth = read("utils/auth.tsx");

  test("SDK 54 foreground handler and channels; no broken device check", () => {
    expect(helper).toMatch(/shouldShowBanner: true/);
    expect(helper).toMatch(/shouldShowList: true/);
    expect(helper).not.toMatch(/Constants\.isDevice/);
    for (const channel of ["default", "appointments", "important", "reminders"]) expect(helper).toContain(`${channel}: {`);
  });

  test("permission is explained before the system prompt; taps are re-authorised on the server", () => {
    expect(layout).toContain("usePushNotifications();");
    expect(hook).toContain('t("notifications.permission.body")');
    expect(hook.indexOf("askWithExplanation()")).toBeGreaterThan(-1);
    expect(hook).toContain("api.notificationCenter.openNotification");
    expect(hook).toContain("addNotificationResponseReceivedListener");
    expect(hook).toContain("getLastNotificationResponseAsync");
  });

  test("logout unregisters the device token before the session is cleared", () => {
    const logout = auth.slice(auth.indexOf("const logout = async"));
    expect(logout.indexOf("removePushToken")).toBeGreaterThan(-1);
    expect(logout.indexOf("removePushToken")).toBeLessThan(logout.indexOf("tokenRef.current = null"));
  });

  test("the notification centre has an entry point with an unread badge", () => {
    const home = read("app/(auth)/(tabs)/index.tsx");
    expect(home).toContain("<NotificationBell />");
    expect(home).toContain("api.notificationCenter.unreadCount");
    const screen = read("app/(auth)/notifications.tsx");
    for (const s of ["api.notificationCenter.listMine", "api.notificationCenter.markAllRead", "api.notificationCenter.openNotification", "CentreErrorBoundary"]) {
      expect(screen).toContain(s);
    }
  });
});
