import bcrypt from "bcryptjs";

// Base64url utilities
export function base64urlEncode(strOrBuffer: string | ArrayBuffer): string {
  let binary = "";
  if (typeof strOrBuffer === "string") {
    const bytes = new TextEncoder().encode(strOrBuffer);
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
  } else {
    const bytes = new Uint8Array(strOrBuffer);
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
  }
  return btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * JWT signing key management.
 *
 * The RS256 private key is NEVER stored in source code. It is read from the
 * Convex environment variable `JWT_PRIVATE_JWK` (a JSON Web Key containing the
 * private RSA parameters and a `kid`). Generate one with
 * `node scripts/generate-jwt-key.mjs` and set it with `npx convex env set`.
 * The public half is derived from it and served at /.well-known/jwks.json.
 * Rotating the key (new `kid`) invalidates every previously issued token.
 */

export const JWT_ALGORITHM = "RS256";
export const JWT_AUDIENCE = "convex";
export const JWT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

interface RsaPrivateJwk {
  kty: "RSA";
  kid: string;
  n: string;
  e: string;
  d: string;
  p: string;
  q: string;
  dp: string;
  dq: string;
  qi: string;
}

export interface PublicJwk {
  kty: "RSA";
  kid: string;
  n: string;
  e: string;
  alg: typeof JWT_ALGORITHM;
  use: "sig";
}

function loadPrivateJwk(): RsaPrivateJwk {
  const raw = process.env.JWT_PRIVATE_JWK;
  if (!raw) {
    throw new Error("Server misconfiguration: JWT_PRIVATE_JWK is not set.");
  }
  let jwk: any;
  try {
    jwk = JSON.parse(raw);
  } catch {
    throw new Error("Server misconfiguration: JWT_PRIVATE_JWK is not valid JSON.");
  }
  const required = ["kid", "n", "e", "d", "p", "q", "dp", "dq", "qi"];
  if (jwk?.kty !== "RSA" || required.some((k) => typeof jwk[k] !== "string" || jwk[k].length === 0)) {
    throw new Error("Server misconfiguration: JWT_PRIVATE_JWK must be a complete RSA private JWK with a kid.");
  }
  return jwk as RsaPrivateJwk;
}

/** Public signing key derived from the configured private key (safe to publish). */
export function getPublicJwk(): PublicJwk {
  const { kid, n, e } = loadPrivateJwk();
  return { kty: "RSA", kid, n, e, alg: JWT_ALGORITHM, use: "sig" };
}

/** Token issuer. Must match the domain configured in auth.config.ts. */
export function getJwtIssuer(): string {
  const siteUrl = process.env.CONVEX_SITE_URL;
  if (!siteUrl) {
    throw new Error("Server misconfiguration: CONVEX_SITE_URL is not available.");
  }
  return siteUrl;
}

// Sign a JWT with the configured RS256 key (expires in 30 days)
export async function signJwt(
  payload: { sub: string; sid: string; role: string; mobile_number: string; full_name: string }
): Promise<string> {
  const jwk = loadPrivateJwk();
  const header = {
    alg: JWT_ALGORITHM,
    typ: "JWT",
    kid: jwk.kid,
  };

  const nowSeconds = Math.floor(Date.now() / 1000);
  const enrichedPayload = {
    ...payload,
    iss: getJwtIssuer(),
    aud: JWT_AUDIENCE,
    exp: nowSeconds + JWT_TTL_SECONDS,
    iat: nowSeconds,
  };

  const headerEncoded = base64urlEncode(JSON.stringify(header));
  const payloadEncoded = base64urlEncode(JSON.stringify(enrichedPayload));
  const dataToSign = `${headerEncoded}.${payloadEncoded}`;

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      d: jwk.d,
      p: jwk.p,
      q: jwk.q,
      dp: jwk.dp,
      dq: jwk.dq,
      qi: jwk.qi,
      alg: JWT_ALGORITHM,
    },
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: { name: "SHA-256" },
    },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(dataToSign)
  );

  const signatureEncoded = base64urlEncode(signatureBuffer);
  return `${dataToSign}.${signatureEncoded}`;
}

/**
 * Reads the `sid` claim from a token WITHOUT verifying its signature.
 * Only use it on a token that was already matched against a stored session row.
 */
export function readUnverifiedSessionId(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
    const payload = JSON.parse(json);
    return typeof payload?.sid === "string" ? payload.sid : null;
  } catch {
    return null;
  }
}

// Generate a cryptographically random temporary password (shown once, never stored in plain text)
export function generateTemporaryPassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

// Hash password with bcryptjs
export async function hashPassword(password: string): Promise<string> {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(password, salt);
}

// Verify password with bcryptjs
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compareSync(password, hash);
}
