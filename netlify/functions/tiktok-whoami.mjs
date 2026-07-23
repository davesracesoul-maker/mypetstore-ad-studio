import { getStore } from "@netlify/blobs";

// One-off diagnostic: which TikTok account is actually connected right now?
export default async (request) => {
  const url = new URL(request.url);
  if (url.searchParams.get("key") !== process.env.DAILY_CONTENT_TEST_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const store = getStore("tiktok-auth");
  const tokens = await store.get("tokens", { type: "json" });
  if (!tokens?.access_token) {
    return new Response(JSON.stringify({ error: "TikTok not connected" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const res = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username",
    { headers: { Authorization: `Bearer ${tokens.access_token}` } }
  );
  const data = await res.json().catch(() => ({}));
  return new Response(JSON.stringify({ status: res.status, data }), { headers: { "Content-Type": "application/json" } });
};

export const config = { path: "/api/_tiktok-whoami" };
