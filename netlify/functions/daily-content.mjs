import { runDailyContent } from "./lib/daily-content-core.mjs";

export default async () => {
  try {
    await runDailyContent();
  } catch (err) {
    console.error("[daily-content] FAILED:", err.message, err.stack);
  }
};

export const config = { schedule: "0 13 * * *" };
