#!/usr/bin/env node
/**
 * Generates a fresh RS256 signing key for Emotify's custom authentication.
 *
 * Usage:
 *   node scripts/generate-jwt-key.mjs > /tmp/jwt.json      (keep this file private)
 *   npx convex env set JWT_PRIVATE_JWK "$(cat /tmp/jwt.json)"
 *   rm /tmp/jwt.json
 *
 * Setting a new key (new `kid`) invalidates every previously issued token, so all
 * students and staff must sign in again. Never commit the output.
 */
import { webcrypto } from "node:crypto";

const { subtle } = webcrypto;

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
process.stdout.write(JSON.stringify({ kty, kid, alg: "RS256", use: "sig", n, e, d, p, q, dp, dq, qi }));
