// Convex validates student/staff JWTs against the JWKS published by convex/http.ts.
// CONVEX_SITE_URL is provided automatically by every Convex deployment.
const domain = process.env.CONVEX_SITE_URL;
if (!domain) {
  throw new Error("CONVEX_SITE_URL is not set; cannot configure authentication.");
}

export default {
  providers: [
    {
      domain,
      applicationID: "convex",
    },
  ],
};
