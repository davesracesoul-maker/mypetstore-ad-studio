import { getStore } from "@netlify/blobs";

const API = "https://open.tiktokapis.com/v2";

export function tiktokConfigured() {
  return !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
}

export async function getStoredTokens() {
  const store = getStore("tiktok-auth");
  return store.get("tokens", { type: "json" });
}

export async function exchangeAndStore(params) {
  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      ...params,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`TikTok token exchange failed (status ${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  const store = getStore("tiktok-auth");
  const prev = await store.get("tokens", { type: "json" });
  const now = Date.now();
  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || prev?.refresh_token || null,
    open_id: data.open_id || prev?.open_id || null,
    access_expires_at: now + (data.expires_in || 86400) * 1000,
  };
  await store.setJSON("tokens", tokens);
  return tokens;
}

async function getAccessToken() {
  let tokens = await getStoredTokens();
  if (!tokens?.access_token) throw new Error("TikTok not connected — open /api/tiktok-connect first");
  if (tokens.access_expires_at - Date.now() < 3600 * 1000) {
    if (!tokens.refresh_token) throw new Error("TikTok access token expired and no refresh token stored — reconnect via /api/tiktok-connect");
    console.log("[tiktok] refreshing access token");
    tokens = await exchangeAndStore({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
  }
  return tokens.access_token;
}

async function api(token, path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  console.log(`[tiktok] POST ${path} status:`, res.status, "body:", raw.slice(0, 400));
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`TikTok API returned non-JSON (status ${res.status}): ${raw.slice(0, 200)}`);
  }
  const errCode = data.error?.code;
  if (!res.ok || (errCode && errCode !== "ok")) {
    throw new Error(`TikTok ${path} failed (status ${res.status}): ${JSON.stringify(data.error || data).slice(0, 300)}`);
  }
  return data.data;
}

export async function createTikTokPhotoPost(bundle) {
  if (!bundle.product?.image) throw new Error("Product has no image — TikTok photo posts require one");
  const token = await getAccessToken();

  // TikTok only pulls images from our verified domain, so relay Shopify CDN images through it
  const siteUrl = process.env.URL || "https://mypetstore-ad-studio.netlify.app";
  const imageUrl = `${siteUrl}/api/img?src=${encodeURIComponent(bundle.product.image)}`;

  const title = (bundle.ad?.headline || bundle.product?.name || "").slice(0, 90);
  const description = [
    bundle.ad?.hook,
    bundle.ad?.body,
    "Shop at mypetstore.shop 🐾",
    "#pets #petsupplies #dogsoftiktok #petfinds",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000);

  // MEDIA_UPLOAD sends the post to the account's TikTok inbox/drafts for one-tap
  // publishing. Direct post (DIRECT_POST + video.publish scope) requires passing
  // TikTok's audit — switch post_mode back once approved.
  const result = await api(token, "/post/publish/content/init/", {
    post_info: {
      title,
      description,
    },
    source_info: {
      source: "PULL_FROM_URL",
      photo_cover_index: 0,
      photo_images: [imageUrl],
    },
    post_mode: "MEDIA_UPLOAD",
    media_type: "PHOTO",
  });

  return { publishId: result.publish_id, privacy: "DRAFT" };
}
