// Appends UTM parameters to a storefront URL so Shopify can attribute the
// resulting session/order to the channel that posted it. Without these, every
// pipeline link lands as "direct"/blank referrer and sales can't be traced back
// to TikTok/Pinterest/Facebook/etc.
export function withUtm(url, source, campaign = "daily-content") {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", source);
    u.searchParams.set("utm_medium", "social");
    u.searchParams.set("utm_campaign", campaign);
    return u.toString();
  } catch {
    return url; // never let a malformed URL break a post
  }
}
