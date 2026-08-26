"use client";

/**
 * Shared furniture for the incentive cycle report: the collapsible section
 * shell, its chevron, and the data-table cell classes.
 *
 * Extracted from CycleReport when the Review & validation tables became
 * editable — the editor is its own component (it owns edit state, so it can't
 * live inside the report's render) but must render inside an identical section
 * header, with identical table cells. Two copies of these constants would drift
 * the moment one table was restyled.
 */

export const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted";
export const td = "px-3 py-2 text-sm text-ink whitespace-nowrap";
export const tdr = td + " text-right tabular-nums";
export const scrollWrap = "ff-hscroll rounded-lg border border-line";

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={"h-3.5 w-3.5 shrink-0 text-muted transition-transform " + (open ? "rotate-90" : "")}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function Section({
  title,
  subtitle,
  titleExtra,
  action,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  titleExtra?: React.ReactNode;
  action?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-expanded={open}>
          <Chevron open={open} />
          <span className="font-serif text-lg text-ink">{title}</span>
          {titleExtra}
          {subtitle ? <span className="truncate text-xs text-muted">{subtitle}</span> : null}
        </button>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </section>
  );
}
