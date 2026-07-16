import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import { pinterestConfigured, getStoredTokens, createDailyPin } from "./pinterest.mjs";
import { instagramConfigured, createInstagramPost } from "./instagram.mjs";
import { tiktokConfigured, getStoredTokens as getTikTokTokens, createTikTokPhotoPost } from "./tiktok.mjs";
import { facebookConfigured, getStoredPageToken, createFacebookPost } from "./facebook.mjs";

async function getShopifyAccessToken(domain) {
  const tokenUrl = `https://${domain}/admin/oauth/access_token`;
  console.log("[daily-content] requesting Shopify token from", tokenUrl, "clientId set:", !!process.env.SHOPIFY_CLIENT_ID, "clientSecret set:", !!process.env.SHOPIFY_CLIENT_SECRET);
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
    }),
  });
  const raw = await res.text();
  console.log("[daily-content] Shopify token response status:", res.status, "body:", raw.slice(0, 500));
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Shopify token endpoint returned non-JSON (status ${res.status}): ${raw.slice(0, 200)}`);
  }
  if (!data.access_token) throw new Error(`Shopify token exchange failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function shopifyGraphQL(token, query, variables) {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const res = await fetch(`https://${domain}/admin/api/2025-10/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const rawBody = await res.text();
  console.log("[daily-content] Shopify GraphQL response status:", res.status, "body:", rawBody.slice(0, 500));
  let data;
  try {
    data = JSON.parse(rawBody);
  } catch {
    throw new Error(`Shopify GraphQL endpoint returned non-JSON (status ${res.status}): ${rawBody.slice(0, 200)}`);
  }
  if (data.errors) throw new Error(`Shopify API error: ${JSON.stringify(data.errors)}`);
  return data.data;
}

async function fetchShopifyProduct(token, rotationIndex) {
  const query = `
    query {
      products(first: 50, query: "status:active") {
        edges {
          node {
            title
            handle
            description
            featuredMedia { preview { image { url } } }
            priceRangeV2 { minVariantPrice { amount currencyCode } }
          }
        }
      }
    }
  `;
  const data = await shopifyGraphQL(token, query);

  const products = (data?.products?.edges || []).map((e) => e.node);
  if (!products.length) throw new Error("No active products found in Shopify store");

  const index = rotationIndex % products.length;
  const p = products[index];
  return {
    name: p.title,
    desc: (p.description || "").slice(0, 400),
    price: p.priceRangeV2?.minVariantPrice ? `$${p.priceRangeV2.minVariantPrice.amount}` : "",
    url: `https://mypetstore.shop/products/${p.handle}`,
    image: p.featuredMedia?.preview?.image?.url || "",
  };
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inlineFormat(s) {
  return escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function blogTextToHtml(blogPost, product) {
  const lines = (blogPost || "").split("\n");
  let title = "";
  if (lines[0] && lines[0].startsWith("TITLE:")) {
    title = lines.shift().replace(/^TITLE:\s*/, "").replace(/\*\*/g, "").trim();
  }
  const parts = [];
  let list = null;
  const flushList = () => {
    if (list) {
      parts.push(`<ul>${list.join("")}</ul>`);
      list = null;
    }
  };
  for (const line of lines) {
    const t = line.trim();
    if (!t) { flushList(); continue; }
    if (t.startsWith("- ")) {
      list = list || [];
      list.push(`<li>${inlineFormat(t.slice(2))}</li>`);
      continue;
    }
    flushList();
    if (t.startsWith("#")) {
      parts.push(`<h2>${inlineFormat(t.replace(/^#+\s*/, ""))}</h2>`);
      continue;
    }
    const headingMatch = t.match(/^\*\*(.+)\*\*:?$/);
    if (headingMatch) {
      parts.push(`<h3>${inlineFormat(headingMatch[1])}</h3>`);
      continue;
    }
    parts.push(`<p>${inlineFormat(t)}</p>`);
  }
  flushList();

  let html = "";
  if (product?.image) {
    html += `<p><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" style="max-width:100%;border-radius:8px;" /></p>\n`;
  }
  html += parts.join("\n");
  if (product?.url) {
    const priceTag = product.price ? ` — ${escapeHtml(product.price)}` : "";
    html += `\n<p><strong><a href="${escapeHtml(product.url)}">Shop the ${escapeHtml(product.name)}${priceTag} →</a></strong></p>`;
  }
  return { title: title || product?.name || "From MyPetStore", html };
}

async function publishBlogArticle(token, bundle) {
  const blogsData = await shopifyGraphQL(token, `query { blogs(first: 1) { edges { node { id handle } } } }`);
  const blog = blogsData?.blogs?.edges?.[0]?.node;
  if (!blog) throw new Error("No blog found on the store");

  const { title, html } = blogTextToHtml(bundle.blogPost, bundle.product);
  const data = await shopifyGraphQL(
    token,
    `mutation CreateArticle($article: ArticleCreateInput!) {
      articleCreate(article: $article) {
        article { id handle }
        userErrors { field message }
      }
    }`,
    {
      article: {
        blogId: blog.id,
        title,
        body: html,
        isPublished: true,
        tags: ["daily-content"],
        author: { name: "MyPetStore" },
      },
    }
  );
  const userErrors = data?.articleCreate?.userErrors;
  if (userErrors?.length) throw new Error(`articleCreate failed: ${JSON.stringify(userErrors)}`);
  const article = data.articleCreate.article;
  return { id: article.id, url: `https://mypetstore.shop/blogs/${blog.handle}/${article.handle}` };
}

function pctEncode(s) {
  return encodeURIComponent(s).replace(/[!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function oauth1Header(method, url, consumerKey, consumerSecret, token, tokenSecret) {
  const params = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: "1.0",
  };
  // JSON request bodies are not part of the OAuth 1.0a signature base string
  const paramStr = Object.keys(params).sort().map((k) => `${pctEncode(k)}=${pctEncode(params[k])}`).join("&");
  const baseStr = [method.toUpperCase(), pctEncode(url), pctEncode(paramStr)].join("&");
  const signingKey = `${pctEncode(consumerSecret)}&${pctEncode(tokenSecret)}`;
  params.oauth_signature = crypto.createHmac("sha1", signingKey).update(baseStr).digest("base64");
  return "OAuth " + Object.keys(params).sort().map((k) => `${pctEncode(k)}="${pctEncode(params[k])}"`).join(", ");
}

function buildTweetText(bundle) {
  const link = bundle.product?.url || "https://mypetstore.shop";
  const headline = (bundle.ad?.headline || "").trim();
  const hook = (bundle.ad?.hook || "").trim();
  // t.co wraps every link at 23 chars, +1 for the newline before it
  const budget = 280 - 24;
  let text = [headline, hook].filter(Boolean).join("\n\n");
  if (!text) text = bundle.product?.name || "New at MyPetStore";
  if (text.length > budget) {
    text = hook && hook.length <= budget ? hook : text.slice(0, budget - 1) + "…";
  }
  return `${text}\n${link}`;
}

function xConfigured() {
  return !!(process.env.X_API_KEY && process.env.X_API_SECRET && process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_TOKEN_SECRET);
}

async function postToX(bundle) {
  const url = "https://api.twitter.com/2/tweets";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: oauth1Header("POST", url, process.env.X_API_KEY, process.env.X_API_SECRET, process.env.X_ACCESS_TOKEN, process.env.X_ACCESS_TOKEN_SECRET),
    },
    body: JSON.stringify({ text: buildTweetText(bundle) }),
  });
  const raw = await res.text();
  console.log("[daily-content] X post response status:", res.status, "body:", raw.slice(0, 300));
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`X API returned non-JSON (status ${res.status}): ${raw.slice(0, 200)}`);
  }
  if (!res.ok || !data.data?.id) throw new Error(`X post failed (status ${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  return { id: data.data.id, url: `https://x.com/i/status/${data.data.id}` };
}

