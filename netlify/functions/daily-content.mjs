import { runDailyContent } from "./lib/daily-content-core.mjs";

export default async () => {
  try {
    await runDailyContent();
  } catch (err) {
    console.error("[daily-content] FAILED:", err.message, err.stack);
  }
};

// 13:00 UTC (~9am ET) and 22:00 UTC (~6pm ET)
export const config = { schedule: "0 13,22 * * *" };
