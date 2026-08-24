import sharp from "sharp";

const ALLOWED_HOSTS = new Set(["cdn.shopify.com"]);

// Pinterest strongly favours tall 2:3 pins (1000x1500) — they take up far more
// feed space and get more engagement than square images. Product photos vary in
// shape, so pad onto a fixed 2:3 canvas with a soft brand background rather than
// cropping the product. Same relay pattern as ig-img / image-proxy.
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
  const WIDTH = 1000;
  const HEIGHT = 1500;
  const out = await sharp(input)
    .resize(WIDTH, HEIGHT, { fit: "contain", background: { r: 250, g: 246, b: 240, alpha: 1 } })
    .jpeg({ quality: 90 })
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

export const config = { path: "/api/pin-img" };
