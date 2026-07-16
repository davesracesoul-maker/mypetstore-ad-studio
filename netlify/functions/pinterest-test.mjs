import { getStore } from "@netlify/blobs";
import { pinterestConfigured, getStoredTokens, createDailyPin } from "./lib/pinterest.mjs";
import { currentRunKey } from "./lib/daily-content-core.mjs";

// Pins today's existing bundle without re-running the rest of the daily pipeline
// (TikTok/Instagram/Facebook), so it can't double-post to other platforms.
export default async (request) => {
  const url = new URL(request.url);
  if (url.searchParams.get("key") !== process.env.DAILY_CONTENT_TEST_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (!pinterestConfigured()) throw new Error("PINTEREST_APP_ID / PINTEREST_APP_SECRET not set");
    if (!(await getStoredTokens())?.access_token) {
      throw new Error("Pinterest not connected — open /api/pinterest-connect first");
    }

    const store = getStore("daily-content");
    const today = currentRunKey();
    const bundle = await store.get(today, { type: "json" });
    if (!bundle) throw new Error(`No bundle for ${today} — run the daily pipeline first`);
    if (bundle.pinId && url.searchParams.get("force") !== "1") {
      return new Response(JSON.stringify({ success: true, alreadyPinned: true, pinUrl: bundle.pinUrl }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const pin = await createDailyPin(bundle);
    bundle.pinId = pin.id;
    bundle.pinUrl = pin.url;
    delete bundle.pinterestPostError;
    await store.setJSON(today, bundle);

    return new Response(JSON.stringify({ success: true, pinUrl: pin.url, product: bundle.product?.name }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/_pinterest-test" };
