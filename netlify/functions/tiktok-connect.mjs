import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import { tiktokConfigured } from "./lib/tiktok.mjs";

export default async (request) => {
  const url = new URL(request.url);
  if (url.searchParams.get("key") !== process.env.DAILY_CONTENT_TEST_KEY) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!tiktokConfigured()) {
    return new Response("TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET not set in Netlify env vars yet", { status: 500 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const store = getStore("tiktok-auth");
  await store.setJSON("oauth-state", { state, created: Date.now() });

  const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
  authUrl.searchParams.set("client_key", process.env.TIKTOK_CLIENT_KEY);
  // video.publish (direct post) is gated behind TikTok's audit — request upload (drafts) until then
  authUrl.searchParams.set("scope", "user.info.basic,video.upload");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", `${url.origin}/api/tiktok-callback`);
  authUrl.searchParams.set("state", state);
  return Response.redirect(authUrl.toString(), 302);
};

export const config = { path: "/api/tiktok-connect" };
