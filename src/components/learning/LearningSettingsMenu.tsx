"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const ITEMS = [
  {
    href: "/admin/learning/settings",
    title: "Who runs Learning",
    hint: "Appoint someone to run this module",
  },
  {
    href: "/admin/learning/groups",
    title: "Manage groups",
    hint: "Named lists you can give a course to",
  },
];

/**
 * The Learning module's own settings, behind a gear at the top right (mockup-approved 2026-08-22).
 *
 * These two pages were grey text links sitting between the page description and the buttons —
 * unadorned, no border, no icon, in the place a page normally puts explanatory prose. They read as
 * caption rather than as controls, and were reported as unfindable. A gear at the top right is
 * where people look for "the settings of this screen", and the menu says what each page is so
 * nobody has to remember which is which.
 *
 * "Who runs Learning" is listed first deliberately: it is reached for least often and needed most
 * urgently.
 */
export function LearningSettingsMenu() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Close on a click outside or on Escape. Both, not one: a menu that only closes on Escape is a
  // trap for a mouse user, and one that only closes on an outside click is a trap for a keyboard.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Learning settings"
        title="Learning settings"
        className={`grid h-9 w-9 place-items-center rounded-lg border transition ${
          open
            ? "border-navy-800 bg-navy-800 text-white"
            : "border-line bg-surface text-navy-700 hover:bg-navy-50"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-[19px] w-[19px]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-11 z-20 w-[274px] overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
        >
          <p className="px-3 pb-1.5 pt-2.5 text-[10px] font-extrabold uppercase tracking-[0.07em] text-muted">
            Learning settings
          </p>
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block border-t border-line px-3 py-2 hover:bg-navy-50"
            >
              <span className="block text-[13px] font-semibold text-navy-800">{item.title}</span>
              <span className="mt-0.5 block text-[11.5px] text-muted">{item.hint}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
