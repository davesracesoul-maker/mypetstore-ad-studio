import { getStore } from "@netlify/blobs";

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

async function fetchShopifyProduct(rotationIndex) {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = await getShopifyAccessToken(domain);
  const url = `https://${domain}/admin/api/2025-10/graphql.json`;
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

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query }),
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

  const products = (data.data?.products?.edges || []).map((e) => e.node);
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

export async function runDailyContent() {
  console.log("[daily-content] getting rotation state from blobs");
  const rotationStore = getStore("daily-content-state");
  const state = await rotationStore.get("rotation", { type: "json" });
  const currentIndex = state?.index ?? 0;

  console.log("[daily-content] fetching Shopify product, index", currentIndex);
  const product = await fetchShopifyProduct(currentIndex);
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

  const today = new Date().toISOString().slice(0, 10);
  const bundle = { date: today, product, ad, blogPost, pressRelease, dailyTip };

  const contentStore = getStore("daily-content");
  await contentStore.setJSON(today, bundle);
  console.log("[daily-content] saved bundle for", today);

  return bundle;
}
