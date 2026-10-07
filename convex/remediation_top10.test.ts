/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { assignAllPatientsToCounsellors } from "../test-utils/identity";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  let studentA = "";
  let studentB = "";
  let counselor = "";
  let admin = "";
  await t.run(async (ctx) => {
    studentA = await ctx.db.insert("users", {
      full_name: "Student A",
      mobile_number: "9000000001",
      role: "patient",
      status: "active",
      password_hash: "HASH_A",
      biometricToken: "BIO_A",
      created_at: 1,
    });
    studentB = await ctx.db.insert("users", {
      full_name: "Student B",
      mobile_number: "9000000002",
      role: "patient",
      status: "active",
      password_hash: "HASH_B",
      created_at: 2,
    });
    counselor = await ctx.db.insert("users", { full_name: "Counselor", role: "counsellor", status: "active" });
    admin = await ctx.db.insert("users", { full_name: "Admin", role: "admin", status: "active" });
  });
  return {
    t,
    studentA,
    studentB,
    counselor,
    admin,
    asA: t.withIdentity({ subject: studentA }),
    asB: t.withIdentity({ subject: studentB }),
    asCounselor: t.withIdentity({ subject: counselor }),
    asAdmin: t.withIdentity({ subject: admin }),
  };
}

const ZERO_PQ16 = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [String(i + 1), 0]));

describe("Top-10 #2: exploitable endpoints closed", () => {
  test("processTriage is not callable, so a student cannot downgrade a suicide flag", async () => {
    const { asA, studentA } = await setup();
    const attempt = await asA.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, "9": 3 },
        gad7: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0 },
        pq16: ZERO_PQ16,
      },
    });
    expect(attempt.triageLevel).toBe("suicide_flag");

    await expect(
      asA.mutation((api.triage as any).processTriage, {
        phq9_total: 0,
        gad7_total: 0,
        pq16_total: 0,
        phq9_item9_score: 0,
      })
    ).rejects.toThrow();

    const latest = await asA.query(api.triage.getLatest, { userId: studentA });
    expect(latest?.level).toBe("suicide_flag");
  });

  test("patients.getPatients no longer exists (it leaked password hashes and biometric tokens)", async () => {
    const { asB } = await setup();
    await expect(asB.query((api.patients as any).getPatients, {})).rejects.toThrow();
  });

  test("cbt.getRecentPatientGoals is registered as internal (not client-callable)", async () => {
    const cbt: any = await import("./cbt");
    expect(cbt.getRecentPatientGoals.isInternal).toBe(true);
    expect(cbt.getRecentPatientGoals.isPublic).toBeFalsy();
  });

  test("createPatient is admin-only and never stores the temporary password", async () => {
    const { asA, asCounselor, asAdmin, t } = await setup();
    const args = {
      fullName: "New Student",
      age: 19,
      gender: "female",
      phone: "98765-43210",
      initialRiskLevel: "low",
    };
    await expect(asA.mutation(api.patients.createPatient, args)).rejects.toThrow(/Unauthorized/);
    await expect(asCounselor.mutation(api.patients.createPatient, args)).rejects.toThrow(/Unauthorized/);

    const result = await asAdmin.mutation(api.patients.createPatient, args);
    expect(result.tempPassword).toHaveLength(12);
    expect(result.patientId).toBeTruthy();

    const doc: any = await t.run(async (ctx) => ctx.db.get(result.id));
    expect(doc.temp_password).toBeUndefined();
    expect(doc.mobile_number).toBe("9876543210");
    expect(doc.age).toBe(19);

    await expect(asAdmin.mutation(api.patients.createPatient, args)).rejects.toThrow(/already registered/);
  });

  test("resetPassword returns the new password once and does not persist it", async () => {
    const { asAdmin, studentA, t } = await setup();
    const { newPassword } = await asAdmin.mutation(api.users.resetPassword, { userId: studentA as any });
    expect(newPassword).toHaveLength(12);
    const doc: any = await t.run(async (ctx) => ctx.db.get(studentA as any));
    expect(doc.temp_password).toBeUndefined();
    expect(doc.is_first_login).toBe(true);
  });
});

