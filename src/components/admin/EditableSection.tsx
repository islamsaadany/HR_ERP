"use client";

import { useState, type ReactNode } from "react";

/**
 * View-first config section (spec 016). Renders a read-only view by default with an Edit toggle;
 * clicking Edit reveals the edit view (the existing server-action forms); Done returns to read-only.
 * Both views stay mounted (toggled via CSS) so in-flight server actions complete and the revalidated
 * data flows into both. Each section toggles independently. Navy/gold, card styling as before.
 */
export function EditableSection({
  title,
  description,
  readView,
  editView,
}: {
  title: string;
  description?: ReactNode;
  readView: ReactNode;
  editView: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg text-ink">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>
      <div className={"mt-4" + (editing ? " hidden" : "")}>{readView}</div>
      <div className={"mt-4" + (editing ? "" : " hidden")}>{editView}</div>
    </section>
  );
}
