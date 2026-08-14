"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Global success toast for navigate-then-confirm saves (spec: unified save feedback).
 * A server action that finishes by navigating (create/edit → list) redirects with a
 * `?toast=<message>` param; this pops the green bottom-left `ff-toast` on landing and
 * strips the param. Uses a DEDICATED `toast` key so it never collides with the various
 * pages that already read `?saved`/`?error`.
 */
function QueryToastInner() {
  const params = useSearchParams();
  const router = useRouter();
  const msg = params.get("toast");
  const [show, setShow] = useState<string | null>(null);
  const fired = useRef<string | null>(null);

  useEffect(() => {
    if (msg && fired.current !== msg) {
      fired.current = msg;
      setShow(msg);
      const url = new URL(window.location.href);
      url.searchParams.delete("toast");
      router.replace(url.pathname + (url.search ? url.search : ""), { scroll: false });
      const t = setTimeout(() => setShow(null), 4000);
      return () => clearTimeout(t);
    }
  }, [msg, router]);

  if (!show) return null;
  return (
    <div className="fixed bottom-4 left-4 z-[60]">
      <button
        type="button"
        onClick={() => setShow(null)}
        className="ff-toast flex items-center gap-2.5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-left text-sm font-semibold text-green-700 shadow-lg"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-green-600" aria-hidden="true" />
        <span>✓ {show}</span>
      </button>
    </div>
  );
}

export function QueryToast() {
  return (
    <Suspense fallback={null}>
      <QueryToastInner />
    </Suspense>
  );
}
