"use client";

import { useEffect } from "react";

/** Registers the service worker so the app is installable. Renders nothing. */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failures are non-fatal — the app still works */
      });
    }
  }, []);
  return null;
}
