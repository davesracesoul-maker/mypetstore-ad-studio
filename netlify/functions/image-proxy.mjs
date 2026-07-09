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

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
};

export const config = { path: "/api/img" };
