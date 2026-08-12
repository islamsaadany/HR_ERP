"use client";

import { useRef, useState } from "react";
import { placeFixedTip } from "./tipPosition";

/**
 * A hover/focus tooltip rendered as a fixed floating layer, so it is never
 * clipped by a table's horizontal scroll box. Wrap the trigger content as
 * children; pass the explanation as `text`. `className` styles the trigger
 * (e.g. a dotted underline).
 */
export function HoverTip({
  text,
  children,
  className,
}: {
  text: string;
  children: React.ReactNode;
  className?: string;
}) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  function show() {
    setOpen(true);
    if (wrapRef.current && tipRef.current) placeFixedTip(wrapRef.current, tipRef.current);
  }
  function hide() {
    setOpen(false);
  }

  return (
    <span
      ref={wrapRef}
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className={"cursor-help outline-none " + (className ?? "")}
    >
      {children}
      <span
        ref={tipRef}
        role="tooltip"
        className={
          "pointer-events-none fixed left-0 top-0 z-[100] max-w-[240px] rounded-lg bg-navy-900 px-2.5 py-1.5 text-left text-[11px] font-normal normal-case leading-snug tracking-normal text-white shadow-lg transition-opacity duration-100 " +
          (open ? "opacity-100" : "opacity-0")
        }
      >
        {text}
      </span>
    </span>
  );
}
