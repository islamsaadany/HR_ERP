"use client";

import { useEffect } from "react";

/**
 * Keeps the Time-Off nav badge live (spec 035, FR-006). The server-rendered layout paints
 * the first frame; this poller (mount + tab focus + every 45s) broadcasts the real count so
 * a manager learns of a new request — and sees it clear after deciding — without a reload.
 * Same mechanism as the data-request badge (the dead-badge fix, 2026-08-17).
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
    const onFocus = () => sync();
    window.addEventListener("focus", onFocus);
    const timer = setInterval(sync, 45_000);
    return () => {
      stop = true;
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, []);
  return null;
}
