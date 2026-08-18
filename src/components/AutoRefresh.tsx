"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Non-visual liveness helper: re-fetches the current server-rendered page on window
 * focus and on an interval. Dropped into monitoring pages (e.g. the data-request
 * tracker) whose data other people change while the page sits open — a server page
 * never re-renders on its own, so without this the screen shows the state from
 * whenever it was first drawn (live-testing bug 2026-08-18: the tracker said
 * "Pending" while the freshly generated Excel said "Complete").
 */
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, intervalMs);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [router, intervalMs]);
  return null;
}