async function askClaude(prompt, maxTokens) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Anthropic API error: ${data.error.message || JSON.stringify(data.error)}`);
  const text = data.content?.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("No content returned from Claude");
  return text.trim();
}

// The pipeline runs twice a day (see daily-content.mjs schedule). Each run gets
// its own bundle key so the idempotency guards work per run, not per day:
// morning runs keep the bare date (backward compatible with existing bundles),
// evening runs (18:00 UTC or later) get a "-pm" suffix.
export function currentRunKey() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  return now.getUTCHours() >= 18 ? `${date}-pm` : date;
}

export async function runDailyContent({ force = false } = {}) {
  const today = currentRunKey();
  const contentStore = getStore("daily-content");

  const existing = await contentStore.get(today, { type: "json" });
  if (existing && !force) {
    console.log("[daily-content] bundle already exists for", today, "— returning it (pass force to regenerate)");
    return existing;
  }

  console.log("[daily-content] getting rotation state from blobs");
  const rotationStore = getStore("daily-content-state");
  const state = await rotationStore.get("rotation", { type: "json" });
  const currentIndex = state?.index ?? 0;

  const token = await getShopifyAccessToken(process.env.SHOPIFY_STORE_DOMAIN);

  console.log("[daily-content] fetching Shopify product, index", currentIndex);
  const product = await fetchShopifyProduct(token, currentIndex);
  console.log("[daily-content] got product:", product.name);
  await rotationStore.setJSON("rotation", { index: currentIndex + 1 });

  const adPrompt = `You are a direct-response copywriter for mypetstore.shop. Write ONE ad for this product using the AIDA framework:
