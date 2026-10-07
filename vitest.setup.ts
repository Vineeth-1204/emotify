/**
 * Test-only environment: generates an ephemeral RS256 signing key per test run so
 * that no signing key ever needs to exist in the repository.
 */
const keyPair = (await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"]
)) as CryptoKeyPair;

const jwk = (await crypto.subtle.exportKey("jwk", keyPair.privateKey)) as JsonWebKey;

process.env.JWT_PRIVATE_JWK = JSON.stringify({ ...jwk, kid: "test-key", alg: "RS256", use: "sig" });
process.env.CONVEX_SITE_URL = process.env.CONVEX_SITE_URL || "https://emotify-test.convex.site";

/**
 * Test harness: production only honours tokens backed by a live session (`sid`).
 * Most tests build identities as `t.withIdentity({ subject: userId })`; for those,
 * this shim creates (or reuses) a real `sessions` row for the user and injects its
 * id as `sid`, so the same server-side validation path runs in tests.
 * Tests that pass their own `sid` (e.g. revocation tests) are left untouched.
 */
import { vi } from "vitest";
import { resolveFixtureUserId, ensureLiveSession } from "./test-utils/identity";

vi.mock("convex-test", async (importOriginal) => {
  const original: any = await importOriginal();

  function wrapTester(t: any): any {
    const ensureSession = async (identity: any) => {
      if (!identity || identity.sid !== undefined || typeof identity.subject !== "string") return identity;
      const resolved = await t.run(async (ctx: any) => {
        const userId = await resolveFixtureUserId(ctx, identity.subject);
        const user = await ctx.db.get(userId);
        if (!user) return null;
        return { subject: String(userId), sid: await ensureLiveSession(ctx, userId) };
      });
      return resolved ? { ...identity, ...resolved } : identity;
    };

    return new Proxy(t, {
      get(target, prop, receiver) {
        if (prop === "withIdentity") {
          return (identity: any) => {
            // Resolve once per scoped identity, like a real token bound to one session.
            let resolved: Promise<any> | undefined;
            const resolve = () => (resolved ??= ensureSession(identity));
            const call =
              (method: "query" | "mutation" | "action") =>
              async (...callArgs: any[]) =>
                target.withIdentity(await resolve())[method](...callArgs);
            const scoped = target.withIdentity(identity);
            return new Proxy(scoped, {
              get(s, p, r) {
                if (p === "query" || p === "mutation" || p === "action") return call(p);
                if (p === "__resolveIdentity") return resolve;
                if (p === "__identitySubject") return identity?.subject;
                return Reflect.get(s, p, r);
              },
            });
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  return {
    ...original,
    convexTest: (...args: any[]) => wrapTester(original.convexTest(...args)),
  };
});