describe("Top-10 #8: companion helpers are server-only, TTS requires login", () => {
  test("helper mutations/queries used by the companion action are registered as internal", async () => {
    const mods: Record<string, any> = {
      companion: await import("./companion"),
      emotyRateLimiter: await import("./emotyRateLimiter"),
      emotyTelemetry: await import("./emotyTelemetry"),
      alerts: await import("./alerts"),
      emotyContext: await import("./emotyContext"),
    };
    const expectedInternal: Array<[string, string]> = [
      ["companion", "createMessage"],
      ["companion", "logMessage"],
      ["emotyRateLimiter", "checkAndAcquireRateLimit"],
      ["emotyRateLimiter", "releaseRateLimit"],
      ["emotyTelemetry", "recordTelemetry"],
      ["alerts", "createAlert"],
      ["alerts", "createSafetyAlertWithDeduplication"],
      ["emotyContext", "getAuthoritativeEmotyContext"],
    ];
    for (const [mod, fn] of expectedInternal) {
      expect(mods[mod][fn].isInternal, `${mod}.${fn}`).toBe(true);
    }
  });

  test("createMessage only accepts user/assistant roles", async () => {
    const { asA } = await setup();
    await expect(
      asA.mutation(internal.companion.createMessage, { messageId: "m1", role: "system" as any, content: "x" })
    ).rejects.toThrow();
    await asA.mutation(internal.companion.createMessage, { messageId: "m2", role: "user", content: "hello" });
  });

  test("a rate-limited (non-crisis) message is not persisted", async () => {
    const { t, asA, studentA } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("companionRateLimits", {
        userId: studentA,
        burstCount: 0,
        burstWindowStart: Date.now(),
        dailyCount: 10_000,
        dailyWindowStart: Date.now(),
        inFlight: false,
      });
    });
    await expect(
      asA.action(api.companion.generateAIResponse, {
        userMessageId: "u1",
        aiMessageId: "a1",
        content: "just wanted to say hi",
      })
    ).rejects.toThrow();
    const logs = await t.run(async (ctx) => ctx.db.query("aiCompanionLogs").collect());
    expect(logs).toHaveLength(0);
  });

  test("a crisis message is persisted and alerted even when rate-limited", async () => {
    const { t, asA, studentA } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("companionRateLimits", {
        userId: studentA,
        burstCount: 0,
        burstWindowStart: Date.now(),
        dailyCount: 10_000,
        dailyWindowStart: Date.now(),
        inFlight: false,
      });
    });
    await asA.action(api.companion.generateAIResponse, {
      userMessageId: "u1",
      aiMessageId: "a1",
      content: "I want to die",
    });
    const logs = await t.run(async (ctx) => ctx.db.query("aiCompanionLogs").collect());
    expect(logs.map((l) => l.role).sort()).toEqual(["assistant", "user"]);
    const alerts = await t.run(async (ctx) => ctx.db.query("alerts").collect());
    expect(alerts).toHaveLength(1);
  });

  test("TTS actions reject unauthenticated callers", async () => {
    const { t } = await setup();
    await expect(t.action(api.tts.generateSpeech, { text: "hi", voiceId: "v" })).rejects.toThrow(/Unauthenticated/);
    await expect(t.action(api.tts.getVoicePreview, { voiceId: "v" })).rejects.toThrow(/Unauthenticated/);
  });

  test("TTS generation is rate limited per user", async () => {
    const { asA } = await setup();
    for (let i = 0; i < 30; i++) {
      await asA.action(api.tts.generateSpeech, { text: "hi", voiceId: "v" });
    }
    await expect(asA.action(api.tts.generateSpeech, { text: "hi", voiceId: "v" })).rejects.toThrow(/Rate limit/);
  });
});

function decodeJwtPart(part: string): any {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))));
}

async function registerAndGetToken(t: any, mobile = "9123456780") {
  const res: any = await t.mutation(api.users.registerStudent, {
    full_name: "Token Student",
    mobile_number: mobile,
    password: "secret-pass-1",
  });
  expect(res.token).toBeTruthy();
  const [h, p] = res.token.split(".");
  return { token: res.token as string, userId: String(res.user.id), header: decodeJwtPart(h), payload: decodeJwtPart(p) };
}

