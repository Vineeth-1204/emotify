#!/usr/bin/env node
/**
 * Post-deployment verification for Emotify's authentication (run after setting
 * JWT_PRIVATE_JWK on a deployment and deploying this version).
 *
 * Checks, against the REAL deployment:
 *   1. OIDC discovery + JWKS are served, the key was rotated (not the old
 *      "static-key-1"), and no private key material is published.
 *   2. Fresh login -> Convex accepts the token.
 *   3. A token signed with a foreign key is refused.
 *   4. Logout revokes the token immediately.
 *   5. Re-login issues a new token and revokes the previous one.
 *   6. (optional, needs admin) Deactivation revokes access and blocks login;
 *      reactivation allows a fresh login.
 *   7. (optional, creates real alerts - DEV deployments only) PHQ-9 item 9 raises the
 *      crisis gate + follow-up, a retry with the same submission key is de-duplicated, and
 *      an emergency-screen dismissal is recorded.
 *   8. (optional, needs admin + counsellor test accounts) Caseload authorization: the
 *      counsellor is refused while the test student is unassigned and allowed once
 *      assigned; the student's My Counsellor shows the counsellor without login details.
 *      With VERIFY_DIRECTORY_ENTRY_ID (the test counsellor's directory entry), approving
 *      and revoking the institutional email takes effect on the next student read.
 *      The previous assignment and approval state are restored afterwards.
 *
 * Usage (use a dedicated TEST student account, never a real student):
 *   CONVEX_URL=https://<deployment>.convex.cloud \
 *   VERIFY_STUDENT_MOBILE=... VERIFY_STUDENT_PASSWORD=... \
 *   [VERIFY_ADMIN_MOBILE=... VERIFY_ADMIN_PASSWORD=...] \
 *   [VERIFY_SAFETY=1] \
 *   [VERIFY_COUNSELLOR_MOBILE=... VERIFY_COUNSELLOR_PASSWORD=... [VERIFY_DIRECTORY_ENTRY_ID=...]] \
 *   node scripts/verify-deployment.mjs
 *
 * Signing in as the admin here signs that admin out of other devices (one session per user).
 * Tokens and keys are never printed.
 */
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { webcrypto } from "node:crypto";

const api = anyApi;
const { subtle } = webcrypto;

const CONVEX_URL = process.env.CONVEX_URL;
const SITE_URL = process.env.CONVEX_SITE_URL || CONVEX_URL?.replace(/\.convex\.cloud\/?$/, ".convex.site");
const STUDENT = { mobile: process.env.VERIFY_STUDENT_MOBILE, password: process.env.VERIFY_STUDENT_PASSWORD };
const ADMIN = { mobile: process.env.VERIFY_ADMIN_MOBILE, password: process.env.VERIFY_ADMIN_PASSWORD };
const RUN_SAFETY = process.env.VERIFY_SAFETY === "1";
const COUNSELLOR = { mobile: process.env.VERIFY_COUNSELLOR_MOBILE, password: process.env.VERIFY_COUNSELLOR_PASSWORD };
const DIRECTORY_ENTRY_ID = process.env.VERIFY_DIRECTORY_ENTRY_ID;
const OLD_STATIC_KID = "static-key-1";

// Safeguard against accidental production mutations:
const IS_PROD_DEPLOYMENT =
  process.env.NODE_ENV === "production" ||
  process.env.IS_PRODUCTION === "1" ||
  process.env.VERIFY_PROD === "1" ||
  (CONVEX_URL && (CONVEX_URL.includes("prod") || !CONVEX_URL.includes("dev")));

if (RUN_SAFETY && (IS_PROD_DEPLOYMENT || process.env.ALLOW_SAFETY_MUTATIONS !== "true")) {
  console.error(
    "\n[CRITICAL SAFETY GUARD] VERIFY_SAFETY=1 generates real suicide-risk alerts and MUST NEVER run against production.\n" +
    "To run against a dev deployment, you must explicitly set ALLOW_SAFETY_MUTATIONS=true and ensure IS_PRODUCTION is not enabled.\n"
  );
  process.exit(2);
}

