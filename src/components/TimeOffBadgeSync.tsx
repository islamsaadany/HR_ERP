"use client";

import { useEffect } from "react";

/** Ask the badge to re-check now. Fired by any surface that just changed what it counts. */
export const TIMEOFF_REFRESH_EVENT = "hrerp:timeoff-refresh";

/**
 * Keeps the Time-Off nav badge live (spec 035, FR-006). The server-rendered layout paints
 * the first frame; this poller broadcasts the real count so a manager learns of a new request
 * — and sees it clear after deciding — without a reload. Same mechanism as the data-request
 * badge (the dead-badge fix, 2026-08-17).
 *
 * It re-checks on four triggers, because a timer alone was not enough (reported 2026-08-19:
 * the badge sat on "1" while the page below it already said "No requests yet"):
 *  - mount;
 *  - tab focus AND visibility change — returning to an app on mobile fires the latter only;
 *  - every 45s, the backstop for changes made by OTHER people;
 *  - `hrerp:timeoff-refresh`, fired by the Time-Off page the moment YOUR own action changes
 *    what the badge counts (submit, approve, decline, cancel, or reading a decision). Waiting
 *    up to 45s to catch up on your own click is what read as a stuck badge.
 */
export function TimeOffBadgeSync() {
  useEffect(() => {
    let stop = false;
    const sync = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/time-off/badge", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number };
        if (!stop) {
          window.dispatchEvent(new CustomEvent("hrerp:timeoff-count", { detail: data.count ?? 0 }));
        }
      } catch {
        // transient network failure — keep the last painted count
      }
    };
    sync();
    const onWake = () => sync();
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener(TIMEOFF_REFRESH_EVENT, onWake);
    const timer = setInterval(sync, 45_000);
    return () => {
      stop = true;
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener(TIMEOFF_REFRESH_EVENT, onWake);
      clearInterval(timer);
    };
  }, []);
  return null;
}
