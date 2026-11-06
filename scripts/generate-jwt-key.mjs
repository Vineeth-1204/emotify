#!/usr/bin/env node
/**
 * Generates a fresh RS256 signing key for Emotify's custom authentication.
 *
 * Recommended (any OS, no shell quoting involved):
 *   node scripts/generate-jwt-key.mjs --set --prod   (production deployment)
 *   node scripts/generate-jwt-key.mjs --set          (the Convex CLI's default deployment, usually dev)
 *
 * Print the key instead (bash/zsh only - PowerShell 5.1 strips the JSON quotes):
 *   node scripts/generate-jwt-key.mjs > /tmp/jwt.json      (keep this file private)
 *   npx convex env set JWT_PRIVATE_JWK "$(cat /tmp/jwt.json)"
 *   rm /tmp/jwt.json
 *
 * Setting a new key (new `kid`) invalidates every previously issued token, so all
 * students and staff must sign in again. Never commit the output.
 */
import { webcrypto } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { subtle } = webcrypto;

const args = process.argv.slice(2);
const KNOWN_FLAGS = new Set(["--set", "--prod"]);
const unknown = args.filter((a) => !KNOWN_FLAGS.has(a));
const setMode = args.includes("--set");
const prod = args.includes("--prod");

if (unknown.length > 0 || (prod && !setMode)) {
  console.error(
    "Usage: node scripts/generate-jwt-key.mjs [--set [--prod]]\n" +
      "  (no flags)    print a new private JWK to stdout\n" +
      "  --set         set JWT_PRIVATE_JWK on the Convex CLI's default deployment\n" +
      "  --set --prod  set JWT_PRIVATE_JWK on the production deployment"
  );
  process.exit(2);
}

const keyPair = await subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"]
);

const jwk = await subtle.exportKey("jwk", keyPair.privateKey);
const kid = `emotify-${new Date().toISOString().slice(0, 10)}-${webcrypto.randomUUID().slice(0, 8)}`;

const { kty, n, e, d, p, q, dp, dq, qi } = jwk;
const serialized = JSON.stringify({ kty, kid, alg: "RS256", use: "sig", n, e, d, p, q, dp, dq, qi });

if (!setMode) {
  process.stdout.write(serialized);
} else {
  setOnDeployment();
}

function setOnDeployment() {
  // --set: hand the key to the Convex CLI as a single argv entry. The CLI's JS entry
  // point is run with this Node binary (no shell, no npx.cmd), so the JSON reaches
  // `convex env set` byte-for-byte on every OS.
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const convexCli = fileURLToPath(new URL("../node_modules/convex/bin/main.js", import.meta.url));
  if (!existsSync(convexCli)) {
    console.error("Convex CLI not found at node_modules/convex. Run `npm install` first.");
    process.exit(1);
  }

  const target = prod ? "the production deployment" : "the Convex CLI's default deployment";
  const cliArgs = ["env", "set", ...(prod ? ["--prod"] : []), "JWT_PRIVATE_JWK", serialized];
  const secrets = [serialized, d, p, q, dp, dq, qi];
  const redact = (text) => secrets.reduce((out, s) => out.split(s).join("<redacted>"), String(text ?? ""));

  try {
    execFileSync(process.execPath, [convexCli, ...cliArgs], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
  } catch (err) {
    console.error(`Failed to set JWT_PRIVATE_JWK on ${target}. Nothing was printed from the key.`);
    const detail = redact(`${err.stderr || ""}${err.stdout || ""}`).trim() || redact(err.message);
    if (detail) console.error(detail);
    process.exit(1);
  }

  console.log(`JWT_PRIVATE_JWK was set on ${target} (new public key id: ${kid}).`);
}
