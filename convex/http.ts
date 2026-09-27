import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { STATIC_JWK_PUBLIC } from "./authHelpers";

const http = httpRouter();

// CORS Headers helper
function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };
}

// OIDC Metadata
http.route({
  path: "/.well-known/openid-configuration",
  method: "GET",
  handler: httpAction(async (_ctx, _req) => {
    const siteUrl = (globalThis as any).process?.env?.CONVEX_SITE_URL || "https://fabulous-rooster-538.convex.site";
    const body = {
      issuer: siteUrl,
      jwks_uri: `${siteUrl}/.well-known/jwks.json`,
      authorization_endpoint: `${siteUrl}/oauth/authorize`,
      token_endpoint: `${siteUrl}/oauth/token`,
      userinfo_endpoint: `${siteUrl}/oauth/userinfo`,
      response_types_supported: ["code", "token", "id_token"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: getCorsHeaders(),
    });
  }),
});

// JWKS Public Keys (uses hardcoded static public key)
http.route({
  path: "/.well-known/jwks.json",
  method: "GET",
  handler: httpAction(async (_ctx, _req) => {
    const body = {
      keys: [STATIC_JWK_PUBLIC],
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: getCorsHeaders(),
    });
  }),
});

export default http;
