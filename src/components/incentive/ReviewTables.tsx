"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveReviewTables, type ReviewSaveState } from "@/app/(app)/incentive/actions";
import {
  ASSIGNMENT_STATUSES,
  DATE_CELL_FORMAT,
  contribPersonOrder,
  draftPayload,
  draftRowTotal,
  isOffTotal,
  toDraft,
  type ContribRow,
  type Draft,
  type ReviewAssignmentInput,
  type ReviewData,
  type ReviewPayload,
} from "@/lib/incentive/review";
import { displayIncentiveDate } from "@/lib/incentive/dates";
import { HoverTip } from "./HoverTip";
import { Section, scrollWrap, td, tdr, th } from "./ReportSection";

export type { ReviewData };

const whole = (n: number) => Math.round(n).toLocaleString("en-US");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/**
 * Assignment status → display label, sort order, and pill colour. "closed"
 * reads as "Ended"; rows in the review table sort Ongoing → Ended → In
 * progress → Pending. Colour tracks payability (green active, blue done,
 * amber in-flight, grey awaiting).
 */
const STATUS_META: Record<string, { label: string; order: number; cls: string }> = {
  ongoing: { label: "Ongoing", order: 1, cls: "bg-green-100 text-green-700" },
  closed: { label: "Ended", order: 2, cls: "bg-blue-100 text-blue-700" },
  in_progress: { label: "In progress", order: 3, cls: "bg-amber-100 text-amber-700" },
  pending: { label: "Pending", order: 4, cls: "bg-gray-100 text-gray-500" },
};
const statusMeta = (s: string) => STATUS_META[s] ?? { label: s, order: 99, cls: "bg-gray-100 text-gray-500" };

function StatusPill({ status }: { status: string }) {
  const meta = statusMeta(status);
  return <span className={"inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold " + meta.cls}>{meta.label}</span>;
}

const key = (s: string) => s.trim().toLowerCase();

// ── Cell controls ───────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-navy-500 focus:outline-none";
const editCell = "px-1.5 py-1 align-middle";

function TextCell({
  value,
  onChange,
  onCommit,
  width,
  align,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit?: (previous: string, next: string) => void;
  width: string;
  align?: "right";
  placeholder?: string;
  label: string;
}) {
  // The value the field held when it gained focus, so a rename can be applied
  // once the person has finished typing it rather than on every keystroke.
  const before = useRef(value);
  return (
    <td className={editCell}>
      <input
        type="text"
        inputMode={align === "right" ? "decimal" : undefined}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onFocus={() => (before.current = value)}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onCommit?.(before.current, value)}
        className={inputCls + " " + width + (align === "right" ? " text-right tabular-nums" : "")}
      />
    </td>
  );
}

/**
 * A date cell, typed as `14-Jul 2026`.
 *
 * The spelled month is the point: an operator entering compensation dates off a
 * spreadsheet can see at a glance that what they typed is what landed, which two
 * numbers separated by a slash can never show them.
 *
 * Deliberately NOT `<input type="date">`: a native picker draws itself in the
 * browser's own UI language, so on a default Chromium the first of March reads
 * `03/01/2021` — American — no matter what locale the page asks for. Measured in
 * a real browser under en-GB, ar-EG and en-US; all three drew mm/dd/yyyy.
 */
function DateCell({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <td className={editCell}>
      <input
        type="text"
        aria-label={`${label} (${DATE_CELL_FORMAT})`}
        placeholder={DATE_CELL_FORMAT}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls + " min-w-[8rem] tabular-nums"}
      />
    </td>
  );
}

function SelectCell({
  value,
  onChange,
  options,
  label,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  width: string;
}) {
  return (
    <td className={editCell}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls + " " + width}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </td>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <td className="w-10 px-1.5 py-1 align-middle">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        className="grid h-6 w-6 place-items-center rounded-md border border-line text-muted hover:border-red-300 hover:bg-red-50 hover:text-red-600"
      >
        ✕
      </button>
    </td>
  );
}

function AddRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="border-t border-dashed border-navy-200 bg-paper px-3 py-2">
        {children}
      </td>
    </tr>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded text-xs font-semibold text-navy-600 hover:text-navy-800 hover:underline"
    >
      {children}
    </button>
  );
}

// ── The section ─────────────────────────────────────────────────────────────

