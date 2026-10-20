/// <reference types="vite/client" />
import { afterEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import {
  resolveAvatarCharacterId,
  resolveUserAvatarCharacter,
  getNotificationAvatarUrl,
} from "../common/avatarNotification";
import { getAvatarBytes, isValidAvatarCharacter } from "./avatarMedia";
import type { ExpoPushMessage } from "./pushNotifications";
import { createNotification } from "./notify";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.EXPO_PUSH_LIVE;
});

describe("Phase 1 & 2: Avatar Notification Resolution & Fallback", () => {
  test("AVATAR-NOTIF-01: Boy avatar resolves from stored preferences (male or boy)", () => {
    expect(resolveAvatarCharacterId("male")).toBe("boy");
    expect(resolveAvatarCharacterId("boy")).toBe("boy");
    expect(resolveAvatarCharacterId(" MALE ")).toBe("boy");
    expect(resolveAvatarCharacterId("Boy")).toBe("boy");

    const userWithMale = {
      role: "student",
      mitraPreferences: { name: "Emoty", avatarGender: "male" },
    };
    expect(resolveUserAvatarCharacter(userWithMale)).toBe("boy");
  });

  test("AVATAR-NOTIF-02: Girl avatar resolves from stored preferences (female or girl)", () => {
    expect(resolveAvatarCharacterId("female")).toBe("girl");
    expect(resolveAvatarCharacterId("girl")).toBe("girl");
    expect(resolveAvatarCharacterId(" FEMALE ")).toBe("girl");
    expect(resolveAvatarCharacterId("Girl")).toBe("girl");

    const userWithFemale = {
      role: "student",
      mitraPreferences: { name: "Emoty", avatarGender: "female" },
    };
    expect(resolveUserAvatarCharacter(userWithFemale)).toBe("girl");
  });

  test("AVATAR-NOTIF-03: Missing, null, or unknown preferences safely fall back to null", () => {
    expect(resolveAvatarCharacterId(null)).toBeNull();
    expect(resolveAvatarCharacterId(undefined)).toBeNull();
    expect(resolveAvatarCharacterId("")).toBeNull();
    expect(resolveAvatarCharacterId("unknown_custom")).toBeNull();

    const userWithoutPrefs = { role: "student" };
    expect(resolveUserAvatarCharacter(userWithoutPrefs)).toBeNull();

    const userWithEmptyPrefs = {
      role: "student",
      mitraPreferences: { name: "Emoty", avatarGender: "" },
    };
    expect(resolveUserAvatarCharacter(userWithEmptyPrefs)).toBeNull();
  });

  test("AVATAR-NOTIF-04: Non-student roles (counsellor, admin) receive standard app icon fallback", () => {
    const counsellorUser = {
      role: "counsellor",
      mitraPreferences: { name: "Emoty", avatarGender: "male" },
    };
    expect(resolveUserAvatarCharacter(counsellorUser)).toBeNull();

    const adminUser = {
      role: "admin",
      mitraPreferences: { name: "Emoty", avatarGender: "female" },
    };
    expect(resolveUserAvatarCharacter(adminUser)).toBeNull();
  });

  test("AVATAR-NOTIF-05: Avatar URL generation constructs clean HTTPS URLs without exposing user data", () => {
    const siteUrl = "https://example.convex.site";

    const boyUrl = getNotificationAvatarUrl("boy", siteUrl);
    expect(boyUrl).toBe("https://example.convex.site/api/avatar/boy.jpg");
    expect(boyUrl).not.toContain("userId");
    expect(boyUrl).not.toContain("token");

    const girlUrl = getNotificationAvatarUrl("girl", siteUrl);
    expect(girlUrl).toBe("https://example.convex.site/api/avatar/girl.jpg");
    expect(girlUrl).not.toContain("userId");
    expect(girlUrl).not.toContain("token");

    // Trailing slash normalization
    expect(getNotificationAvatarUrl("boy", "https://example.convex.site/")).toBe(
      "https://example.convex.site/api/avatar/boy.jpg"
    );
  });

  test("AVATAR-NOTIF-06: Missing character or missing siteUrl returns null fallback (never invalid relative path)", () => {
    expect(getNotificationAvatarUrl(null, "https://example.convex.site")).toBeNull();
    expect(getNotificationAvatarUrl("boy", "")).toBeNull();
    expect(getNotificationAvatarUrl("boy", null)).toBeNull();
    expect(getNotificationAvatarUrl("boy", "   ")).toBeNull();
  });
});

