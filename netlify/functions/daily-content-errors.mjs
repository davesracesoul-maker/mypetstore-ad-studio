import { getStore } from "@netlify/blobs";

export default async (request) => {
  const url = new URL(request.url);
  if (url.searchParams.get("key") !== process.env.DAILY_CONTENT_TEST_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const store = getStore("daily-content-errors");
  const { blobs } = await store.list();
  const keys = blobs.map((b) => b.key).sort().reverse().slice(0, 10);
  const errors = await Promise.all(keys.map(async (k) => ({ runKey: k, ...(await store.get(k, { type: "json" })) })));

  return new Response(JSON.stringify({ errors }), { headers: { "Content-Type": "application/json" } });
};

export const config = { path: "/api/_daily-content-errors" };
