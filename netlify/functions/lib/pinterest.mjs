import { getStore } from "@netlify/blobs";
import { withUtm } from "./utm.mjs";

// Trial-access apps may only create pins via the sandbox API (Pinterest error
// code 29 in production). Set PINTEREST_SANDBOX=1 until standard access is
// granted, then remove it and re-run /api/pinterest-connect — the OAuth token
// exchange also happens against the selected host, and tokens from one
// environment are not valid in the other.
const API = process.env.PINTEREST_SANDBOX === "1" ? "https://api-sandbox.pinterest.com/v5" : "https://api.pinterest.com/v5";

function basicAuth() {
  return "Basic " + Buffer.from(`${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`).toString("base64");
}

export function pinterestConfigured() {
  return !!(process.env.PINTEREST_APP_ID && process.env.PINTEREST_APP_SECRET);
}

export async function getStoredTokens() {
  const store = getStore("pinterest-auth");
  return store.get("tokens", { type: "json" });
}

export async function exchangeAndStore(params) {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Pinterest token exchange failed (status ${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  const store = getStore("pinterest-auth");
  const prev = await store.get("tokens", { type: "json" });
  const tokens = {
    access_token: data.access_token,
    // Refresh responses may omit the refresh token — keep the previous one then
    refresh_token: data.refresh_token || prev?.refresh_token || null,
    access_expires_at: Date.now() + (data.expires_in || 2592000) * 1000,
  };
  await store.setJSON("tokens", tokens);
  return tokens;
}

async function getAccessToken() {
  let tokens = await getStoredTokens();
  if (!tokens?.access_token) throw new Error("Pinterest not connected — open /api/pinterest-connect first");
  if (tokens.access_expires_at - Date.now() < 24 * 3600 * 1000) {
    if (!tokens.refresh_token) throw new Error("Pinterest access token expired and no refresh token stored — reconnect via /api/pinterest-connect");
    console.log("[pinterest] refreshing access token");
    tokens = await exchangeAndStore({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
  }
  return tokens.access_token;
}

async function api(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  console.log(`[pinterest] ${method} ${path} status:`, res.status, "body:", raw.slice(0, 300));
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw: raw.slice(0, 200) };
  }
  if (!res.ok) throw new Error(`Pinterest ${method} ${path} failed (status ${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function findOrCreateBoard(token) {
  // Board names are unique account-wide, but sandbox can't see (or pin to)
  // production boards — so sandbox mode needs its own board name.
  const name =
    process.env.PINTEREST_BOARD_NAME ||
    (process.env.PINTEREST_SANDBOX === "1" ? "MyPetStore Sandbox Finds" : "MyPetStore Daily Finds");
  const boards = await api(token, "GET", "/boards?page_size=100");
  const found = (boards.items || []).find((b) => b.name.toLowerCase() === name.toLowerCase());
  if (found) return found.id;
  console.log("[pinterest] creating board:", name);
  const created = await api(token, "POST", "/boards", {
    name,
    description: "Daily featured products from mypetstore.shop",
  });
  return created.id;
}

// Pinterest is a search engine — pick a few relevant hashtags from the product
// so pins surface for category searches, on top of the keyword-rich title/desc.
function pinHashtags(text) {
  const t = (text || "").toLowerCase();
  const map = [
    ["dog", "#dogs"],
    ["puppy", "#puppylove"],
    ["cat", "#cats"],
    ["kitten", "#kittens"],
    ["treat", "#dogtreats"],
    ["chew", "#dogtoys"],
    ["toy", "#pettoys"],
    ["bed", "#petbeds"],
    ["groom", "#petgrooming"],
    ["leash", "#dogwalking"],
    ["collar", "#dogaccessories"],
    ["harness", "#dogaccessories"],
    ["litter", "#catsupplies"],
    ["carrier", "#pettravel"],
    ["stroller", "#pettravel"],
    ["feeder", "#petcare"],
    ["bowl", "#petcare"],
  ];
  const tags = new Set(["#mypetstore", "#petsupplies"]);
  for (const [kw, tag] of map) if (t.includes(kw)) tags.add(tag);
  return [...tags].slice(0, 7).join(" ");
}

// Keyword-rich, search-friendly title + description. Lead with the product name
// (which carries the searchable keywords), then the ad copy, a CTA, and hashtags.
function buildPinContent(bundle) {
  const name = bundle.product?.name || "";
  const title = (name || bundle.ad?.headline || "").slice(0, 100);
  const copy = [bundle.ad?.headline, bundle.ad?.hook, bundle.ad?.body].filter(Boolean).join(" ");
  const hashtags = pinHashtags(`${name} ${bundle.ad?.body || ""}`);
  const description = [copy, "🛍️ Shop now at mypetstore.shop", hashtags]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 800);
  return { title, description };
}

export async function createDailyPin(bundle) {
  if (!bundle.product?.image) throw new Error("Product has no image — Pinterest pins require one");
  const token = await getAccessToken();
  const boardId = await findOrCreateBoard(token);

  // Route the product photo through the 2:3 vertical relay so pins are tall
  // (1000x1500) — Pinterest's preferred, higher-engagement format. Pre-warm it
  // so Pinterest's image fetch hits the durable CDN cache instantly.
  const siteUrl = process.env.URL || "https://mypetstore-ad-studio.netlify.app";
  const pinImageUrl = `${siteUrl}/api/pin-img?src=${encodeURIComponent(bundle.product.image)}`;
  let mediaUrl = pinImageUrl;
  try {
    const warm = await fetch(pinImageUrl);
    console.log("[pinterest] pin image relay pre-warm status:", warm.status);
    if (!warm.ok) throw new Error(`relay returned ${warm.status}`);
    await warm.arrayBuffer();
  } catch (err) {
    // Fall back to the raw product image rather than failing the whole pin
    console.error("[pinterest] pin image relay pre-warm failed, using raw image:", err.message);
    mediaUrl = bundle.product.image;
  }

  const { title, description } = buildPinContent(bundle);
  const pin = await api(token, "POST", "/pins", {
    board_id: boardId,
    title,
    description,
    link: withUtm(bundle.product?.url, "pinterest"),
    media_source: { source_type: "image_url", url: mediaUrl },
  });
  return { id: pin.id, url: `https://www.pinterest.com/pin/${pin.id}/` };
}
