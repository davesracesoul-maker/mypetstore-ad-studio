import { getStore } from "@netlify/blobs";
import { runDailyContent } from "./lib/daily-content-core.mjs";

// Self-healing catch-up / safety net for the daily-content pipeline.
//
// The PRIMARY trigger is now an external cron service (cron-job.org) that pings
// run-daily-content-background at 13:00 / 17:00 / 22:00 UTC. This function is
// the backup: a SEPARATE Netlify scheduled function that, an hour after each
// slot, checks whether that slot's bundle exists and, if not, backfills it by
// calling the same pipeline with an explicit runKey. It covers a missed or
// not-yet-configured external cron, so no slot is ever silently lost (worst
// case, a slot posts an hour late). Netlify's own scheduled cron was removed
// because it silently skipped runs (2026-09-02: the 9am run posted everywhere
// but the 1pm and 6pm slots were dropped).

// Must stay in sync with the external cron's trigger hours and currentRunKey()
// in the core: morning (13:00 UTC) keeps the bare date, afternoon (17:00) gets
// "-af", evening (22:00) gets "-pm".
const SLOTS = [
  { hour: 13, key: (d) => d },
  { hour: 17, key: (d) => `${d}-af` },
  { hour: 22, key: (d) => `${d}-pm` },
];

// Wait this long after a slot's trigger before backfilling, so we never race a
// primary run that merely started a little late. A skipped run never runs at
// all, so an hour is a safe margin without leaving a gap.
const GRACE_MINUTES = 60;

export default async () => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const minutesNow = now.getUTCHours() * 60 + now.getUTCMinutes();
  const contentStore = getStore("daily-content");
  const log = getStore("daily-content-errors");

  for (const slot of SLOTS) {
    // Only a slot whose trigger + grace window has passed is eligible.
    if (minutesNow < slot.hour * 60 + GRACE_MINUTES) continue;

    const key = slot.key(date);
    const existing = await contentStore.get(key, { type: "json" });
    if (existing) continue; // primary run already produced it — nothing to heal

    console.log("[watchdog] slot", key, "missing past its trigger — backfilling");
    try {
      await runDailyContent({ runKey: key });
      console.log("[watchdog] backfilled", key);
      // Record every heal so recurring primary-cron skips stay visible via
      // /api/_daily-content-errors instead of passing silently.
      try {
        await log.setJSON(`${key}-watchdog-heal`, {
          message: `Watchdog backfilled missing slot ${key} — the primary daily-content cron appears to have been skipped by Netlify.`,
          at: new Date().toISOString(),
        });
      } catch {}
    } catch (err) {
      console.error("[watchdog] backfill FAILED for", key, err.message);
      try {
        await log.setJSON(`${key}-watchdog-fail`, {
          message: err.message,
          stack: err.stack,
          at: new Date().toISOString(),
        });
      } catch {}
    }
  }
};

// One hour after each primary trigger (13/17/22 UTC), so each slot gets a
// catch-up pass: morning is rechecked at 15/19/23, afternoon at 19/23, evening
// at 23.
export const config = { schedule: "0 15,19,23 * * *" };