export function ReviewTables({
  cycleId,
  review,
  flaggedClients,
  open,
  onToggle,
}: {
  cycleId: string;
  review: ReviewData;
  flaggedClients: Set<string>;
  open: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(review));
  const [state, save, saving] = useActionState<ReviewSaveState, ReviewPayload>(
    saveReviewTables.bind(null, cycleId),
    null
  );
  const errorRef = useRef<HTMLDivElement>(null);

  // The stored rows are the baseline for "has anything changed". Re-derived
  // whenever the server sends fresh ones (after a save, or another tab's).
  const baseline = useMemo(() => JSON.stringify(toDraft(review)), [review]);
  const dirty = JSON.stringify(draft) !== baseline;

  // Fresh rows from the server reseed the draft — but never on top of someone
  // who is mid-edit. Nothing refreshes this page in the background today; the
  // day something does, half-typed work must not vanish without a word.
  useEffect(() => {
    if (!editing) setDraft(toDraft(review));
  }, [review, editing]);

  useEffect(() => {
    if (state?.ok) {
      setEditing(false);
      router.refresh();
    }
  }, [state, router]);

  // A rejected save must land where the eyes are, and be announced.
  useEffect(() => {
    if (state && !state.ok) {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      errorRef.current?.focus();
    }
  }, [state]);

  const edit = (fn: (d: Draft) => void) =>
    setDraft((prev) => {
      const next: Draft = JSON.parse(JSON.stringify(prev));
      fn(next);
      return next;
    });

  const startEditing = () => {
    setDraft(toDraft(review));
    setEditing(true);
  };

  const discard = () => {
    if (dirty && !window.confirm("Discard your edits and put every cell back to what is saved?")) return;
    setDraft(toDraft(review));
    setEditing(false);
  };

  // Recalculate is a plain button, not a form action, so the dispatch has to be
  // put in a transition by hand — without it React never reports `saving`, and
  // the button neither says "Recalculating…" nor stops a second click landing a
  // second write.
  const recalculate = () => startTransition(() => save(draftPayload(draft)));

  /**
   * A person renamed in the People table is the same person everywhere else, so
   * the rename follows them into Lead / BD / Lead source and their contributions
   * column. Applied on blur, once the new name is finished — renaming on every
   * keystroke would rewrite the whole cycle while someone was still typing.
   */
  const propagateRename = (previous: string, next: string) => {
    const from = key(previous);
    const to = next.trim();
    if (!from || !to || from === key(to)) return;
    edit((d) => {
      for (const a of d.assignments) {
        if (key(a.lead) === from) a.lead = to;
        if (key(a.bd) === from) a.bd = to;
        if (key(a.leadSource) === from) a.leadSource = to;
      }
      d.persons = d.persons.map((p) => (key(p) === from ? to : p));
    });
  };

  // People not yet given a contributions column — the choices behind "Add person column".
  const uncolumned = draft.people
    .map((p) => p.name.trim())
    .filter((n) => n && !draft.persons.some((c) => key(c) === key(n)));

  const issueChip =
    flaggedClients.size > 0 ? (
      <span className="ml-2 rounded-full border border-red-400 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">
        ⚠ {flaggedClients.size} data issue{flaggedClients.size > 1 ? "s" : ""}
      </span>
    ) : null;

  const dirtyChip = dirty ? (
    <span className="ml-2 rounded-full border border-gold-300 bg-gold-100 px-2 py-0.5 text-[11px] font-bold text-gold-800">
      Unsaved edits
    </span>
  ) : null;

  return (
    <Section
      title="Review & validation"
      subtitle={editing ? undefined : "the three sheets, as read"}
      open={open}
      onToggle={onToggle}
      titleExtra={
        <>
          {editing ? dirtyChip : null}
          {issueChip}
        </>
      }
      action={
        editing ? null : (
          <button
            type="button"
            onClick={startEditing}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
          >
            ✎ Edit tables
          </button>
        )
      }
    >
      {editing ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-lg border border-navy-100 bg-navy-50 px-3 py-2">
            <span className="min-w-[14rem] flex-1 text-xs text-navy-700">
              Editing all three sheets. <strong className="text-navy-900">Recalculate</strong> saves your changes and
              rebuilds every table below.
            </span>
            <button
              type="button"
              onClick={discard}
              disabled={saving}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50 disabled:opacity-60"
            >
              Discard changes
            </button>
            <button
              type="button"
              onClick={recalculate}
              disabled={saving || !dirty}
              className="rounded-lg bg-navy-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-navy-700 disabled:opacity-40"
            >
              {saving ? "Recalculating…" : "↻ Recalculate"}
            </button>
          </div>

          {state && !state.ok ? (
            <div
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-700 focus:outline-none"
            >
              <div className="font-semibold">Nothing was saved — {state.errors.length} thing{state.errors.length > 1 ? "s" : ""} to fix:</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {state.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : state?.ok ? (
        <p className="mb-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
          {state.message}
        </p>
      ) : null}

      {/* ── People ── */}
      <p className="mb-2 text-xs text-muted">People</p>
      <div className={scrollWrap + (editing ? "" : " max-w-2xl")}>
        <table className="ff-data-table min-w-full divide-y divide-line">
          <thead className="bg-navy-50/40">
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Role</th>
              <th className={th + " text-right"}>Net monthly salary</th>
              <th className={th}>Start date</th>
              {editing ? <th className={th} /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {editing
              ? draft.people.map((p, i) => (
                  <tr key={i}>
                    <TextCell
                      label={`Name, people row ${i + 1}`}
                      value={p.name}
                      width="min-w-[10rem]"
                      onChange={(v) => edit((d) => void (d.people[i].name = v))}
                      onCommit={propagateRename}
                    />
                    <TextCell
                      label={`Role, people row ${i + 1}`}
                      value={p.role}
                      width="min-w-[10rem]"
                      onChange={(v) => edit((d) => void (d.people[i].role = v))}
                    />
                    <TextCell
                      label={`Net monthly salary, people row ${i + 1}`}
                      value={p.netMonthlySalary}
                      width="min-w-[7rem]"
                      align="right"
                      onChange={(v) => edit((d) => void (d.people[i].netMonthlySalary = v))}
                    />
                    <DateCell
                      label={`Start date, people row ${i + 1}`}
                      value={p.startDate}
                      onChange={(v) => edit((d) => void (d.people[i].startDate = v))}
                    />
                    <RemoveButton
                      label={`Remove ${p.name.trim() || `people row ${i + 1}`}`}
                      onClick={() => edit((d) => void d.people.splice(i, 1))}
                    />
                  </tr>
                ))
              : review.people.map((p) => (
                  <tr key={p.id}>
                    <td className={td}>{p.name}</td>
                    <td className={td}>{p.role ?? "—"}</td>
                    <td className={tdr}>{whole(p.netMonthlySalary)}</td>
                    <td className={td}>{displayIncentiveDate(p.startDate)}</td>
                  </tr>
                ))}
            {editing ? (
              <AddRow colSpan={5}>
                <AddButton
                  onClick={() =>
                    edit((d) => void d.people.push({ id: null, name: "", role: "", netMonthlySalary: "", startDate: "" }))
                  }
                >
                  ＋ Add person
                </AddButton>
              </AddRow>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* ── Assignments ── */}
      <p className="mb-2 mt-4 text-xs text-muted">Assignments</p>
      <div className={scrollWrap}>
        <table className="ff-data-table min-w-full divide-y divide-line">
          <thead className="bg-navy-50/40">
            <tr>
              <th className={th}>Client</th>
              <th className={th}>Type</th>
              <th className={th}>Lead</th>
              <th className={th}>BD</th>
              <th className={th}>Lead source</th>
              <th className={th + " text-right"}>Revenue</th>
              <th className={th + " text-right"}>Direct cost</th>
              <th className={th + " text-right"}>Vendor cost</th>
              <th className={th + " text-right"}>Markup %</th>
              <th className={th}>Start date</th>
              <th className={th}>Closure date</th>
              <th className={th}>Status</th>
              {editing ? <th className={th} /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {editing
              ? draft.assignments.map((a, i) => {
                  const at = (n: string) => `${n}, assignments row ${i + 1}`;
                  const set = (k: keyof ReviewAssignmentInput) => (v: string) =>
                    edit((d) => void ((d.assignments[i][k] as string) = v));
                  return (
                    <tr key={i}>
                      <TextCell label={at("Client")} value={a.client} width="min-w-[10rem]" onChange={set("client")} />
                      <SelectCell
                        label={at("Type")}
                        value={a.type === "RET" ? "RET" : "PRJ"}
                        width="min-w-[5rem]"
                        onChange={set("type")}
                        options={[
                          { value: "PRJ", label: "PRJ" },
                          { value: "RET", label: "RET" },
                        ]}
                      />
                      <TextCell label={at("Lead")} value={a.lead} width="min-w-[9rem]" onChange={set("lead")} />
                      <TextCell label={at("BD")} value={a.bd} width="min-w-[9rem]" onChange={set("bd")} />
                      <TextCell label={at("Lead source")} value={a.leadSource} width="min-w-[9rem]" onChange={set("leadSource")} />
                      <TextCell label={at("Revenue")} value={a.revenue} width="min-w-[7rem]" align="right" onChange={set("revenue")} />
                      <TextCell label={at("Direct cost")} value={a.directCost} width="min-w-[7rem]" align="right" onChange={set("directCost")} />
                      <TextCell label={at("Vendor cost")} value={a.vendorCost} width="min-w-[6.5rem]" align="right" onChange={set("vendorCost")} />
                      <TextCell label={at("Markup %")} value={a.markupPct} width="min-w-[5.5rem]" align="right" onChange={set("markupPct")} />
                      <DateCell label={at("Start date")} value={a.startDate} onChange={set("startDate")} />
                      <DateCell label={at("Closure date")} value={a.closeDate} onChange={set("closeDate")} />
                      <SelectCell
                        label={at("Status")}
                        value={a.status}
                        width="min-w-[7.5rem]"
                        onChange={set("status")}
                        options={ASSIGNMENT_STATUSES.map((s) => ({ value: s, label: statusMeta(s).label }))}
                      />
                      <RemoveButton
                        label={`Remove ${a.client.trim() || `assignments row ${i + 1}`}`}
                        onClick={() => edit((d) => void d.assignments.splice(i, 1))}
                      />
                    </tr>
                  );
                })
              : review.assignments
                  .slice()
                  .sort((a, b) => statusMeta(a.status).order - statusMeta(b.status).order)
                  .map((a) => (
                    <tr key={a.id}>
                      <td className={td}>{a.client}</td>
                      <td className={td}>{a.type}</td>
                      <td className={td}>{a.lead}</td>
                      <td className={td}>{a.bd}</td>
                      <td className={td}>{a.leadSource ?? "—"}</td>
                      <td className={tdr}>{a.revenue == null ? "—" : whole(a.revenue)}</td>
                      <td className={tdr}>{a.directCost == null ? "—" : whole(a.directCost)}</td>
                      <td className={tdr}>{a.vendorCost ? whole(a.vendorCost) : "—"}</td>
                      <td className={tdr}>{a.markupPct ? `${a.markupPct}%` : "—"}</td>
                      <td className={td}>{displayIncentiveDate(a.startDate)}</td>
                      <td className={td}>{displayIncentiveDate(a.closeDate)}</td>
                      <td className={td}>
                        <StatusPill status={a.status} />
                      </td>
                    </tr>
                  ))}
            {editing ? (
              <AddRow colSpan={13}>
                <AddButton
                  onClick={() =>
                    edit((d) =>
                      void d.assignments.push({
                        id: null,
                        client: "",
                        type: "PRJ",
                        lead: "",
                        bd: "",
                        leadSource: "",
                        revenue: "",
                        directCost: "",
                        vendorCost: "",
                        markupPct: "",
                        startDate: "",
                        closeDate: "",
                        status: "pending",
                      })
                    )
                  }
                >
                  ＋ Add assignment
                </AddButton>
              </AddRow>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* ── Contributions ── */}
      <p className="mb-2 mt-4 text-xs text-muted">
        {editing ? (
          <>
            Contributions (client × person) — the <span className="font-semibold text-ink">Total</span> column re-adds as
            you type
          </>
        ) : (
          <>
            Contributions (client × person) — the <span className="font-semibold text-ink">Total</span> column flags any
            client that isn&rsquo;t 100%
          </>
        )}
      </p>
      <div className={scrollWrap}>
        {editing ? (
          <EditableContributions
            draft={draft}
            edit={edit}
            uncolumned={uncolumned}
          />
        ) : (
          <ReadOnlyContributions review={review} flaggedClients={flaggedClients} />
        )}
      </div>
    </Section>
  );
}

function ReadOnlyContributions({ review, flaggedClients }: { review: ReviewData; flaggedClients: Set<string> }) {
  const persons = contribPersonOrder(review);
  const clients: string[] = [];
  for (const c of review.contributions) if (!clients.includes(c.client)) clients.push(c.client);
  const shareAt = new Map(review.contributions.map((c) => [`${c.client}||${c.person}`, c.share]));
  const total = (client: string) =>
    review.contributions.filter((c) => c.client === client).reduce((s, c) => s + c.share, 0);

  return (
    <table className="ff-data-table min-w-full divide-y divide-line">
      <thead className="bg-navy-50/40">
        <tr>
          <th className={th}>Client</th>
          {persons.map((p) => (
            <th key={p} className={th + " text-right"}>
              {p}
            </th>
          ))}
          <th className={th + " text-right"}>Total</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {clients.map((c) => {
          const t = total(c);
          const off = flaggedClients.has(c);
          return (
            <tr key={c} className={off ? "bg-amber-50" : undefined}>
              <td className={td}>
                {c}
                {off ? (
                  <HoverTip
                    text={`Contributions total ${pct(t)} — must be 100%. This assignment is excluded from the payout until the shares are corrected.`}
                    className="ml-1 font-bold text-red-600"
                  >
                    ⚠
                  </HoverTip>
                ) : null}
              </td>
              {persons.map((p) => {
                const s = shareAt.get(`${c}||${p}`);
                return (
                  <td key={p} className={tdr}>
                    {s == null ? "—" : pct(s)}
                  </td>
                );
              })}
              <td className={tdr + (off ? " bg-red-50 font-bold text-red-600" : "")}>
                {pct(t)}
                {off ? (
                  <HoverTip
                    text="Must total 100%. This assignment is excluded from the payout until the shares are corrected."
                    className="ml-1 font-bold text-red-600"
                  >
                    ⚠
                  </HoverTip>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function EditableContributions({
  draft,
  edit,
  uncolumned,
}: {
  draft: Draft;
  edit: (fn: (d: Draft) => void) => void;
  uncolumned: string[];
}) {
  const cols = draft.persons.length;
  return (
    <table className="ff-data-table min-w-full divide-y divide-line">
      <thead className="bg-navy-50/40">
        <tr>
          <th className={th}>Client</th>
          {draft.persons.map((p, pi) => (
            <th key={pi} className={th + " text-right"}>
              <span className="inline-flex items-center gap-1.5">
                {p}
                <button
                  type="button"
                  aria-label={`Remove the ${p} column`}
                  title={`Remove the ${p} column`}
                  onClick={() =>
                    edit((d) => {
                      d.persons.splice(pi, 1);
                      for (const r of d.rows) r.shares.splice(pi, 1);
                    })
                  }
                  className="grid h-4 w-4 place-items-center rounded border border-white/40 text-[9px] leading-none text-white/80 hover:bg-white/20 hover:text-white"
                >
                  ✕
                </button>
              </span>
            </th>
          ))}
          <th className={th + " text-right"}>Total</th>
          <th className={th} />
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {draft.rows.map((row, ri) => {
          const total = draftRowTotal(row);
          const off = isOffTotal(total);
          return (
            <tr key={ri} className={off ? "bg-amber-50" : undefined}>
              <TextCell
                label={`Client, contributions row ${ri + 1}`}
                value={row.client}
                width="min-w-[10rem]"
                onChange={(v) => edit((d) => void (d.rows[ri].client = v))}
              />
              {draft.persons.map((p, pi) => (
                <td key={pi} className={editCell}>
                  <span className="relative flex items-center">
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`${p}'s share of ${row.client || `contributions row ${ri + 1}`}`}
                      value={row.shares[pi] ?? ""}
                      onChange={(e) => edit((d) => void (d.rows[ri].shares[pi] = e.target.value))}
                      className={inputCls + " min-w-[5rem] pr-5 text-right tabular-nums"}
                    />
                    <span className="pointer-events-none absolute right-2 text-xs text-muted">%</span>
                  </span>
                </td>
              ))}
              <td className={tdr + (off ? " bg-red-50 font-bold text-red-600" : "")}>
                {total.toFixed(1)}%{off ? " ⚠" : ""}
              </td>
              <RemoveButton
                label={`Remove ${row.client.trim() || `contributions row ${ri + 1}`}`}
                onClick={() => edit((d) => void d.rows.splice(ri, 1))}
              />
            </tr>
          );
        })}
        <AddRow colSpan={cols + 3}>
          <span className="flex flex-wrap items-center gap-3">
            <AddButton
              onClick={() =>
                edit((d) => void d.rows.push({ client: "", shares: d.persons.map(() => "") }))
              }
            >
              ＋ Add client
            </AddButton>
            {uncolumned.length > 0 ? (
              <>
                <span className="text-line">|</span>
                <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted">
                  Add person column
                  <select
                    aria-label="Add a person column"
                    value=""
                    onChange={(e) => {
                      const name = e.target.value;
                      if (!name) return;
                      edit((d) => {
                        d.persons.push(name);
                        for (const r of d.rows) r.shares.push("");
                      });
                    }}
                    className={inputCls + " min-w-[9rem] py-0.5 text-xs"}
                  >
                    <option value="">Choose…</option>
                    {uncolumned.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
          </span>
        </AddRow>
      </tbody>
    </table>
  );
}
