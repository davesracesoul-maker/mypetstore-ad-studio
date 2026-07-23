import { getStore } from "@netlify/blobs";
import { runDailyContent, currentRunKey } from "./lib/daily-content-core.mjs";

export default async () => {
  try {
    await runDailyContent();
  } catch (err) {
    console.error("[daily-content] FAILED:", err.message, err.stack);
    // The scheduled function's own console output isn't visible to us after
    // the fact — persist a record so a failed run is diagnosable via
    // /api/_daily-content-errors instead of just silently producing nothing.
    try {
      const store = getStore("daily-content-errors");
      await store.setJSON(currentRunKey(), {
        message: err.message,
        stack: err.stack,
        at: new Date().toISOString(),
      });
    } catch (storeErr) {
      console.error("[daily-content] also failed to persist error record:", storeErr.message);
    }
  }
};

// 13:00 UTC (~9am ET) and 22:00 UTC (~6pm ET)
export const config = { schedule: "0 13,22 * * *" };