describe("Top-10 #1: JWT signing key comes from the environment", () => {
  test("issued tokens verify against the published JWKS and carry the session id", async () => {
    const t = convexTest(schema, modules);
    const { token, userId, header, payload } = await registerAndGetToken(t);

    expect(header.alg).toBe("RS256");
    expect(payload.sub).toBe(userId);
    expect(typeof payload.sid).toBe("string");

    const res = await t.fetch("/.well-known/jwks.json", { method: "GET" });
    expect(res.status).toBe(200);
    const { keys } = await res.json();
    expect(keys).toHaveLength(1);
    expect(keys[0].kid).toBe(header.kid);
    for (const privateField of ["d", "p", "q", "dp", "dq", "qi"]) {
      expect(keys[0][privateField]).toBeUndefined();
    }

    const publicKey = await crypto.subtle.importKey(
      "jwk",
      { kty: keys[0].kty, n: keys[0].n, e: keys[0].e, alg: "RS256" },
      { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } },
      false,
      ["verify"]
    );
    const [h, p, sig] = token.split(".");
    const sigBytes = Uint8Array.from(atob(sig.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (sig.length % 4)) % 4)), (c) => c.charCodeAt(0));
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, sigBytes, new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);

    const session: any = await t.run(async (ctx) => ctx.db.get(payload.sid));
    expect(String(session.userId)).toBe(userId);
    expect(session.token).toBe(token);
  });

  test("without JWT_PRIVATE_JWK no token can be issued (fails closed)", async () => {
    const t = convexTest(schema, modules);
    const saved = process.env.JWT_PRIVATE_JWK;
    delete process.env.JWT_PRIVATE_JWK;
    try {
      await expect(
        t.mutation(api.users.registerStudent, { full_name: "No Key", mobile_number: "9123400000", password: "secret-pass-1" })
      ).rejects.toThrow(/JWT_PRIVATE_JWK/);
      const res = await t.fetch("/.well-known/jwks.json", { method: "GET" });
      expect(res.status).toBe(500);
    } finally {
      process.env.JWT_PRIVATE_JWK = saved;
    }
  });

  test("source code no longer contains a hard-coded private key", async () => {
    const helpers: any = await import("./authHelpers");
    expect(helpers.STATIC_JWK_PUBLIC).toBeUndefined();
    expect(helpers.STATIC_JWK_PRIVATE).toBeUndefined();
  });
});

