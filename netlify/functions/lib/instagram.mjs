import { getStore } from "@netlify/blobs";

const API = "https://graph.instagram.com/v25.0";

export function instagramConfigured() {
  return !!process.env.INSTAGRAM_ACCESS_TOKEN;
}

async function igFetch(token, path, { method = "GET", params = {} } = {}) {
  const url = new URL(`${API}${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { method });
  const raw = await res.text();
  console.log(`[instagram] ${method} ${path} status:`, res.status, "body:", raw.slice(0, 300));
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Instagram API returned non-JSON (status ${res.status}): ${raw.slice(0, 200)}`);
  }
  if (!res.ok || data.error) {
    const err = new Error(`Instagram ${method} ${path} failed (status ${res.status}): ${JSON.stringify(data.error || data).slice(0, 300)}`);
    err.igCode = data.error?.code;
    throw err;
  }
  return data;
}

async function getToken() {
  const store = getStore("instagram-auth");
  let stored = await store.get("token", { type: "json" });

  // A rotated env var seed replaces whatever we had stored
  if (!stored || stored.seed !== process.env.INSTAGRAM_ACCESS_TOKEN) {
    stored = { access_token: process.env.INSTAGRAM_ACCESS_TOKEN, seed: process.env.INSTAGRAM_ACCESS_TOKEN, obtained_at: Date.now() };
    await store.setJSON("token", stored);
  }

  // Long-lived tokens last 60 days; refresh monthly (token must be >24h old to refresh)
  const ageDays = (Date.now() - stored.obtained_at) / 86400000;
  if (ageDays > 30) {
    try {
      const data = await igFetch(stored.access_token, "/refresh_access_token", { params: { grant_type: "ig_refresh_token" } });
      stored = { access_token: data.access_token, seed: stored.seed, obtained_at: Date.now() };
      await store.setJSON("token", stored);
      console.log("[instagram] refreshed long-lived token");
    } catch (err) {
      console.error("[instagram] token refresh failed, continuing with current token:", err.message);
    }
  }
  return stored.access_token;
}

function buildCaption(bundle) {
  const parts = [
    bundle.ad?.headline,
    bundle.ad?.hook,
    bundle.ad?.body,
    bundle.product?.url ? `🛒 Shop: ${bundle.product.url}` : "",
    "#pets #petsupplies #mypetstore",
  ].filter(Boolean);
  return parts.join("\n\n").slice(0, 2200);
}

export async function createInstagramPost(bundle) {
  if (!bundle.product?.image) throw new Error("Product has no image — Instagram posts require one");
  const token = await getToken();

  const me = await igFetch(token, "/me", { params: { fields: "user_id,username" } });
  const igUserId = me.user_id || me.id;

  const container = await igFetch(token, `/${igUserId}/media`, {
    method: "POST",
    params: { image_url: bundle.product.image, caption: buildCaption(bundle) },
  });

  const published = await igFetch(token, `/${igUserId}/media_publish`, {
    method: "POST",
    params: { creation_id: container.id },
  });

  let permalink = "";
  try {
    const media = await igFetch(token, `/${published.id}`, { params: { fields: "permalink" } });
    permalink = media.permalink || "";
  } catch {
    // permalink is cosmetic — the post is already live
  }
  return { id: published.id, url: permalink || `https://www.instagram.com/` };
}
