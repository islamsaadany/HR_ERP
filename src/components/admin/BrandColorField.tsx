"use client";

import { useState, useId } from "react";

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Brand color input: a native color swatch paired with a typeable hex field.
 * The TEXT field is the submitted value (name={name}) so an operator can paste a
 * code like "#0F2C69" directly; the swatch mirrors it for a visual preview and,
 * when clicked, writes a valid hex back into the text field. Both stay in sync.
 * The server action re-validates the hex, so a partial/invalid entry is caught
 * on save (and flagged inline here first).
 */
export function BrandColorField({
  name,
  label,
  hint,
  defaultValue,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);
  // Rendered more than once per page (primary + accent, and again per business unit),
  // so the id must be generated rather than literal (audit F3).
  const hexId = useId();
  const valid = HEX.test(value.trim());

  const inputCls =
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none font-mono uppercase tabular-nums";

  return (
    <div>
      <label htmlFor={hexId} className="block text-xs font-medium uppercase tracking-wide text-muted mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} swatch`}
          value={valid ? value.trim() : "#000000"}
          onChange={(e) => setValue(e.target.value)}
          className="h-10 w-14 flex-shrink-0 rounded border border-line bg-surface"
        />
        <input
          id={hexId}
          type="text"
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="#0F2C69"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          maxLength={7}
          className={inputCls}
        />
      </div>
      {value.trim() && !valid ? (
        <p className="mt-1 text-xs text-red-600">Enter a 6-digit hex like #0F2C69.</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