describe("Top-10 #7: server-side session validation", () => {
  test("a live session authenticates; logout revokes it immediately", async () => {
    const t = convexTest(schema, modules);
    const { token, userId, payload } = await registerAndGetToken(t);
    const client = t.withIdentity({ subject: userId, sid: payload.sid });

    const me: any = await client.query(api.users.getCurrentUser, {});
    expect(String(me?._id)).toBe(userId);

    await t.mutation(api.users.logout, { token });
    expect(await client.query(api.users.getCurrentUser, {})).toBeNull();
    await expect(
      client.mutation(api.emotionLogs.create, { emotion: "calm", bodyRegions: [] })
    ).rejects.toThrow(/Unauthenticated/);
  });

  test("signing in again revokes the previous token", async () => {
    const t = convexTest(schema, modules);
    const first = await registerAndGetToken(t, "9123456781");
    const oldClient = t.withIdentity({ subject: first.userId, sid: first.payload.sid });

    const relogin: any = await t.mutation(api.users.login, { mobile_number: "9123456781", password: "secret-pass-1" });
    expect(relogin.token).toBeTruthy();
    expect(await oldClient.query(api.users.getCurrentUser, {})).toBeNull();

    const newSid = decodeJwtPart(relogin.token.split(".")[1]).sid;
    const newClient = t.withIdentity({ subject: first.userId, sid: newSid });
    expect(await newClient.query(api.users.getCurrentUser, {})).not.toBeNull();
  });

  test("deactivation revokes access", async () => {
    const t = convexTest(schema, modules);
    const { userId, payload } = await registerAndGetToken(t, "9123456782");
    const client = t.withIdentity({ subject: userId, sid: payload.sid });
    let adminId = "";
    await t.run(async (ctx) => {
      adminId = await ctx.db.insert("users", { full_name: "Admin", role: "admin", status: "active" });
    });
    await t.withIdentity({ subject: adminId }).mutation(api.users.toggleUserStatus, { userId: userId as any, status: "inactive" });
    expect(await client.query(api.users.getCurrentUser, {})).toBeNull();
  });

  test("tokens without a session id, with a foreign session id, or with a clerkId subject are rejected", async () => {
    const t = convexTest(schema, modules);
    const a = await registerAndGetToken(t, "9123456783");
    const b = await registerAndGetToken(t, "9123456784");
    await t.run(async (ctx) => ctx.db.patch(a.userId as any, { clerkId: "legacy_clerk_a" }));

    // Raw convex-test identities (bypassing the harness by passing `sid` explicitly)
    expect(await t.withIdentity({ subject: a.userId, sid: "" }).query(api.users.getCurrentUser, {})).toBeNull();
    expect(await t.withIdentity({ subject: a.userId, sid: b.payload.sid }).query(api.users.getCurrentUser, {})).toBeNull();
    expect(await t.withIdentity({ subject: "legacy_clerk_a", sid: a.payload.sid }).query(api.users.getCurrentUser, {})).toBeNull();
  });

  test("actions honour revocation too", async () => {
    const t = convexTest(schema, modules);
    const { token, userId, payload } = await registerAndGetToken(t, "9123456785");
    const client = t.withIdentity({ subject: userId, sid: payload.sid });
    await t.mutation(api.users.logout, { token });
    await expect(
      client.action(api.companion.generateAIResponse, { userMessageId: "u", aiMessageId: "a", content: "hello" })
    ).rejects.toThrow(/Unauthenticated/);
  });

  test("sessions created before session-bound tokens are treated as expired", async () => {
    const t = convexTest(schema, modules);
    let userId = "";
    await t.run(async (ctx) => {
      userId = await ctx.db.insert("users", { full_name: "Legacy", role: "patient", status: "active" });
      await ctx.db.insert("sessions", {
        userId: userId as any,
        token: "legacy.eyJzdWIiOiJ4In0.sig",
        createdAt: Date.now(),
        expiresAt: Date.now() + 1000000,
      });
    });
    expect(await t.query(api.users.checkSessionActive, { token: "legacy.eyJzdWIiOiJ4In0.sig" })).toBe(false);
    expect(await t.mutation(api.users.validateSession, { token: "legacy.eyJzdWIiOiJ4In0.sig" })).toBeNull();
    const remaining = await t.run(async (ctx) => ctx.db.query("sessions").collect());
    expect(remaining).toHaveLength(0);
  });
});

describe("Top-10 #3: crisis classifier coverage", () => {
  const crisis = [
    "I want to die",
    "I feel suicidal",
    "I've been thinking about suicide",
    "I'm thinking of killing myself",
    "I don't want to live anymore",
    "this exam killed me and I want to die",
    "my friend left. I am better off dead",
    "I took a bunch of pills",
    "I cut myself last night",
    "I have nothing to live for",
    "kms",
    "mujhe marna hai",
    "main khud ko maar dunga",
    "मैं मरना चाहता हूँ",
    "நான் தற்கொலை செய்ய போகிறேன்",
    "నాకు చనిపోవాలని ఉంది",
  ];
  const notCrisis = [
    "I hurt myself at the gym",
    "I cut myself shaving",
    "I'm dying my hair blue",
    "This movie made me want to die laughing",
    "That exam killed me",
    "Suicide prevention week starts Monday",
    "I'm tired.",
  ];

  test.each(crisis)("crisis: %s", async (msg) => {
    const { classifyServerSafety } = await import("./emotySafety");
    const r = classifyServerSafety(msg);
    expect(r.state).toBe("crisis");
    expect(r.isSelfCrisis).toBe(true);
  });

  test.each(notCrisis)("not crisis: %s", async (msg) => {
    const { classifyServerSafety } = await import("./emotySafety");
    expect(classifyServerSafety(msg).state).not.toBe("crisis");
  });

  test("third-party concern is not attributed to the student", async () => {
    const { classifyServerSafety } = await import("./emotySafety");
    for (const msg of ["My friend attempted suicide", "My roommate is talking about ending their life"]) {
      const r = classifyServerSafety(msg);
      expect(r.category).toBe("third_party");
      expect(r.isSelfCrisis).toBe(false);
    }
  });

  test("companion raises an alert for 'I feel suicidal' without calling the model", async () => {
    const { t, asA } = await setup();
    const res: any = await asA.action(api.companion.generateAIResponse, {
      userMessageId: "u1",
      aiMessageId: "a1",
      content: "I feel suicidal",
    });
    expect(res.action.type).toBe("open_counsellor_request");
    const alerts = await t.run(async (ctx) => ctx.db.query("alerts").collect());
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe("suicideRisk");
  });

  test("CBT uses the same deterministic gate (safety mode + alert, no model call needed)", async () => {
    const { t, asA } = await setup();
    const { session } = await asA.mutation(api.cbt.startSession, { forceNew: true });
    const res: any = await asA.action(api.cbt.submitMessage, {
      sessionId: session!._id,
      content: "honestly I've been thinking about suicide",
    });
    expect(res.step).toBe("safety_mode");
    const updated: any = await t.run(async (ctx) => ctx.db.get(session!._id));
    expect(updated.sessionStatus).toBe("safety_mode");
    const alerts = await t.run(async (ctx) => ctx.db.query("alerts").collect());
    expect(alerts).toHaveLength(1);
  });
});

