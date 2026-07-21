import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import { youtubeConfigured, buildAuthUrl } from "./lib/youtube.mjs";

export default async (request) => {
  const url = new URL(request.url);
  if (url.searchParams.get("key") !== process.env.DAILY_CONTENT_TEST_KEY) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!youtubeConfigured()) {
    return new Response("YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET not set in Netlify env vars yet", { status: 500 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const store = getStore("youtube-auth");
  await store.setJSON("oauth-state", { state, created: Date.now() });

  const redirectUri = `${url.origin}/api/youtube-callback`;
  return Response.redirect(buildAuthUrl(redirectUri, state), 302);
};

export const config = { path: "/api/youtube-connect" };
