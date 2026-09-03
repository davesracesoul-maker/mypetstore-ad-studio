import { getStore } from "@netlify/blobs";
import { runDailyContent } from "./lib/daily-content-core.mjs";

// Self-healing catch-up for the daily-content pipeline.
//
// All three daily posts come from ONE cron in daily-content.mjs
// ("0 13,17,22 * * *"). When Netlify silently skips one of those scheduled
// invocations, no code runs for that slot, so nothing can heal itself — the
// slot's bundle just never appears (this is what happened on 2026-09-02: the
// 9am run posted everywhere but the 1pm and 6pm slots were dropped).
//
// This function is a SEPARATE scheduled function (its own independent cron), so
// it fires even when the primary cron was skipped. An hour after each primary
// trigger it checks whether that slot's bundle exists and, if not, backfills it
// by calling the same pipeline with an explicit runKey. To lose a slot now,
// BOTH crons would have to be skipped in the same window.

// Must stay in sync with daily-content.mjs's cron and currentRunKey() in the
// core: morning (13:00 UTC) keeps the bare date, afternoon (17:00) gets "-af",
// evening (22:00) gets "-pm".
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
