import sharp from "sharp";

const ALLOWED_HOSTS = new Set(["cdn.shopify.com"]);

// Instagram requires an aspect ratio between 4:5 and 1.91:1. Product photos
// from suppliers vary wildly (some very tall, some very wide), so instead of
// trusting the source shape we always pad onto a fixed 1:1 canvas — safely
// inside Instagram's range regardless of what the original image looks like.
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

  const input = Buffer.from(await upstream.arrayBuffer());
  const CANVAS = 1080;
  const resized = await sharp(input)
    .resize(CANVAS, CANVAS, { fit: "contain", background: { r: 250, g: 246, b: 240, alpha: 1 } })
    .jpeg({ quality: 90 })
    .toBuffer();

  return new Response(resized, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(resized.length),
      "Cache-Control": "public, max-age=86400",
      "Netlify-CDN-Cache-Control": "public, durable, max-age=86400",
    },
  });
};

export const config = { path: "/api/ig-img" };
