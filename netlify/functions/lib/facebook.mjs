import { getStore } from "@netlify/blobs";

const API = "https://graph.facebook.com/v23.0";
const PAGE_ID = "61591504833416"; // My Pet Store

export function facebookConfigured() {
  return !!(process.env.FB_APP_ID && process.env.FB_APP_SECRET);
}

async function fbFetch(path, params = {}, { method = "GET" } = {}) {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { method });
  const raw = await res.text();
  console.log(`[facebook] ${method} ${path} status:`, res.status, "body:", raw.slice(0, 300));
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Facebook API returned non-JSON (status ${res.status}): ${raw.slice(0, 200)}`);
  }
  if (!res.ok || data.error) {
    throw new Error(`Facebook ${method} ${path} failed (status ${res.status}): ${JSON.stringify(data.error || data).slice(0, 300)}`);
  }
  return data;
}

// One-time: exchange a short-lived user token for a long-lived one, then grab the
// page's own token (non-expiring when derived from a long-lived user token)
export async function initFromUserToken(shortLivedUserToken) {
  const longLived = await fbFetch("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: process.env.FB_APP_ID,
    client_secret: process.env.FB_APP_SECRET,
    fb_exchange_token: shortLivedUserToken,
  });

  const accounts = await fbFetch("/me/accounts", { access_token: longLived.access_token });
  const pages = (accounts.data || []).map((p) => ({ id: p.id, name: p.name }));
  const page = (accounts.data || []).find((p) => p.id === PAGE_ID);
  if (!page) throw new Error(`Page ${PAGE_ID} not found among managed pages: ${JSON.stringify(pages)}`);

  const store = getStore("facebook-auth");
  await store.setJSON("tokens", {
    page_id: page.id,
    page_name: page.name,
    page_access_token: page.access_token,
    obtained_at: Date.now(),
  });
  return { page: page.name, id: page.id };
}

export async function getStoredPageToken() {
  const store = getStore("facebook-auth");
  return store.get("tokens", { type: "json" });
}

export async function createFacebookPost(bundle) {
  if (!bundle.product?.image) throw new Error("Product has no image — Facebook photo posts need one");
  const tokens = await getStoredPageToken();
  if (!tokens?.page_access_token) throw new Error("Facebook not connected — run /api/facebook-init first");

  const caption = bundle.fbCaption || [
    bundle.ad?.headline,
    bundle.ad?.hook,
    bundle.ad?.body,
    bundle.blogUrl ? `Read more: ${bundle.blogUrl}` : "",
    bundle.product?.url ? `Shop: ${bundle.product.url}` : "",
  ].filter(Boolean).join("\n\n");

  const result = await fbFetch(`/${tokens.page_id}/photos`, {
    url: bundle.product.image,
    caption,
    access_token: tokens.page_access_token,
  }, { method: "POST" });

  const postId = result.post_id || result.id;
  return { id: postId, url: `https://www.facebook.com/${postId}` };
}