PRODUCT: ${product.name}
PRICE: ${product.price}
DESCRIPTION: ${product.desc}
Return ONLY a raw JSON object (no markdown fences) with fields: "headline" (max 8 words), "hook" (one sentence), "body" (2-3 sentences), "cta" (max 4 words).`;

  const blogPrompt = `Write a friendly, SEO-aware blog post (400-600 words) for mypetstore.shop about this product. Start with the title on the first line prefixed "TITLE: ", then a blank line, then the body.
PRODUCT: ${product.name}
PRICE: ${product.price}
DESCRIPTION: ${product.desc}`;

  const pressReleasePrompt = `Write a short press release (200-300 words) announcing this product is available at mypetstore.shop, in standard press release format (headline, dateline, body, and an "About MyPetStore" boilerplate closing paragraph).
PRODUCT: ${product.name}
PRICE: ${product.price}
DESCRIPTION: ${product.desc}`;

  const tipPrompt = `Write one short, practical pet-care tip (2-3 sentences) loosely related to this product, suitable for a daily social media tip post. No preamble or label, just the tip text.
PRODUCT: ${product.name}
DESCRIPTION: ${product.desc}`;

  console.log("[daily-content] calling Claude for ad/blog/press-release/tip");
  const [adRaw, blogPost, pressRelease, dailyTip] = await Promise.all([
    askClaude(adPrompt, 500),
    askClaude(blogPrompt, 1200),
    askClaude(pressReleasePrompt, 700),
    askClaude(tipPrompt, 200),
  ]);
  console.log("[daily-content] got all Claude responses");

  let ad;
  try {
    ad = JSON.parse(adRaw.replace(/```json|```/g, "").trim());
  } catch {
    ad = { headline: product.name, hook: "", body: adRaw, cta: "Shop Now" };
  }

  const bundle = { date: today, product, ad, blogPost, pressRelease, dailyTip };

  if (existing?.blogArticleId) {
    bundle.fbCaption = existing.fbCaption;
    // Already published today (e.g. manual test re-run) — don't create a duplicate article
    bundle.blogArticleId = existing.blogArticleId;
    bundle.blogUrl = existing.blogUrl;
    console.log("[daily-content] blog already published today, skipping:", existing.blogUrl);
  } else {
    try {
      const article = await publishBlogArticle(token, bundle);
      bundle.blogArticleId = article.id;
      bundle.blogUrl = article.url;
      console.log("[daily-content] published blog article:", article.url);
    } catch (err) {
      // Blog publish is best-effort — never let it sink the rest of the bundle
      bundle.blogPublishError = err.message;
      console.error("[daily-content] blog publish FAILED:", err.message);
    }
  }

  if (!bundle.fbCaption) {
    // Ready-to-paste Facebook Page caption (Meta Business Suite scheduler / manual post)
    bundle.fbCaption = [
      ad.headline,
      ad.hook,
      ad.body,
      bundle.blogUrl ? `Read more: ${bundle.blogUrl}` : "",
      product.url ? `Shop: ${product.url}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (existing?.tweetId) {
    bundle.tweetId = existing.tweetId;
    bundle.tweetUrl = existing.tweetUrl;
    console.log("[daily-content] already posted to X today, skipping:", existing.tweetUrl);
  } else if (!xConfigured()) {
    console.log("[daily-content] X credentials not configured, skipping X post");
  } else {
    try {
      const tweet = await postToX(bundle);
      bundle.tweetId = tweet.id;
      bundle.tweetUrl = tweet.url;
      console.log("[daily-content] posted to X:", tweet.url);
    } catch (err) {
      bundle.xPostError = err.message;
      console.error("[daily-content] X post FAILED:", err.message);
    }
  }

  if (existing?.pinId) {
    bundle.pinId = existing.pinId;
    bundle.pinUrl = existing.pinUrl;
    console.log("[daily-content] already pinned today, skipping:", existing.pinUrl);
  } else if (!pinterestConfigured()) {
    console.log("[daily-content] Pinterest app credentials not configured, skipping pin");
  } else if (!(await getStoredTokens())?.access_token) {
    console.log("[daily-content] Pinterest not connected (no OAuth token), skipping pin");
  } else {
    try {
      const pin = await createDailyPin(bundle);
      bundle.pinId = pin.id;
      bundle.pinUrl = pin.url;
      console.log("[daily-content] created Pinterest pin:", pin.url);
    } catch (err) {
      bundle.pinterestPostError = err.message;
      console.error("[daily-content] Pinterest pin FAILED:", err.message);
    }
  }

  if (existing?.igMediaId) {
    bundle.igMediaId = existing.igMediaId;
    bundle.igUrl = existing.igUrl;
    console.log("[daily-content] already posted to Instagram today, skipping:", existing.igUrl);
  } else if (!instagramConfigured()) {
    console.log("[daily-content] Instagram access token not configured, skipping Instagram post");
  } else {
    try {
      const post = await createInstagramPost(bundle);
      bundle.igMediaId = post.id;
      bundle.igUrl = post.url;
      console.log("[daily-content] posted to Instagram:", post.url);
    } catch (err) {
      bundle.igPostError = err.message;
      console.error("[daily-content] Instagram post FAILED:", err.message);
    }
  }

  if (existing?.tiktokPublishId && !force) {
    bundle.tiktokPublishId = existing.tiktokPublishId;
    bundle.tiktokPrivacy = existing.tiktokPrivacy;
    console.log("[daily-content] already posted to TikTok today, skipping");
  } else if (!tiktokConfigured()) {
    console.log("[daily-content] TikTok credentials not configured, skipping TikTok post");
  } else if (!(await getTikTokTokens())?.access_token) {
    console.log("[daily-content] TikTok not connected yet, skipping TikTok post");
  } else {
    try {
      const post = await createTikTokPhotoPost(bundle);
      bundle.tiktokPublishId = post.publishId;
      bundle.tiktokPrivacy = post.privacy;
      console.log("[daily-content] posted photo to TikTok:", post.publishId, `(${post.privacy})`);
    } catch (err) {
      bundle.tiktokPostError = err.message;
      console.error("[daily-content] TikTok post FAILED:", err.message);
    }
  }

  if (existing?.fbPostId) {
    bundle.fbPostId = existing.fbPostId;
    bundle.fbPostUrl = existing.fbPostUrl;
    console.log("[daily-content] already posted to Facebook today, skipping");
  } else if (!facebookConfigured()) {
    console.log("[daily-content] Facebook credentials not configured, skipping Facebook post");
  } else if (!(await getStoredPageToken())?.page_access_token) {
    console.log("[daily-content] Facebook not connected yet, skipping Facebook post");
  } else {
    try {
      const post = await createFacebookPost(bundle);
      bundle.fbPostId = post.id;
      bundle.fbPostUrl = post.url;
      console.log("[daily-content] posted to Facebook:", post.url);
    } catch (err) {
      bundle.fbPostError = err.message;
      console.error("[daily-content] Facebook post FAILED:", err.message);
    }
  }

  await contentStore.setJSON(today, bundle);
  console.log("[daily-content] saved bundle for", today);

  return bundle;
}