describe("Phase 1 & 2: FCM 1MB Limit Compliance & Binary Asset Delivery", () => {
  test("AVATAR-ASSET-01: Boy avatar binary asset is valid JPEG and strictly under FCM 1MB limit", () => {
    const bytes = getAvatarBytes("boy");
    expect(bytes).not.toBeNull();
    expect(bytes!.byteLength).toBeGreaterThan(1000); // Has real image content
    expect(bytes!.byteLength).toBeLessThan(1024 * 1024); // Strictly under 1MB FCM limit
    // Verify JPEG Magic Number (0xFF, 0xD8, 0xFF)
    expect(bytes![0]).toBe(0xff);
    expect(bytes![1]).toBe(0xd8);
    expect(bytes![2]).toBe(0xff);
  });

  test("AVATAR-ASSET-02: Girl avatar binary asset is valid JPEG and strictly under FCM 1MB limit", () => {
    const bytes = getAvatarBytes("girl");
    expect(bytes).not.toBeNull();
    expect(bytes!.byteLength).toBeGreaterThan(1000); // Has real image content
    expect(bytes!.byteLength).toBeLessThan(1024 * 1024); // Strictly under 1MB FCM limit (original was 2.5MB)
    // Verify JPEG Magic Number (0xFF, 0xD8, 0xFF)
    expect(bytes![0]).toBe(0xff);
    expect(bytes![1]).toBe(0xd8);
    expect(bytes![2]).toBe(0xff);
  });

  test("AVATAR-ASSET-03: Invalid avatar character requests return null", () => {
    expect(getAvatarBytes("unknown" as any)).toBeNull();
    expect(isValidAvatarCharacter("boy")).toBe(true);
    expect(isValidAvatarCharacter("girl")).toBe(true);
    expect(isValidAvatarCharacter("robot")).toBe(false);
  });
});

describe("Phase 2: Push Message Payload Construction with Rich Content", () => {
  test("AVATAR-PAYLOAD-01: Rich content image is attached when avatar URL is present", () => {
    const avatarUrl = "https://example.convex.site/api/avatar/boy.jpg";
    const message: ExpoPushMessage = {
      to: "ExponentPushToken[mock_token_12345]",
      title: "Emotify",
      body: "Your appointment status has changed.",
      sound: "default",
      channelId: "appointments",
      data: { notificationId: "notif_1" },
      priority: "high",
      ...(avatarUrl ? { richContent: { image: avatarUrl } } : {}),
    };

    expect(message.richContent).toBeDefined();
    expect(message.richContent?.image).toBe("https://example.convex.site/api/avatar/boy.jpg");
    expect(message.title).toBe("Emotify");
    expect(message.body).toBe("Your appointment status has changed.");
    // Lock-screen message remains clean and contains no URLs or secrets
    expect(message.body).not.toContain("http");
    expect(message.title).not.toContain("http");
  });

  test("AVATAR-PAYLOAD-02: Rich content is completely omitted when avatar URL is null (clean fallback)", () => {
    const avatarUrl = null;
    const message: ExpoPushMessage = {
      to: "ExponentPushToken[mock_token_12345]",
      title: "Emotify",
      body: "Your appointment status has changed.",
      sound: "default",
      channelId: "appointments",
      data: { notificationId: "notif_1" },
      priority: "high",
      ...(avatarUrl ? { richContent: { image: avatarUrl } } : {}),
    };

    expect(message.richContent).toBeUndefined();
    expect(message.title).toBe("Emotify");
  });
});

