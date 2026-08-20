"use client";

import { useEffect } from "react";

/**
 * Publish the height of a page's pinned identity block as `--ff-stickyhead`.
 *
 * A table header that parks beneath a sticky title has to know how tall that title is, and the
 * answer is not a constant: it changes when the impersonation banner is showing, when the window
 * is narrow enough to wrap the heading, and whenever the copy changes. Hard-coding it leaves a
 * sliver of scrolling rows visible in the gap — so it is measured, and re-measured on resize.
 *
 * Renders nothing. Pair with `ff-parked-header` on the table (see globals.css).
 */
export function StickyHeaderOffset({ targetId }: { targetId: string }) {
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;

    const root = document.documentElement;
    const apply = () => root.style.setProperty("--ff-stickyhead", `${Math.round(el.offsetHeight)}px`);
    apply();

    const observer = new ResizeObserver(apply);
    observer.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", apply);
      // Leaving the variable set would push the next page's table header down by this page's
      // title height — it is global, so it has to be cleaned up on the way out.
      root.style.removeProperty("--ff-stickyhead");
    };
  }, [targetId]);

  return null;
}
