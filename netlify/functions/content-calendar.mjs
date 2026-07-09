import { getStore } from "@netlify/blobs";

function withFbCaption(bundle) {
  if (bundle.fbCaption || !bundle.ad) return bundle;
  // Backfill for bundles generated before fbCaption existed
  const fbCaption = [
    bundle.ad.headline,
    bundle.ad.hook,
    bundle.ad.body,
    bundle.blogUrl ? `Read more: ${bundle.blogUrl}` : "",
    bundle.product?.url ? `Shop: ${bundle.product.url}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return { ...bundle, fbCaption };
}

export default async () => {
  try {
    const store = getStore("daily-content");
    const { blobs } = await store.list();
    const keys = blobs.map((b) => b.key).sort().reverse().slice(0, 30);
    const bundles = await Promise.all(keys.map((k) => store.get(k, { type: "json" })));

    return new Response(JSON.stringify({ bundles: bundles.filter(Boolean).map(withFbCaption) }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/content-calendar" };