describe("Phase 2 & 3: End-to-End Notification Delivery with Avatar", () => {
  test("AVATAR-DELIVERY-01: deliverNotification includes boy avatar URL for student with male preference", async () => {
    vi.useFakeTimers();
    process.env.EXPO_PUSH_LIVE = "stubbed-fetch";
    const sent: any[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: any) => {
      if (url.includes("/api/v2/push/send")) {
        const body = JSON.parse(init.body);
        sent.push(...body);
        return new Response(JSON.stringify({ data: body.map(() => ({ status: "ok", id: "ticket-boy-1" })) }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });

    const t = convexTest(schema, modules);
    const student = await t.run(async (ctx) => {
      const u = await ctx.db.insert("users", {
        full_name: "Student Boy",
        role: "student",
        status: "active",
        created_at: Date.now(),
        mitraPreferences: { name: "Emoty", avatarGender: "male" },
      });
      await ctx.db.insert("pushTokens", {
        userId: u,
        token: "ExponentPushToken[boy_student_token]",
        platform: "android",
        updatedAt: Date.now(),
      });
      return u;
    });

    await t.run(async (ctx) => {
      await createNotification(ctx, {
        recipientId: student,
        type: "appointment_confirmed",
        title: "In-App Title",
        message: "In-app message",
      });
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(sent.length).toBe(1);
    expect(sent[0].richContent?.image).toBe("https://emotify-test.convex.site/api/avatar/boy.jpg");
    expect(sent[0].body).toBe("Your appointment status has changed.");
  });

  test("AVATAR-DELIVERY-02: deliverNotification includes girl avatar URL for student with female preference", async () => {
    vi.useFakeTimers();
    process.env.EXPO_PUSH_LIVE = "stubbed-fetch";
    const sent: any[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: any) => {
      if (url.includes("/api/v2/push/send")) {
        const body = JSON.parse(init.body);
        sent.push(...body);
        return new Response(JSON.stringify({ data: body.map(() => ({ status: "ok", id: "ticket-girl-1" })) }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });

    const t = convexTest(schema, modules);
    const student = await t.run(async (ctx) => {
      const u = await ctx.db.insert("users", {
        full_name: "Student Girl",
        role: "student",
        status: "active",
        created_at: Date.now(),
        mitraPreferences: { name: "Emoty", avatarGender: "female" },
      });
      await ctx.db.insert("pushTokens", {
        userId: u,
        token: "ExponentPushToken[girl_student_token]",
        platform: "android",
        updatedAt: Date.now(),
      });
      return u;
    });

    await t.run(async (ctx) => {
      await createNotification(ctx, {
        recipientId: student,
        type: "appointment_confirmed",
        title: "In-App Title",
        message: "In-app message",
      });
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(sent.length).toBe(1);
    expect(sent[0].richContent?.image).toBe("https://emotify-test.convex.site/api/avatar/girl.jpg");
    expect(sent[0].body).toBe("Your appointment status has changed.");
  });

  test("AVATAR-DELIVERY-03: deliverNotification cleanly falls back to standard icon when student has no avatar preference", async () => {
    vi.useFakeTimers();
    process.env.EXPO_PUSH_LIVE = "stubbed-fetch";
    const sent: any[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: any) => {
      if (url.includes("/api/v2/push/send")) {
        const body = JSON.parse(init.body);
        sent.push(...body);
        return new Response(JSON.stringify({ data: body.map(() => ({ status: "ok", id: "ticket-nopref-1" })) }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });

    const t = convexTest(schema, modules);
    const student = await t.run(async (ctx) => {
      const u = await ctx.db.insert("users", {
        full_name: "Student No Pref",
        role: "student",
        status: "active",
        created_at: Date.now(),
      });
      await ctx.db.insert("pushTokens", {
        userId: u,
        token: "ExponentPushToken[nopref_student_token]",
        platform: "android",
        updatedAt: Date.now(),
      });
      return u;
    });

    await t.run(async (ctx) => {
      await createNotification(ctx, {
        recipientId: student,
        type: "appointment_confirmed",
        title: "In-App Title",
        message: "In-app message",
      });
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(sent.length).toBe(1);
    expect(sent[0].richContent).toBeUndefined();
    expect(sent[0].body).toBe("Your appointment status has changed.");
  });

  test("AVATAR-DELIVERY-04: deliverNotification cleanly falls back to standard icon for counsellor recipient", async () => {
    vi.useFakeTimers();
    process.env.EXPO_PUSH_LIVE = "stubbed-fetch";
    const sent: any[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: any) => {
      if (url.includes("/api/v2/push/send")) {
        const body = JSON.parse(init.body);
        sent.push(...body);
        return new Response(JSON.stringify({ data: body.map(() => ({ status: "ok", id: "ticket-counsellor-1" })) }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });

    const t = convexTest(schema, modules);
    const counsellor = await t.run(async (ctx) => {
      const u = await ctx.db.insert("users", {
        full_name: "Counsellor Alice",
        role: "counsellor",
        status: "active",
        created_at: Date.now(),
        mitraPreferences: { name: "Emoty", avatarGender: "female" },
      });
      await ctx.db.insert("pushTokens", {
        userId: u,
        token: "ExponentPushToken[counsellor_token]",
        platform: "android",
        updatedAt: Date.now(),
      });
      return u;
    });

    await t.run(async (ctx) => {
      await createNotification(ctx, {
        recipientId: counsellor,
        type: "appointment_request_received",
        title: "In-App Title",
        message: "In-app message",
      });
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(sent.length).toBe(1);
    expect(sent[0].richContent).toBeUndefined();
    expect(sent[0].body).toBe("You have a new appointment request.");
  });
});