describe("Top-10 #4: safety alerts notify staff and record their source", () => {
  async function staffNotifications(t: any) {
    return await t.run(async (ctx: any) => ctx.db.query("notifications").collect());
  }

  test("screening suicide flag notifies every counsellor and admin and links the attempt", async () => {
    const { t, asA, counselor, admin } = await setup();
    const res = await asA.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, "9": 1 },
        gad7: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0 },
        pq16: ZERO_PQ16,
      },
    });
    const alerts = await t.run(async (ctx) => ctx.db.query("alerts").collect());
    expect(alerts).toHaveLength(1);
    expect(alerts[0].source).toBe("screening");
    expect(alerts[0].sourceId).toBe(String(res.attemptId));
    expect(alerts[0].attemptId).toBe(res.attemptId);

    const notes = await staffNotifications(t);
    expect(notes.map((n: any) => n.recipientId).sort()).toEqual([String(counselor), String(admin)].sort());
    expect(notes.every((n: any) => n.priority === "critical")).toBe(true);
  });

  test("companion crisis alert links the triggering message and notifies staff", async () => {
    const { t, asA } = await setup();
    await asA.action(api.companion.generateAIResponse, { userMessageId: "msg-42", aiMessageId: "a", content: "I want to die" });
    const alerts = await t.run(async (ctx) => ctx.db.query("alerts").collect());
    expect(alerts[0].source).toBe("companion");
    expect(alerts[0].sourceId).toBe("msg-42");
    expect((await staffNotifications(t)).length).toBe(2);

    // Deduplication still applies within the cooldown: no second alert, no second round of notifications
    await asA.action(api.companion.generateAIResponse, { userMessageId: "msg-43", aiMessageId: "b", content: "I want to die" });
    expect(await t.run(async (ctx) => ctx.db.query("alerts").collect())).toHaveLength(1);
    expect((await staffNotifications(t)).length).toBe(2);
  });

  test("CBT crisis alert links the CBT session", async () => {
    const { t, asA } = await setup();
    const { session } = await asA.mutation(api.cbt.startSession, { forceNew: true });
    await asA.action(api.cbt.submitMessage, { sessionId: session!._id, content: "I want to kill myself" });
    const alerts = await t.run(async (ctx) => ctx.db.query("alerts").collect());
    expect(alerts[0].source).toBe("cbt");
    expect(alerts[0].sourceId).toBe(String(session!._id));
    expect((await staffNotifications(t)).length).toBe(2);
  });
});

