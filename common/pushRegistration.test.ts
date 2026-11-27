import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import {
  REGISTER_THROTTLE_MS,
  REOFFER_MS,
  describeError,
  parseOfferedAt,
  permissionDecision,
  phoneNotificationState,
  shouldRegister,
  testResultKey,
} from "./pushRegistration";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf-8");
const NOW = 1_800_000_000_000;

describe("when the app may ask for notification permission", () => {
  const undetermined = { status: "undetermined" as const, canAskAgain: true };

  test("asks the first time, waits after 'Not now', and asks again after 3 days", () => {
    expect(permissionDecision({ permission: undetermined, lastOfferedAt: null, now: NOW, interactive: false })).toBe("ask");
    expect(permissionDecision({ permission: undetermined, lastOfferedAt: NOW - 1000, now: NOW, interactive: false })).toBe("wait");
    expect(permissionDecision({ permission: undetermined, lastOfferedAt: NOW - REOFFER_MS, now: NOW, interactive: false })).toBe("ask");
  });

  test("'Turn on' in Profile always asks; a permanently blocked permission never prompts", () => {
    expect(permissionDecision({ permission: undetermined, lastOfferedAt: NOW - 1000, now: NOW, interactive: true })).toBe("ask");
    expect(permissionDecision({ permission: { status: "denied", canAskAgain: false }, lastOfferedAt: null, now: NOW, interactive: true })).toBe("blocked");
    expect(permissionDecision({ permission: { status: "denied", canAskAgain: true }, lastOfferedAt: null, now: NOW, interactive: false })).toBe("ask");
    expect(permissionDecision({ permission: { status: "granted", canAskAgain: true }, lastOfferedAt: null, now: NOW, interactive: false })).toBe("granted");
  });

  test("installs that used the old ask-once flag get asked again", () => {
    expect(parseOfferedAt(null)).toBeNull();
    expect(parseOfferedAt("1")).toBe(0); // old flag: treated as long ago
    expect(permissionDecision({ permission: undetermined, lastOfferedAt: parseOfferedAt("1"), now: NOW, interactive: false })).toBe("ask");
    expect(parseOfferedAt(String(NOW))).toBe(NOW);
  });
});

describe("registration throttling and diagnostics", () => {
  test("re-registers when the token changes, when forced, or after the throttle", () => {
    expect(shouldRegister({ token: "A", last: null, now: NOW, force: false })).toBe(true);
    expect(shouldRegister({ token: "A", last: { token: "A", at: NOW - 1000 }, now: NOW, force: false })).toBe(false);
    expect(shouldRegister({ token: "B", last: { token: "A", at: NOW - 1000 }, now: NOW, force: false })).toBe(true);
    expect(shouldRegister({ token: "A", last: { token: "A", at: NOW - 1000 }, now: NOW, force: true })).toBe(true);
    expect(shouldRegister({ token: "A", last: { token: "A", at: NOW - REGISTER_THROTTLE_MS }, now: NOW, force: false })).toBe(true);
  });

  test("error descriptions never contain a push token", () => {
    expect(describeError(new Error("Failed for ExponentPushToken[abc123]"))).toBe("Failed for [token]");
    expect(describeError("x".repeat(300))).toHaveLength(120);
  });

  test("Profile states and test results", () => {
    expect(phoneNotificationState({ status: "granted", canAskAgain: true }, 1)).toBe("on");
    expect(phoneNotificationState({ status: "granted", canAskAgain: true }, 0)).toBe("not_registered");
    expect(phoneNotificationState({ status: "undetermined", canAskAgain: true }, 0)).toBe("off");
    expect(phoneNotificationState({ status: "denied", canAskAgain: false }, 0)).toBe("blocked");
    expect(phoneNotificationState(null, 1)).toBe("unknown");
    expect(testResultKey("provider_accepted")).toBe("acceptedByGoogle");
    expect(testResultKey("mock")).toBe("liveOff");
    expect(testResultKey("no_tokens")).toBe("noDevice");
    const en = JSON.parse(read("i18n/locales/en.json"));
    for (const k of ["sending", "acceptedByExpo", "acceptedByGoogle", "failed", "liveOff", "noDevice", "skipped", "unknown"]) {
      expect(en.notifications.phone.result[k], k).toEqual(expect.any(String));
    }
    for (const k of ["on", "off", "blocked", "not_registered", "unknown"]) expect(en.notifications.phone.state[k], k).toEqual(expect.any(String));
  });
});

describe("wiring (source checks; device behaviour is verified on a phone)", () => {
  const hook = read("hooks/usePushNotifications.ts");

  test("setup runs after sign-in, on return to the foreground, on token refresh and from Profile", () => {
    expect(hook).toContain('runSetup("sign-in")');
    expect(hook).toContain('runSetup("foreground")');
    expect(hook).toContain("addPushTokenListener");
    expect(hook).toContain("activeSetupHandler = (interactive)");
    expect(read("components/PushStatusRow.tsx")).toContain("requestPushSetup()");
    expect(read("app/(auth)/(tabs)/profile.tsx")).toContain("<PushStatusRow />");
  });

  test("the explanation dialog can't leave setup waiting forever; failures are reported", () => {
    expect(hook).toContain("cancelable: true, onDismiss: () => done(false)");
    expect(hook).toContain("reportRegistration(");
    expect(hook).not.toMatch(/if \(explained\) return;/);
  });

  test("the preview build receives its EAS environment variables", () => {
    expect(JSON.parse(read("eas.json")).build.preview.environment).toBe("preview");
  });
});
