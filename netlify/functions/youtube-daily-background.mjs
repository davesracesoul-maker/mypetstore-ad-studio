import { getStore } from "@netlify/blobs";
import { youtubeConfigured, getStoredTokens, createYoutubeShort } from "./lib/youtube.mjs";

// Background function: the `-background` filename suffix gives it Netlify's
// 15-minute execution budget — plenty for the ffmpeg video render, which was
// getting the main scheduled pipeline killed when it ran inline. The main
// daily-content run fires this off (fire-and-forget) right after saving the
// day's bundle, so the render is fully isolated: it can't slow, block, or kill
// the run that posts to the other channels.
export default async (request) => {
  let body = {};
  try {
    body = await request.json();
  } catch {
    // ignore — validated below
  }

  if (body.key !== process.env.DAILY_CONTENT_TEST_KEY) {
    return new Response("Unauthorized", { status: 401 });
  }
  const runKey = body.runKey;
  if (!runKey) {
    return new Response("Missing runKey", { status: 400 });
  }

  const store = getStore("daily-content");
  const bundle = await store.get(runKey, { type: "json" });
  if (!bundle) {
    console.log("[youtube-daily] no bundle for", runKey, "— nothing to render");
    return new Response("no bundle", { status: 200 });
  }
  if (bundle.youtubeVideoId) {
    console.log("[youtube-daily] bundle", runKey, "already has a YouTube video, skipping");
    return new Response("already uploaded", { status: 200 });
  }
  if (!youtubeConfigured() || !(await getStoredTokens())?.access_token) {
    console.log("[youtube-daily] YouTube not configured/connected, skipping");
    return new Response("not configured", { status: 200 });
  }

  try {
    const video = await createYoutubeShort(bundle);
    bundle.youtubeVideoId = video.id;
    bundle.youtubeUrl = video.url;
    await store.setJSON(runKey, bundle);
    console.log("[youtube-daily] uploaded YouTube Short for", runKey, ":", video.url);
  } catch (err) {
    bundle.youtubePostError = err.message;
    await store.setJSON(runKey, bundle);
    console.error("[youtube-daily] YouTube Short FAILED for", runKey, ":", err.message);
  }

  return new Response("ok", { status: 200 });
};
