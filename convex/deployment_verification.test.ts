// @vitest-environment node
/**
 * Deployment verification for the JWT_PRIVATE_JWK requirement.
 *
 * Uses a signing key produced by the real generator (scripts/generate-jwt-key.mjs)
 * and verifies every token exactly the way Convex's auth layer does for the
 * provider in auth.config.ts: OIDC discovery at CONVEX_SITE_URL, JWKS lookup by
 * `kid`, RS256 signature, `iss`, `aud` and `exp`. Every flow below then runs with
 * an identity built ONLY from verified token claims. The key is never printed.
 */
import { execFileSync } from "node:child_process";
import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import authConfig from "./auth.config";

const modules = import.meta.glob("./**/*.ts");

// Provided by every Convex deployment (set by vitest.setup.ts in tests); auth.config reads it at load.
const SITE_URL = process.env.CONVEX_SITE_URL!;

function generateKeyWithRealScript(): string {
  return execFileSync(process.execPath, ["scripts/generate-jwt-key.mjs"], { encoding: "utf8" });
}

function b64urlToBytes(part: string): Uint8Array<ArrayBuffer> {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  return new Uint8Array(Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64"));
}

function decodePart(part: string): any {
  return JSON.parse(Buffer.from(b64urlToBytes(part)).toString("utf8"));
}

/** Mirrors Convex's verification of a custom OIDC provider token. Returns verified claims or throws. */
async function verifyLikeConvex(t: any, token: string): Promise<any> {
  const provider = authConfig.providers[0];
  const discovery = await t.fetch("/.well-known/openid-configuration", { method: "GET" });
  if (discovery.status !== 200) throw new Error(`OIDC discovery failed: ${discovery.status}`);
  const oidc = await discovery.json();
  if (oidc.issuer !== provider.domain) throw new Error("OIDC issuer does not match auth.config domain");

  const jwksPath = new URL(oidc.jwks_uri).pathname;
  const jwksRes = await t.fetch(jwksPath, { method: "GET" });
  if (jwksRes.status !== 200) throw new Error(`JWKS unavailable: ${jwksRes.status}`);
  const { keys } = await jwksRes.json();

  const [h, p, s] = token.split(".");
  const header = decodePart(h);
  const claims = decodePart(p);
  if (header.alg !== "RS256") throw new Error("unexpected alg");
  const jwk = keys.find((k: any) => k.kid === header.kid);
  if (!jwk) throw new Error("no JWKS key for token kid");

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256" },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error("bad signature");
  if (claims.iss !== provider.domain) throw new Error("iss mismatch");
  if (claims.aud !== provider.applicationID) throw new Error("aud mismatch");
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new Error("expired");
  if (typeof claims.iat !== "number" || claims.iat > now + 60) throw new Error("iat in the future");
  return claims;
}

/** Identity as Convex would expose it to functions, built from verified claims only. */
function clientFor(t: any, claims: any) {
  return t.withIdentity({
    subject: claims.sub,
    issuer: claims.iss,
    tokenIdentifier: `${claims.iss}|${claims.sub}`,
    sid: claims.sid,
    role: claims.role,
  });
}

async function forgeWithForeignKey(token: string): Promise<string> {
  const [h, p] = token.split(".");
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${Buffer.from(sig).toString("base64url")}`;
}

const savedKey = process.env.JWT_PRIVATE_JWK;

beforeAll(() => {
  process.env.JWT_PRIVATE_JWK = generateKeyWithRealScript();
});

afterAll(() => {
  process.env.JWT_PRIVATE_JWK = savedKey;
});

async function seed(t: any) {
  let adminId = "";
  await t.run(async (ctx: any) => {
    adminId = await ctx.db.insert("users", { full_name: "Verify Admin", role: "admin", status: "active" });
  });
  const reg: any = await t.mutation(api.users.registerStudent, {
    full_name: "Verify Student",
    mobile_number: "9000000001",
    password: "Verify-pass-1",
  });
  expect(reg.token).toBeTruthy();
  return { adminId, studentId: String(reg.user.id) };
}

async function login(t: any, mobile: string, password: string) {
  const res: any = await t.mutation(api.users.login, { mobile_number: mobile, password });
  return res;
}

describe("Deployment verification: JWT_PRIVATE_JWK", () => {
  test("generator output is a complete private JWK and only the public half is published", async () => {
    const jwk = JSON.parse(process.env.JWT_PRIVATE_JWK!);
    expect(jwk.kty).toBe("RSA");
    expect(jwk.kid).toMatch(/^emotify-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/);
    for (const f of ["n", "e", "d", "p", "q", "dp", "dq", "qi"]) expect(typeof jwk[f]).toBe("string");

    const t = convexTest(schema, modules);
    const res = await t.fetch("/.well-known/jwks.json", { method: "GET" });
    const body = await res.json();
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0].kid).toBe(jwk.kid);
    const published = JSON.stringify(body);
    for (const secret of [jwk.d, jwk.p, jwk.q, jwk.dp, jwk.dq, jwk.qi]) expect(published).not.toContain(secret);
  });

  test("fresh login → verified token works; logout revokes it", async () => {
    const t = convexTest(schema, modules);
    const { studentId } = await seed(t);

    const res = await login(t, "9000000001", "Verify-pass-1");
    const claims = await verifyLikeConvex(t, res.token);
    expect(claims.sub).toBe(studentId);
    const client = clientFor(t, claims);
    const me: any = await client.query(api.users.getCurrentUser, {});
    expect(String(me._id)).toBe(studentId);
    expect(me.password_hash).toBeUndefined();

    await t.mutation(api.users.logout, { token: res.token });
    // The token is still cryptographically valid, but the server refuses it.
    await expect(verifyLikeConvex(t, res.token)).resolves.toBeTruthy();
    expect(await client.query(api.users.getCurrentUser, {})).toBeNull();
    await expect(client.mutation(api.emotionLogs.create, { emotion: "calm", bodyRegions: [] })).rejects.toThrow(/Unauthenticated/);
    expect(await t.query(api.users.checkSessionActive, { token: res.token })).toBe(false);
  });

  test("re-login issues a new working token and revokes the previous one", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const first = await login(t, "9000000001", "Verify-pass-1");
    const firstClient = clientFor(t, await verifyLikeConvex(t, first.token));
    const second = await login(t, "9000000001", "Verify-pass-1");
    const secondClaims = await verifyLikeConvex(t, second.token);
    expect(secondClaims.sid).not.toBe(JSON.parse(Buffer.from(b64urlToBytes(first.token.split(".")[1])).toString()).sid);

    expect(await firstClient.query(api.users.getCurrentUser, {})).toBeNull();
    expect(await clientFor(t, secondClaims).query(api.users.getCurrentUser, {})).not.toBeNull();
  });

  test("deactivation revokes access and blocks login; reactivation allows a fresh login", async () => {
    const t = convexTest(schema, modules);
    const { adminId, studentId } = await seed(t);
    const student = clientFor(t, await verifyLikeConvex(t, (await login(t, "9000000001", "Verify-pass-1")).token));

    await t.run(async (ctx: any) => {
      await ctx.db.patch(adminId, { mobile_number: "9000000009", password_hash: await (await import("./authHelpers")).hashPassword("Admin-pass-1") });
    });
    const admin = clientFor(t, await verifyLikeConvex(t, (await login(t, "9000000009", "Admin-pass-1")).token));

    await admin.mutation(api.users.toggleUserStatus, { userId: studentId as any, status: "inactive" });
    expect(await student.query(api.users.getCurrentUser, {})).toBeNull();
    const blocked = await login(t, "9000000001", "Verify-pass-1");
    expect(blocked.token).toBeUndefined();
    expect(blocked.error).toMatch(/inactive/i);

    await admin.mutation(api.users.toggleUserStatus, { userId: studentId as any, status: "active" });
    const again = await login(t, "9000000001", "Verify-pass-1");
    const fresh = clientFor(t, await verifyLikeConvex(t, again.token));
    expect(String(((await fresh.query(api.users.getCurrentUser, {})) as any)._id)).toBe(studentId);
  });

  test("forged tokens and tokens from a rotated-out key are rejected at verification", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const res = await login(t, "9000000001", "Verify-pass-1");
    await expect(verifyLikeConvex(t, await forgeWithForeignKey(res.token))).rejects.toThrow(/bad signature/);

    // Rotate: install a brand-new key. Tokens signed with the old key no longer verify.
    const before = process.env.JWT_PRIVATE_JWK;
    process.env.JWT_PRIVATE_JWK = generateKeyWithRealScript();
    try {
      await expect(verifyLikeConvex(t, res.token)).rejects.toThrow(/no JWKS key/);
      const after = await login(t, "9000000001", "Verify-pass-1");
      await expect(verifyLikeConvex(t, after.token)).resolves.toBeTruthy();
    } finally {
      process.env.JWT_PRIVATE_JWK = before;
    }
  });

  test("tokens are bound to this deployment (issuer/audience must match auth.config)", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const res = await login(t, "9000000001", "Verify-pass-1");
    const claims = decodePart(res.token.split(".")[1]);
    expect(claims.iss).toBe(SITE_URL);
    expect(claims.aud).toBe(authConfig.providers[0].applicationID);
    expect(authConfig.providers[0].domain).toBe(SITE_URL);
  });

  test("critical safety flows work end-to-end with verified identities", async () => {
    const t = convexTest(schema, modules);
    const { adminId, studentId } = await seed(t);
    const student = clientFor(t, await verifyLikeConvex(t, (await login(t, "9000000001", "Verify-pass-1")).token));

    // PHQ-9 item 9 → suicide flag, alert, staff notification, follow-up
    const phq9 = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), i === 8 ? 1 : 0]));
    const gad7 = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [String(i + 1), 0]));
    const pq16 = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [String(i + 1), 0]));
    const attempt: any = await student.mutation(api.screening.submitScreeningAttempt, { responses: { phq9, gad7, pq16 } });
    expect(attempt.triageLevel).toBe("suicide_flag");
    expect(attempt.followUpId).toBeTruthy();

    // Companion crisis message → controlled crisis response + alert, without calling the model
    const crisis: any = await student.action(api.companion.generateAIResponse, {
      userMessageId: "u1",
      aiMessageId: "a1",
      content: "I want to end my life",
    });
    expect(crisis.action.type).toBe("open_counsellor_request");

    // Student dismisses the emergency screen → recorded on the open alert
    await student.mutation(api.alerts.recordEmergencyScreenDismissal, {});

    const state = await t.run(async (ctx: any) => ({
      alerts: await ctx.db.query("alerts").collect(),
      notes: await ctx.db.query("notifications").collect(),
    }));
    expect(state.alerts.length).toBeGreaterThanOrEqual(1);
    expect(state.alerts.every((a: any) => a.userId === studentId && a.source)).toBe(true);
    expect(state.alerts.some((a: any) => a.studentDismissCount >= 1)).toBe(true);
    expect(state.notes.some((n: any) => n.recipientId === adminId && n.type === "critical_risk")).toBe(true);

    // Unauthenticated callers cannot reach any of it
    const anon = t;
    await expect(anon.mutation(api.screening.submitScreeningAttempt, { responses: { phq9, gad7, pq16 } })).rejects.toThrow(/Unauthenticated/);
    await expect(anon.mutation(api.alerts.recordEmergencyScreenDismissal, {})).rejects.toThrow(/Unauthenticated/);
  });
});
