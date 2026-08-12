"use client";

import { useState, useRef, useEffect } from "react";

/**
 * A small ⓘ info icon that opens a plain-language explanation popover on click.
 * Closes on outside-click or Escape. Used on the incentive config tables.
 */
export function InfoDot({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative ml-1 inline-block align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="What is this?"
        aria-expanded={open}
        className="grid h-[15px] w-[15px] place-items-center rounded-full border border-navy-200 text-[10px] font-bold leading-none text-navy-500 hover:bg-navy-50 hover:text-navy-800"
      >
        i
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-30 mt-1.5 w-56 -translate-x-1/2 rounded-lg bg-navy-900 px-3 py-2 text-left text-xs font-normal leading-snug text-white shadow-lg"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