describe("Top-10 #9: complete deletion and atomic screening follow-up", () => {
  test("deleteUser removes every user-owned table (incl. Emoty tables and legacy clerkId rows) and redacts trash", async () => {
    const { t, asAdmin } = await setup();
    let s = "";
    await t.run(async (ctx) => {
      s = await ctx.db.insert("users", {
        full_name: "Doomed Student",
        role: "patient",
        status: "active",
        clerkId: "legacy_s",
        patientId: "777",
        password_hash: "HASH_S",
        biometricToken: "BIO_S",
      });
      await ctx.db.insert("emotyMemories", { userId: s, category: "chosen_name", key: "display_name", value: "Sam", active: true, createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("aiTelemetryLogs", { userId: s, timestamp: 1, durationMs: 1, path: "gemini", mode: "m", actionType: "none", avatarState: "calm", safetyCategory: "normal", geminiCalled: true, geminiSuccess: true, fallbackUsed: false });
      await ctx.db.insert("companionRateLimits", { userId: s, burstCount: 1, burstWindowStart: 1, dailyCount: 1, dailyWindowStart: 1, inFlight: false });
      await ctx.db.insert("rateLimits", { key: `${s}:journal_write`, count: 1, windowStart: 1 });
      await ctx.db.insert("emotionLogs", { userId: "legacy_s", emotion: "sad", bodyRegions: [], createdAt: 1 });
      await ctx.db.insert("aiCompanionLogs", { userId: s, messageId: "m", role: "user", content: "hi", createdAt: 1 });
      // Another user's rows must survive
      await ctx.db.insert("rateLimits", { key: "someone_else:journal_write", count: 1, windowStart: 1 });
    });

    const res = await asAdmin.mutation(api.users.deleteUser, { userId: s as any });
    expect(res.completed).toBe(true);

    const left = await t.run(async (ctx) => ({
      user: await ctx.db.get(s as any),
      mem: (await ctx.db.query("emotyMemories").collect()).length,
      tel: (await ctx.db.query("aiTelemetryLogs").collect()).length,
      crl: (await ctx.db.query("companionRateLimits").collect()).length,
      rl: (await ctx.db.query("rateLimits").collect()).map((r) => r.key),
      emo: (await ctx.db.query("emotionLogs").collect()).length,
      chat: (await ctx.db.query("aiCompanionLogs").collect()).length,
      trash: (await ctx.db.query("trash").collect()).map((x) => x.deletedData),
    }));
    expect(left.user).toBeNull();
    expect([left.mem, left.tel, left.crl, left.emo, left.chat]).toEqual([0, 0, 0, 0, 0]);
    expect(left.rl).toEqual(["someone_else:journal_write"]);
    expect(left.trash).toHaveLength(1);
    expect(left.trash[0]).not.toContain("HASH_S");
    expect(left.trash[0]).not.toContain("BIO_S");
    expect(left.trash[0]).not.toContain("Doomed Student");
    expect(JSON.parse(left.trash[0]).patientId).toBe("777");
  });

  test("very large accounts are purged in batches that continue in the background", async () => {
    vi.useFakeTimers();
    try {
      const { t, asAdmin } = await setup();
      let s = "";
      await t.run(async (ctx) => {
        s = await ctx.db.insert("users", { full_name: "Big", role: "patient", status: "active" });
        for (let i = 0; i < 1100; i++) {
          await ctx.db.insert("emotionLogs", { userId: s, emotion: "calm", bodyRegions: [], createdAt: i });
        }
      });
      const res = await asAdmin.mutation(api.users.deleteUser, { userId: s as any });
      expect(res.completed).toBe(false);
      // Access is revoked and credentials wiped immediately even before the purge finishes
      const midway: any = await t.run(async (ctx) => ctx.db.get(s as any));
      expect(midway.status).toBe("inactive");

      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const after = await t.run(async (ctx) => ({
        user: await ctx.db.get(s as any),
        logs: (await ctx.db.query("emotionLogs").collect()).length,
      }));
      expect(after).toEqual({ user: null, logs: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  test("deleted students cannot be 'restored' from trash", async () => {
    const { t, asAdmin, studentB } = await setup();
    await asAdmin.mutation(api.users.deleteUser, { userId: studentB as any });
    const [item] = await t.run(async (ctx) => ctx.db.query("trash").collect());
    await expect(asAdmin.mutation(api.dashboard.restoreTrashItem, { trashId: item._id })).rejects.toThrow(/permanently erased/);
  });

  test("submitting a screening schedules its review follow-up and marks screening complete in one step", async () => {
    const { t, asA, studentA } = await setup();
    const before = Date.now();
    const res: any = await asA.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: { "1": 2, "2": 2, "3": 2, "4": 2, "5": 2, "6": 2, "7": 2, "8": 2, "9": 0 },
        gad7: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0 },
        pq16: ZERO_PQ16,
      },
    });
    expect(res.triageLevel).toBe("severe");
    const fu: any = await t.run(async (ctx) => ctx.db.get(res.followUpId));
    expect(fu.sourceType).toBe("screening");
    expect(fu.attemptId).toBe(res.attemptId);
    expect(fu.triageId).toBe(res.triageId);
    expect(fu.dueDate).toBeGreaterThanOrEqual(before + 2 * 86400000);
    expect(fu.dueDate).toBeLessThan(before + 3 * 86400000);
    const user: any = await t.run(async (ctx) => ctx.db.get(studentA as any));
    expect(user.screeningComplete).toBe(true);

    // The student cannot close this clinical follow-up themselves
    await expect(asA.mutation(api.followUps.markComplete, { id: res.followUpId })).rejects.toThrow(/counsellor/);
  });

  test("scheduleFollowUp is staff-only and uses the stored triage level, not the client's", async () => {
    const { t, asA, asCounselor, studentA } = await setup();
    const res: any = await asA.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, "9": 2 },
        gad7: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0 },
        pq16: ZERO_PQ16,
      },
    });
    await expect(asA.mutation(api.followUps.scheduleFollowUp, { level: "mild" })).rejects.toThrow(/Staff access/);
    await assignAllPatientsToCounsellors(t);

    const before = Date.now();
    const id = await asCounselor.mutation(api.followUps.scheduleFollowUp, {
      userId: studentA,
      level: "mild", // client claims mild; stored triage is suicide_flag
      attemptId: res.attemptId,
      triageId: res.triageId,
    });
    const fu: any = await t.run(async (ctx) => ctx.db.get(id));
    expect(fu.dueDate).toBeLessThan(before + 3 * 86400000);
  });
});

