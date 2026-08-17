"use client";

import { useState, type ReactNode } from "react";
import { RequestForm } from "./RequestForm";
import type { FieldDescriptor } from "@/lib/profile/change-requests";

/**
 * A My Profile card whose fields are HR-managed but correctable by request (spec 029): the
 * "Request a change" button sits on the card itself, scoped to the card's own fields. The
 * button IS the ownership tag — no "Managed by HR" pill needed, since a request path already
 * says it is not self-edit.
 *
 * While a request is awaiting HR (anywhere — one open request at a time, FR-006), the button
 * gives way to an "Awaiting HR" chip pointing at the status panel below.
 */
export function RequestableSection({
  title,
  descriptors,
  hasOpenRequest,
  children,
}: {
  title: string;
  /** Only this card's fields — the form sends nothing else. */
  descriptors: FieldDescriptor[];
  /** True while any request of the employee's is undecided (they are one-at-a-time). */
  hasOpenRequest: boolean;
  children: ReactNode;
}) {
  const [formOpen, setFormOpen] = useState(false);

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-lg text-ink">{title}</h2>
        {hasOpenRequest ? (
          <span className="rounded-full border border-gold-300 bg-gold-50 px-2.5 py-1 text-[11px] font-bold text-gold-800">
            Awaiting HR
          </span>
        ) : formOpen ? null : (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
          >
            Request a change
          </button>
        )}
      </div>
      {children}
      {formOpen && !hasOpenRequest ? (
        <RequestForm descriptors={descriptors} onClose={() => setFormOpen(false)} />
      ) : null}
    </section>
  );
}
