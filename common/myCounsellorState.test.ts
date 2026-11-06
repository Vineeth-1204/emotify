import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import { myCounsellorView } from "./myCounsellorState";

const online = { isWebSocketConnected: true, hasEverConnected: true, connectionRetries: 0 };
const offline = { isWebSocketConnected: false, hasEverConnected: true, connectionRetries: 3 };
const connecting = { isWebSocketConnected: false, hasEverConnected: false, connectionRetries: 0 };
const assigned = {
  status: "assigned" as const,
  counsellor: { displayName: "Counsellor Asha", role: "Counsellor", email: null, phone: null },
  assignedAt: 1,
};

const section = fs.readFileSync(path.resolve(__dirname, "../components/profile/MyCounsellorSection.tsx"), "utf-8");
const profile = fs.readFileSync(path.resolve(__dirname, "../app/(auth)/(tabs)/profile.tsx"), "utf-8");
const en = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../i18n/locales/en.json"), "utf-8"));

describe("My Counsellor view states", () => {
  test("loading while the first answer is pending or the client is still connecting", () => {
    expect(myCounsellorView(true, undefined, online)).toBe("loading");
    expect(myCounsellorView(true, undefined, connecting)).toBe("loading");
    expect(myCounsellorView(false, undefined, offline)).toBe("loading"); // auth not ready yet
  });

  test("a network failure is shown as an error, never as 'unassigned'", () => {
    expect(myCounsellorView(true, undefined, offline)).toBe("offline");
    expect(myCounsellorView(true, undefined, { ...connecting, connectionRetries: 1 })).toBe("offline");
  });

  test("each server answer maps to its own view", () => {
    expect(myCounsellorView(true, { status: "unassigned" }, online)).toBe("unassigned");
    expect(myCounsellorView(true, { status: "unavailable" }, online)).toBe("unavailable");
    expect(myCounsellorView(true, { status: "unauthenticated" }, online)).toBe("signInAgain");
    expect(myCounsellorView(true, { status: "not_student" }, online)).toBe("hidden");
    expect(myCounsellorView(true, assigned, online)).toBe("assigned");
    // A cached answer stays visible while briefly offline
    expect(myCounsellorView(true, assigned, offline)).toBe("assigned");
  });
});

describe("My Counsellor section wiring", () => {
  test("reads the signed-in student's own live assignment; no student argument, no mock data", () => {
    expect(section).toContain("useQuery(api.counsellorAssignments.getMyCounsellor, isReady ? {} : 'skip')");
    expect(section).not.toMatch(/studentId|userId|clerkId/);
    expect(section).toContain("myCounsellorView(isReady, result, connection)");
    expect(section).toContain("class MyCounsellorErrorBoundary");
  });

  test("shows only display name, role, approved contacts and the appointment action", () => {
    for (const field of ["counsellor.displayName", "counsellor.email", "counsellor.phone", "/(auth)/tools/appointments"]) expect(section).toContain(field);
    // ("alert-circle-outline" is an icon name, so match the plural/data field forms only)
    expect(section).not.toMatch(/mobile_number|counsellorId|triage|\balerts\b|phq|gad7|pq16|screening/i);
  });

  test("sits in the existing profile screen with the required wording", () => {
    expect(profile).toContain("<MyCounsellorSection isReady={isReady} />");
    expect(profile.indexOf("<MyCounsellorSection")).toBeLessThan(profile.indexOf("{/* Account Details Section */}"));
    expect(en.profile.myCounsellor.unassigned).toBe(
      "Your counsellor hasn't been assigned yet. Please contact your institution's administrator for assistance."
    );
    for (const key of ["title", "role", "assignedSince", "requestSession", "unavailable", "loading", "loadError", "signInAgain"]) {
      expect(en.profile.myCounsellor[key], key).toBeTruthy();
    }
  });
});
