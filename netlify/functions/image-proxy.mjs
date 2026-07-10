import sharp from "sharp";

const ALLOWED_HOSTS = new Set(["cdn.shopify.com"]);

function decodeSrc(request) {
  const url = new URL(request.url);
  // Preferred: /api/img/<base64url(src)>.jpg — extensioned path, no query string
  const match = url.pathname.match(/^\/api\/img\/([A-Za-z0-9_-]+)\.jpg$/);
  if (match) {
    try {
      return Buffer.from(match[1], "base64url").toString("utf8");
    } catch {
      return null;
    }
  }
  return url.searchParams.get("src");
}

export default async (request) => {
  const src = decodeSrc(request);
  if (!src) return new Response("Missing src", { status: 400 });

  let target;
  try {
    target = new URL(src);
  } catch {
    return new Response("Invalid src", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    return new Response("Host not allowed", { status: 403 });
  }

  const upstream = await fetch(target.toString());
  if (!upstream.ok) return new Response("Upstream fetch failed", { status: 502 });

  // TikTok's photo puller wants JPEG within 1080p — convert whatever Shopify serves
  const input = Buffer.from(await upstream.arrayBuffer());
  const out = await sharp(input)
    .resize(1080, 1080, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  return new Response(out, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(out.length),
      "Cache-Control": "public, max-age=86400",
      "Netlify-CDN-Cache-Control": "public, durable, max-age=86400",
    },
  });
};

export const config = { path: ["/api/img", "/api/img/*"] };
