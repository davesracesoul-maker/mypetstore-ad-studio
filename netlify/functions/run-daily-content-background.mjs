import { getStore } from "@netlify/blobs";
import { runDailyContent, currentRunKey } from "./lib/daily-content-core.mjs";

// HTTP-triggered PRIMARY runner for the daily-content pipeline.
//
// An external cron service (cron-job.org) pings this at 13:00 / 17:00 / 22:00
// UTC. It replaces Netlify's own scheduled cron, which silently skipped runs
// (see daily-content-watchdog.mjs). The "-background" filename suffix gives it
// Netlify's 15-minute budget, so the full multi-channel pipeline always
// finishes — a plain synchronous function is capped at ~10s and would be killed
// mid-run, leaving content posted to only some channels.
//
// The slot (morning / -af / -pm) is derived from the current time via
// currentRunKey(), so the external cron only has to fire at the right hours; it
// never needs to know the slot naming. An explicit ?runKey= override is
// supported for manual backfills.
//
// Auth: the DAILY_CONTENT_TEST_KEY must be supplied as ?key= or an
// "x-daily-key" header. Note that Netlify background functions always return
// 202 to the caller regardless of what this handler returns, so an unauthorized
// request simply does no work.
export default async (request) => {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || request.headers.get("x-daily-key");
  if (key !== process.env.DAILY_CONTENT_TEST_KEY) {
    console.warn("[run-daily-content-background] unauthorized trigger — ignoring");
    return new Response("Unauthorized", { status: 401 });
  }

  const runKey = url.searchParams.get("runKey") || currentRunKey();
  console.log("[run-daily-content-background] starting run for", runKey);
  try {
    await runDailyContent({ runKey });
    console.log("[run-daily-content-background] completed", runKey);
  } catch (err) {
    console.error("[run-daily-content-background] FAILED", runKey, err.message, err.stack);
    // Persist the failure so it surfaces in /api/_daily-content-errors, exactly
    // like the old scheduled wrapper did.
    try {
      await getStore("daily-content-errors").setJSON(runKey, {
        message: err.message,
        stack: err.stack,
        at: new Date().toISOString(),
      });
    } catch (storeErr) {
      console.error("[run-daily-content-background] also failed to persist error:", storeErr.message);
    }
  }
  return new Response("ok", { status: 200 });
};
