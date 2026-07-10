import sharp from "sharp";

const ALLOWED_HOSTS = new Set(["cdn.shopify.com"]);

export default async (request) => {
  const url = new URL(request.url);
  const src = url.searchParams.get("src");
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

  // TikTok's photo puller wants JPEG/WebP within 1080p and a definite length —
  // convert whatever Shopify serves into a bounded, fully buffered JPEG
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
    },
  });
};

export const config = { path: "/api/img" };