describe("Top-10 #5: single India crisis-resource configuration", () => {
  test("crisis and third-party responses use Tele-MANAS and 112 only", async () => {
    const { getControlledCrisisResponse, getControlledThirdPartyResponse } = await import("./emotySafety");
    const { CRISIS_RESOURCES } = await import("../common/crisisResources");
    for (const text of [getControlledCrisisResponse().response, getControlledThirdPartyResponse().response]) {
      expect(text).toContain(CRISIS_RESOURCES.helplineNumber);
      expect(text).toContain(CRISIS_RESOURCES.emergencyNumber);
      expect(text).not.toMatch(/\b(988|911)\b/);
    }
  });

  test("closing the emergency screen is stamped on the open suicide alert and shown on the timeline", async () => {
    const { t, asA, asCounselor, studentA } = await setup();
    await asA.mutation(api.screening.submitScreeningAttempt, {
      responses: {
        phq9: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, "9": 2 },
        gad7: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0 },
        pq16: ZERO_PQ16,
      },
    });
    await assignAllPatientsToCounsellors(t);
    const res = await asA.mutation(api.alerts.recordEmergencyScreenDismissal, {});
    expect(res.recordedOnAlerts).toBe(1);
    await asA.mutation(api.alerts.recordEmergencyScreenDismissal, {});

    const [alert] = await t.run(async (ctx) => ctx.db.query("alerts").collect());
    expect(alert.studentDismissCount).toBe(2);
    expect(alert.studentDismissedAt).toBeDefined();

    const timeline: any = await asCounselor.query(api.timeline.getStudentClinicalTimeline, { userId: studentA });
    const events = Array.isArray(timeline) ? timeline : timeline.events;
    expect(events.some((e: any) => e.eventType === "emergency_screen_dismissed")).toBe(true);
  });
});

