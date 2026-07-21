import { getStore } from "@netlify/blobs";
import { youtubeConfigured, getStoredTokens, createYoutubeShort } from "./lib/youtube.mjs";
import { currentRunKey } from "./lib/daily-content-core.mjs";

// Uploads a Short for today's existing bundle without re-running the rest of
// the daily pipeline, so it can't double-post to other platforms.
export default async (request) => {
  const url = new URL(request.url);
  if (url.searchParams.get("key") !== process.env.DAILY_CONTENT_TEST_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (!youtubeConfigured()) throw new Error("YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET not set");
    if (!(await getStoredTokens())?.access_token) {
      throw new Error("YouTube not connected — open /api/youtube-connect first");
    }

    const store = getStore("daily-content");
    const today = currentRunKey();
    const bundle = await store.get(today, { type: "json" });
    if (!bundle) throw new Error(`No bundle for ${today} — run the daily pipeline first`);
    if (bundle.youtubeVideoId && url.searchParams.get("force") !== "1") {
      return new Response(JSON.stringify({ success: true, alreadyUploaded: true, youtubeUrl: bundle.youtubeUrl }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const video = await createYoutubeShort(bundle);
    bundle.youtubeVideoId = video.id;
    bundle.youtubeUrl = video.url;
    delete bundle.youtubePostError;
    await store.setJSON(today, bundle);

    return new Response(JSON.stringify({ success: true, youtubeUrl: video.url, product: bundle.product?.name }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[youtube-test] FAILED:", err.message, err.stack);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/_youtube-test" };
