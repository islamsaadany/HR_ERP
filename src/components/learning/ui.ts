/**
 * Shared class strings for the Learning module.
 *
 * These exist because the same four button and card strings were about to be repeated across nine
 * components, and the house rule is to extract at three uses. Values are copied from the patterns
 * already dominant in the codebase (`rounded-lg bg-navy-800 …`, `rounded-xl border border-line
 * bg-surface …`) so Learning looks like the rest of the app rather than near-miss.
 *
 * Colour semantics, per CLAUDE.md: NAVY is the action, GREEN is a done-state and nothing else,
 * GOLD is attention or in-review, RED is destructive or refused.
 */

export const BTN_NAVY =
  "inline-flex items-center gap-1.5 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60";

export const BTN_GHOST =
  "inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50 disabled:opacity-60";

export const BTN_DANGER =
  "inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-surface px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60";

export const CARD = "rounded-xl border border-line bg-surface p-5";

export const INPUT =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

export const LABEL =
  "mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted";

const CHIP_BASE =
  "inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-bold";

export const CHIP = {
  /** Done. Green is used for this and nothing else. */
  done: `${CHIP_BASE} border border-green-200 bg-green-50 text-green-700`,
  /** Needs attention / in review. */
  attention: `${CHIP_BASE} border border-gold-300 bg-gold-100 text-gold-800`,
  /** Neutral descriptor — a count, a type, an inert label. */
  muted: `${CHIP_BASE} border border-line bg-paper text-muted`,
  /** Structural / informational, not an action. */
  navy: `${CHIP_BASE} border border-navy-200 bg-navy-50 text-navy-700`,
  /** Refused or destructive. */
  danger: `${CHIP_BASE} border border-red-200 bg-red-50 text-red-700`,
} as const;

/** A progress bar. Green ONLY at 100% — a part-done bar is navy, never a green sliver. */
export function barClasses(percent: number) {
  return {
    track: "h-[7px] overflow-hidden rounded-full bg-navy-50",
    fill: `block h-full rounded-full ${percent >= 100 ? "bg-green-600" : "bg-navy-800"}`,
  };
}
