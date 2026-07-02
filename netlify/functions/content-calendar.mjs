import { getStore } from "@netlify/blobs";

export default async () => {
  try {
    const store = getStore("daily-content");
    const { blobs } = await store.list();
    const keys = blobs.map((b) => b.key).sort().reverse().slice(0, 30);
    const bundles = await Promise.all(keys.map((k) => store.get(k, { type: "json" })));

    return new Response(JSON.stringify({ bundles: bundles.filter(Boolean) }), {
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
