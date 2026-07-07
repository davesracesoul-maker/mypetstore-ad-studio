import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import { pinterestConfigured } from "./lib/pinterest.mjs";

export default async (request) => {
  const url = new URL(request.url);
  if (url.searchParams.get("key") !== process.env.DAILY_CONTENT_TEST_KEY) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!pinterestConfigured()) {
    return new Response("PINTEREST_APP_ID / PINTEREST_APP_SECRET not set in Netlify env vars yet", { status: 500 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const store = getStore("pinterest-auth");
  await store.setJSON("oauth-state", { state, created: Date.now() });

  const authUrl = new URL("https://www.pinterest.com/oauth/");
  authUrl.searchParams.set("client_id", process.env.PINTEREST_APP_ID);
  authUrl.searchParams.set("redirect_uri", `${url.origin}/api/pinterest-callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "boards:read,boards:write,pins:read,pins:write,user_accounts:read");
  authUrl.searchParams.set("state", state);
  return Response.redirect(authUrl.toString(), 302);
};

export const config = { path: "/api/pinterest-connect" };
