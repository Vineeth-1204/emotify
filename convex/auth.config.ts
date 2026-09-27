const domain = process.env.CONVEX_SITE_URL || "https://fabulous-rooster-538.convex.site";

export default {
  providers: [
    {
      domain: domain,
      applicationID: "convex",
    },
  ],
};
