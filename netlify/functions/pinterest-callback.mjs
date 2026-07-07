import { getStore } from "@netlify/blobs";
import { exchangeAndStore } from "./lib/pinterest.mjs";

export default async (request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = getStore("pinterest-auth");
  const saved = await store.get("oauth-state", { type: "json" });
  const stateValid = saved && state && saved.state === state && Date.now() - saved.created < 15 * 60 * 1000;
  if (!code || !stateValid) {
    return new Response("Invalid or expired OAuth state — restart from /api/pinterest-connect", { status: 400 });
  }
  await store.delete("oauth-state");

  try {
    await exchangeAndStore({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${url.origin}/api/pinterest-callback`,
    });
    return new Response(
      "<h2>&#9989; Pinterest connected</h2><p>The daily pipeline can now create pins. You can close this tab.</p>",
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    return new Response(`Pinterest connection failed: ${err.message}`, { status: 500 });
  }
};

export const config = { path: "/api/pinterest-callback" };
