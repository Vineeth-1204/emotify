import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { getPublicJwk, getJwtIssuer } from "./authHelpers";
import { getAvatarBytes } from "./avatarMedia";

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
    const siteUrl = getJwtIssuer();
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

// JWKS: public half of the JWT_PRIVATE_JWK signing key (500 if the key is not configured)
http.route({
  path: "/.well-known/jwks.json",
  method: "GET",
  handler: httpAction(async (_ctx, _req) => {
    let body;
    try {
      body = { keys: [getPublicJwk()] };
    } catch (err) {
      console.error("JWKS unavailable:", err);
      return new Response(JSON.stringify({ error: "Signing key not configured" }), {
        status: 500,
        headers: getCorsHeaders(),
      });
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: getCorsHeaders(),
    });
  }),
});

function avatarResponse(character: "boy" | "girl"): Response {
  const bytes = getAvatarBytes(character);
  if (!bytes) {
    return new Response(JSON.stringify({ error: "Avatar not found" }), {
      status: 404,
      headers: getCorsHeaders(),
    });
  }
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// Notification avatar delivery for boy and girl Emotify characters
http.route({
  path: "/api/avatar/boy",
  method: "GET",
  handler: httpAction(async () => avatarResponse("boy")),
});

http.route({
  path: "/api/avatar/boy.jpg",
  method: "GET",
  handler: httpAction(async () => avatarResponse("boy")),
});

http.route({
  path: "/api/avatar/girl",
  method: "GET",
  handler: httpAction(async () => avatarResponse("girl")),
});

http.route({
  path: "/api/avatar/girl.jpg",
  method: "GET",
  handler: httpAction(async () => avatarResponse("girl")),
});

export default http;
