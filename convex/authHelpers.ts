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

export const STATIC_JWK_PUBLIC = {
  "kty": "RSA",
  "n": "0CmBQeFhFsxN4MTkynWRuJbTbBfOk-OJvUAAkPWx55lmr8CqRevedNW2FPFeroB4VZMzMGyORXtfNvTvNWfCgAIdVDWiRfrg21JLf4tk-mirzz0cr2QbOJ6nb4srTDyVxKz6ukvPESNJEitA0EBo5o_e1zWsd1aXcAAH60aN-z_YextzVH9cGMb5RxHPS7ON-nCGLPMkbMgsLvC5fK3N-rt2-N-sjqNFtIhwo6ZLbsas7BmpjTAqDvB8NJQRxVNku6h2JBFf92NppafIcjICEvX5HAwXd_ozLIvqPHrjGGXTyA9VPNJ3EuR451RIZztKnCTY1wxaYqZGRm2c3sV0cQ",
  "e": "AQAB",
  "kid": "static-key-1",
  "alg": "RS256",
  "use": "sig"
};

const STATIC_JWK_PRIVATE = {
  "kty": "RSA",
  "n": "0CmBQeFhFsxN4MTkynWRuJbTbBfOk-OJvUAAkPWx55lmr8CqRevedNW2FPFeroB4VZMzMGyORXtfNvTvNWfCgAIdVDWiRfrg21JLf4tk-mirzz0cr2QbOJ6nb4srTDyVxKz6ukvPESNJEitA0EBo5o_e1zWsd1aXcAAH60aN-z_YextzVH9cGMb5RxHPS7ON-nCGLPMkbMgsLvC5fK3N-rt2-N-sjqNFtIhwo6ZLbsas7BmpjTAqDvB8NJQRxVNku6h2JBFf92NppafIcjICEvX5HAwXd_ozLIvqPHrjGGXTyA9VPNJ3EuR451RIZztKnCTY1wxaYqZGRm2c3sV0cQ",
  "e": "AQAB",
  "d": "GFA8vXvsaewHjaEZww8L6_ZL8ARw18O8LxtmZYgZFT7M6GrVyJB1_YoHuDcAEtxFEeO9VyLa1EFGfAYMWZ3KsUZt9AvGritRL7TTRiy7KOdoZ-6QpujHqCuZzXTBJCiwapY0u-VGZI9NRd7A9YIMbp-vzM3DXPYDfqy2QBQP2eBjYvtdyrE34OK4HsiHnR7xctqPhD_gc2ZZJgGpgJQuujuY5FOK94ZGzWQT8eNrwHkbkXM-jBwqxN5x9XeyXkbv-d_0PC-5vOq4KIl1gImfqsCwuPCEKoUwJovPn0-MXIuocPsytaZx7g22lkqOX-fWQ6dRoH4QsBQ-Di-FkOmydQ",
  "p": "95GpuEZhAvuhDKFHTc2-ZevWF1vdP1RnfIBdJpH1DORvKJEvfn2zW_t4s1K-gjjgwH6siSa_ydgZbtj_ueyguCZ8XEcfdrK1KrgS6fQIrRr-gQ8poHpLgXGinInvCPGU-0GQ9nsKBhc-z96tmDAI9HLxIMja-1zTk8FrOlljH20",
  "q": "10BJu1IbwP5cPpVmGIZ1bQYd4LBqPZOwlsnMGeLMPc7tdx3OSStw8Wagtpp6DcofnKE8d3dcylysiOiUW2RwWP9bZyMvf-I7wA1oQSRrqOpX4wOr35vS6FoWANDMZFYNxYQ9arnzuyKaj47nh4IPiqAbWsFGdaJKL4qVWe_IkpU",
  "dp": "OukrlNEShq4wDZxXJll-JCyxfk9633YLRiIZiHMU9-Nn3CRoQ9ZPluTJPQrEkKJOQSAjmGNjIfnNW4ZBnBGF0Sw_TYoTH6C44Zh5z7glVGPnCfj8s9ZGH2BWDJ_6BIvQItXgU_bFVNu1M6vObTeI-fpcDKwfB893_WH6TSE2KCU",
  "dq": "OXD1fCCYOXNniGfz-9193p9AP-K0J0SPXl3xsoK8gE4FPsFceFg4ZqM9hh1JLv7eWr0IVtUqlPIQNOTkGlN-S7GxYZ-ZIGZuDX1GcgPXGxeWZoVnS1_Y85p-vq75rFjuieQVQ7Ll4O2GE4NOM_I4VYUOZ7SmKeQqKe-wlXSQsNU",
  "qi": "h44j-C7mq4934QLzhs4jiEJDHHRgn7342Wszhit69TMvcQWkF1SYVV1lAYqGRWY96QqhlLK_AdVB6kN5eOewD92pK4w66OhUGrJfM37Vx8ib_IG0ga8fWekdgXvsWl8fzV--KoLahV-opYU5zo1dYPYdBUhw88MbOwM9ndqZu04",
  "kid": "static-key-1",
  "alg": "RS256",
  "use": "sig"
};

// Sign a JWT token using RS256 and hardcoded private key (expires in 30 days)
export async function signJwt(
  payload: { sub: string; role: string; mobile_number: string; full_name: string }
): Promise<string> {
  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: "static-key-1",
  };

  const convexSiteUrl = (globalThis as any).process?.env?.CONVEX_SITE_URL || "https://fabulous-rooster-538.convex.site";

  const enrichedPayload = {
    ...payload,
    iss: convexSiteUrl,
    aud: "convex",
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days expiry
    iat: Math.floor(Date.now() / 1000),
  };

  const headerEncoded = base64urlEncode(JSON.stringify(header));
  const payloadEncoded = base64urlEncode(JSON.stringify(enrichedPayload));
  const dataToSign = `${headerEncoded}.${payloadEncoded}`;

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    STATIC_JWK_PRIVATE,
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

// Hash password with bcryptjs
export async function hashPassword(password: string): Promise<string> {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(password, salt);
}

// Verify password with bcryptjs
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compareSync(password, hash);
}
