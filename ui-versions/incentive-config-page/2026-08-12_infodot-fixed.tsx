"use client";

import { useState, useRef, useEffect } from "react";
import { placeFixedTip } from "./tipPosition";

/**
 * A small ⓘ info icon that opens a plain-language explanation popover on click.
 * Closes on outside-click or Escape. The popover is a fixed floating layer
 * (positioned from the button) so the table's scroll box never clips it.
 */
export function InfoDot({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      if (btnRef.current && tipRef.current) placeFixedTip(btnRef.current, tipRef.current);
    };
    place();
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    // Keep the popover glued to its button while the page scrolls/resizes.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="ml-1 inline-block align-middle">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="What is this?"
        aria-expanded={open}
        className="grid h-[15px] w-[15px] place-items-center rounded-full border border-navy-200 text-[10px] font-bold leading-none text-navy-500 hover:bg-navy-50 hover:text-navy-800"
      >
        i
      </button>
      <span
        ref={tipRef}
        role="tooltip"
        className={
          "pointer-events-none fixed left-0 top-0 z-[100] w-56 rounded-lg bg-navy-900 px-3 py-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-white shadow-lg transition-opacity duration-100 " +
          (open ? "opacity-100" : "opacity-0")
        }
      >
        {text}
      </span>
    </span>
  );
}