describe("Top-10 #10: counsellor caseload scoping", () => {
  async function caseloadSetup() {
    const base = await setup();
    let counselor2 = "";
    await base.t.run(async (ctx) => {
      counselor2 = await ctx.db.insert("users", { full_name: "Counselor Two", role: "counsellor", status: "active" });
    });
    return { ...base, counselor2, asCounselor2: base.t.withIdentity({ subject: counselor2 }) };
  }

  test("only admins can assign; assignment grants access to exactly that student", async () => {
    const { asAdmin, asCounselor, asA, studentA, studentB, counselor } = await caseloadSetup();

    await expect(asCounselor.mutation(api.counsellorAssignments.assign, { studentId: studentA as any, counsellorId: counselor as any })).rejects.toThrow(/Unauthorized/);
    await expect(asA.mutation(api.counsellorAssignments.assign, { studentId: studentA as any, counsellorId: counselor as any })).rejects.toThrow(/Unauthorized/);

    // Before assignment: no access
    await expect(asCounselor.query(api.screening.getAll, { userId: studentA })).rejects.toThrow(/not in your caseload/);

    await asAdmin.mutation(api.counsellorAssignments.assign, { studentId: studentA as any, counsellorId: counselor as any });
    await asCounselor.query(api.screening.getAll, { userId: studentA });
    await expect(asCounselor.query(api.screening.getAll, { userId: studentB })).rejects.toThrow(/not in your caseload/);
    await expect(asCounselor.mutation(api.triage.unblockPatient, { userId: studentB, action: "switch_low" })).rejects.toThrow(/not in your caseload/);

    const roster: any = await asCounselor.query(api.users.listPatients, {});
    expect(roster.map((p: any) => String(p._id))).toEqual([studentA]);
    const adminRoster: any = await asAdmin.query(api.users.listPatients, {});
    expect(adminRoster.length).toBeGreaterThanOrEqual(2);

    const assignment: any = await asCounselor.query(api.counsellorAssignments.getForStudent, { studentId: studentA as any });
    expect(String(assignment.counsellorId)).toBe(counselor);

    // Unassigning revokes access
    await asAdmin.mutation(api.counsellorAssignments.unassign, { studentId: studentA as any });
    await expect(asCounselor.query(api.screening.getAll, { userId: studentA })).rejects.toThrow(/not in your caseload/);
  });

  test("staff alert list is limited to the caseload; safety notifications go to the assigned counsellor and admins", async () => {
    const { t, asAdmin, asA, asB, asCounselor, studentA, counselor, counselor2, admin } = await caseloadSetup();
    await asAdmin.mutation(api.counsellorAssignments.assign, { studentId: studentA as any, counsellorId: counselor as any });

    const flagged = {
      phq9: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, "9": 1 },
      gad7: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0 },
      pq16: ZERO_PQ16,
    };
    await asA.mutation(api.screening.submitScreeningAttempt, { responses: flagged });

    const criticalNotes = async () =>
      (await t.run(async (ctx) => ctx.db.query("notifications").collect())).filter((n) => n.type === "critical_risk");
    let notes = await criticalNotes();
    expect(notes.map((n) => n.recipientId).sort()).toEqual([admin, counselor].sort());

    // Student B is unassigned: every counsellor is notified so nothing is missed
    await asB.mutation(api.screening.submitScreeningAttempt, { responses: flagged });
    notes = await criticalNotes();
    const forB = notes.slice(2).map((n) => n.recipientId).sort();
    expect(forB).toEqual([admin, counselor, counselor2].sort());

    const counselorAlerts: any[] = await asCounselor.query(api.dashboard.getAlerts, {});
    expect(counselorAlerts.every((a) => a.userId === studentA)).toBe(true);
    const adminAlerts: any[] = await asAdmin.query(api.dashboard.getAlerts, {});
    expect(adminAlerts.length).toBeGreaterThan(counselorAlerts.length);
  });

  test("createUser accepts counsellor accounts and rejects unknown roles", async () => {
    const { asAdmin } = await caseloadSetup();
    const id = await asAdmin.mutation(api.users.createUser, {
      full_name: "New Counsellor",
      mobile_number: "9555500001",
      password: "Temp-pass-123",
      status: "active",
      role: "counsellor",
    });
    expect(id).toBeTruthy();
    await expect(
      asAdmin.mutation(api.users.createUser, {
        full_name: "Weird",
        mobile_number: "9555500002",
        password: "Temp-pass-123",
        status: "active",
        role: "superuser" as any,
      })
    ).rejects.toThrow();
  });
});