if (!CONVEX_URL || !STUDENT.mobile || !STUDENT.password) {
  console.error("Set CONVEX_URL, VERIFY_STUDENT_MOBILE and VERIFY_STUDENT_PASSWORD.");
  process.exit(2);
}

let failures = 0;
function pass(name) {
  console.log(`PASS  ${name}`);
}
function fail(name, why) {
  failures++;
  console.log(`FAIL  ${name}: ${why}`);
}
async function check(name, fn) {
  try {
    await fn();
    pass(name);
  } catch (e) {
    fail(name, e?.message || String(e));
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const b64url = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const claimsOf = (token) => JSON.parse(b64url(token.split(".")[1]).toString("utf8"));

function clientWith(token) {
  const c = new ConvexHttpClient(CONVEX_URL);
  if (token) c.setAuth(token);
  return c;
}

/** Returns the current user, or null if Convex refused the token or the session is revoked. */
async function whoAmI(token) {
  try {
    return await clientWith(token).query(api.users.getCurrentUser, {});
  } catch {
    return null;
  }
}

async function login(creds) {
  const res = await clientWith().mutation(api.users.login, { mobile_number: creds.mobile, password: creds.password });
  return res;
}

async function main() {
  console.log(`Verifying ${CONVEX_URL} (site ${SITE_URL})\n`);
  let jwks;

  await check("OIDC discovery issuer matches the deployment site URL", async () => {
    const res = await fetch(`${SITE_URL}/.well-known/openid-configuration`);
    assert(res.status === 200, `HTTP ${res.status}`);
    const body = await res.json();
    assert(body.issuer === SITE_URL, `issuer is ${body.issuer}`);
  });

  await check("JWKS is served with a single rotated public key", async () => {
    const res = await fetch(`${SITE_URL}/.well-known/jwks.json`);
    assert(res.status === 200, `HTTP ${res.status} (is JWT_PRIVATE_JWK set on this deployment?)`);
    jwks = await res.json();
    assert(Array.isArray(jwks.keys) && jwks.keys.length === 1, "expected exactly one key");
    const [k] = jwks.keys;
    assert(k.kid && k.kid !== OLD_STATIC_KID, `kid is "${k.kid}" - the old compromised key "${OLD_STATIC_KID}" is still in use!`);
    assert(k.kty === "RSA", `kty is "${k.kty}", expected "RSA"`);
    assert(k.alg === "RS256", `alg is "${k.alg}", expected "RS256"`);
    assert(k.use === "sig", `use is "${k.use}", expected "sig"`);
    assert(typeof k.n === "string" && k.n.length > 0, "missing public modulus n");
    assert(typeof k.e === "string" && k.e.length > 0, "missing public exponent e");
    for (const f of ["d", "p", "q", "dp", "dq", "qi", "k"]) assert(k[f] === undefined, `private field "${f}" is published`);
  });

  const first = await login(STUDENT);
  let firstToken;
  await check("fresh login returns a token signed by the published key", async () => {
    assert(first?.token, first?.error || "no token returned");
    firstToken = first.token;
    const [h, p, s] = firstToken.split(".");
    const header = JSON.parse(b64url(h).toString("utf8"));
    const jwk = jwks?.keys?.find((k) => k.kid === header.kid);
    assert(jwk, "token kid not in JWKS");
    const key = await subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256" }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    assert(await subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(s), new TextEncoder().encode(`${h}.${p}`)), "bad signature");
    const claims = claimsOf(firstToken);
    assert(claims.iss === SITE_URL, "iss mismatch");
    assert(claims.aud === "convex", "aud mismatch");
    assert(typeof claims.sid === "string", "token has no session id");
  });

  await check("Convex accepts the fresh token", async () => {
    const me = await whoAmI(firstToken);
    assert(me && String(me._id) === claimsOf(firstToken).sub, "getCurrentUser did not return the student");
  });

  await check("a token signed with a foreign key is refused", async () => {
    const [h, p] = firstToken.split(".");
    const pair = await subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign"]);
    const sig = Buffer.from(await subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${h}.${p}`))).toString("base64url");
    assert((await whoAmI(`${h}.${p}.${sig}`)) === null, "forged token was accepted");
  });

  await check("unauthenticated callers cannot write clinical data", async () => {
    let refused = false;
    try {
      await clientWith().mutation(api.alerts.recordEmergencyScreenDismissal, {});
    } catch {
      refused = true;
    }
    assert(refused, "anonymous call succeeded");
  });

  await check("re-login issues a new token and revokes the previous one", async () => {
    const second = await login(STUDENT);
    assert(second?.token, second?.error || "no token");
    assert((await whoAmI(firstToken)) === null, "previous token still works");
    assert((await whoAmI(second.token)) !== null, "new token refused");
    firstToken = second.token;
  });

  await check("logout revokes the token immediately", async () => {
    await clientWith().mutation(api.users.logout, { token: firstToken });
    assert((await whoAmI(firstToken)) === null, "token still works after logout");
  });

  if (ADMIN.mobile && ADMIN.password) {
    await check("deactivation revokes access and blocks login; reactivation restores login", async () => {
      const admin = await login(ADMIN);
      assert(admin?.token, admin?.error || "admin login failed");
      const student = await login(STUDENT);
      assert(student?.token, student?.error || "student login failed");
      const studentId = claimsOf(student.token).sub;
      const adminClient = clientWith(admin.token);
      try {
        await adminClient.mutation(api.users.toggleUserStatus, { userId: studentId, status: "inactive" });
        assert((await whoAmI(student.token)) === null, "deactivated student's token still works");
        const blocked = await login(STUDENT);
        assert(!blocked?.token && /inactive/i.test(blocked?.error || ""), "inactive student could log in");
      } finally {
        await adminClient.mutation(api.users.toggleUserStatus, { userId: studentId, status: "active" });
      }
      const again = await login(STUDENT);
      assert(again?.token && (await whoAmI(again.token)) !== null, "reactivated student cannot log in");
      await clientWith().mutation(api.users.logout, { token: again.token });
      await clientWith().mutation(api.users.logout, { token: admin.token });
    });
  } else {
    console.log("SKIP  deactivation flow (set VERIFY_ADMIN_MOBILE / VERIFY_ADMIN_PASSWORD)");
  }

  if (RUN_SAFETY) {
    await check("PHQ-9 item 9 raises a suicide flag with a follow-up; emergency dismissal is recorded", async () => {
      const s = await login(STUDENT);
      assert(s?.token, s?.error || "login failed");
      const c = clientWith(s.token);
      const zeros = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), 0]));
      const phq9 = { ...zeros(9), 9: 1 };
      const submission = { responses: { phq9, gad7: zeros(7), pq16: zeros(16) }, submissionKey: `verify-${webcrypto.randomUUID()}` };
      const res = await c.mutation(api.screening.submitScreeningAttempt, submission);
      // Students receive only the presentation outcome (no ids, level or flags).
      assert(res.outcome === "immediate_safety", `outcome was ${res.outcome}`);
      assert(res.triageLevel === undefined && res.attemptId === undefined, "student response exposes clinical internals");
      assert((await c.query(api.triage.getMySafetyStatus, {}))?.crisis === true, "safety gate not raised");
      const followUps = await c.query(api.followUps.getStudentFollowUps, {});
      assert(followUps.some((f) => f.type === "screening_review" && !f.completed), "no follow-up created");
      // Retrying the same submission must not create a second attempt or alert
      const replay = await c.mutation(api.screening.submitScreeningAttempt, submission);
      assert(replay.replayed === true && replay.outcome === "immediate_safety", "retry was not de-duplicated");
      await c.mutation(api.alerts.recordEmergencyScreenDismissal, {});
      await clientWith().mutation(api.users.logout, { token: s.token });
    });
    console.log("NOTE  safety check created a real alert for the test student; resolve it in the dashboard.");
  } else {
    console.log("SKIP  safety flow (set VERIFY_SAFETY=1 on a DEV deployment; it creates real alerts)");
  }

  if (ADMIN.mobile && ADMIN.password && COUNSELLOR.mobile && COUNSELLOR.password) {
    await check("caseload authorization, My Counsellor and contact approval", async () => {
      const admin = await login(ADMIN);
      assert(admin?.token, admin?.error || "admin login failed");
      const student = await login(STUDENT);
      assert(student?.token, student?.error || "student login failed");
      const counsellor = await login(COUNSELLOR);
      assert(counsellor?.token, counsellor?.error || "counsellor login failed");
      const studentId = claimsOf(student.token).sub;
      const counsellorId = claimsOf(counsellor.token).sub;
      const asAdmin = clientWith(admin.token);
      const asStudent = clientWith(student.token);
      const asCounsellor = clientWith(counsellor.token);
      const counsellorCanRead = async () => {
        try {
          await asCounsellor.query(api.screening.getAll, { userId: studentId });
          return true;
        } catch {
          return false;
        }
      };

      const previous = await asAdmin.query(api.counsellorAssignments.getForStudent, { studentId });
      const entry = DIRECTORY_ENTRY_ID ? (await asAdmin.query(api.counsellorDirectory.listForAdmin, {})).find((e) => e._id === DIRECTORY_ENTRY_ID) : null;
      if (DIRECTORY_ENTRY_ID) assert(entry && entry.linkedAccount && String(entry.linkedAccount._id) === counsellorId, "VERIFY_DIRECTORY_ENTRY_ID is not linked to the test counsellor");
      try {
        await asAdmin.mutation(api.counsellorAssignments.unassign, { studentId });
        assert(!(await counsellorCanRead()), "counsellor can read an unassigned student's records");
        assert((await asStudent.query(api.counsellorAssignments.getMyCounsellor, {})).status === "unassigned", "student not shown as unassigned");

        await asAdmin.mutation(api.counsellorAssignments.assign, { studentId, counsellorId });
        assert(await counsellorCanRead(), "assigned counsellor cannot read the student's records");
        const mine = await asStudent.query(api.counsellorAssignments.getMyCounsellor, {});
        assert(mine.status === "assigned", `My Counsellor status is ${mine.status}`);
        const text = JSON.stringify(mine);
        assert(!text.includes(COUNSELLOR.mobile) && !text.includes(counsellorId), "student response contains login or id details");

        if (entry) {
          await asAdmin.mutation(api.counsellorDirectory.setContactVisibility, { entryId: entry._id, field: "email", visible: true });
          assert((await asStudent.query(api.counsellorAssignments.getMyCounsellor, {})).counsellor.email === (entry.email.trim() || null), "approved email not shown");
          await asAdmin.mutation(api.counsellorDirectory.setContactVisibility, { entryId: entry._id, field: "email", visible: false });
          assert((await asStudent.query(api.counsellorAssignments.getMyCounsellor, {})).counsellor.email === null, "revoked email still shown");
        }
      } finally {
        if (entry) await asAdmin.mutation(api.counsellorDirectory.setContactVisibility, { entryId: entry._id, field: "email", visible: entry.shareEmailWithStudents });
        if (previous && previous.counsellorActive) await asAdmin.mutation(api.counsellorAssignments.assign, { studentId, counsellorId: previous.counsellorId });
        else await asAdmin.mutation(api.counsellorAssignments.unassign, { studentId });
        for (const t of [student.token, counsellor.token, admin.token]) await clientWith().mutation(api.users.logout, { token: t });
      }
    });
  } else {
    console.log("SKIP  caseload flow (set VERIFY_ADMIN_* and VERIFY_COUNSELLOR_MOBILE / VERIFY_COUNSELLOR_PASSWORD)");
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Verification aborted:", e?.message || e);
  process.exit(1);
});
