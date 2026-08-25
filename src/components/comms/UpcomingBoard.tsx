import Link from "next/link";
import { CHIP } from "@/components/learning/ui";
import type { UpcomingRow, UpcomingState } from "@/lib/comms/upcoming";
import { WriteNowButton } from "@/components/comms/WriteNowButton";
import { DraftRow, type DraftItem } from "@/components/comms/DraftRow";

/**
 * Who is coming up, over a chosen period (approved 2026-08-25).
 *
 * Shared by HR's queue and a manager's own screen. They differ only in WHICH rows they are handed
 * — the scoping happens in `upcomingFor`, not here — so the two screens cannot drift into showing
 * the same thing differently.
 *
 * A row that has no draft behind it is not an omission; it is the normal state of an occasion
 * three weeks out. It reads "Not written yet" and offers to write it, which is the point of the
 * whole change.
 */

const PERIODS = [
  { key: "due", label: "Due now" },
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function stateChip(state: UpcomingState) {
  switch (state) {
    case "DUE":
      return <span className={CHIP.attention}>Due now</span>;
    case "WRITTEN":
      // Navy, not green: written is not done. Green is reserved for a done-state, and a message
      // nobody has sent yet is the opposite of done.
      return <span className={CHIP.navy}>Written</span>;
    case "SENT":
      return <span className={CHIP.done}>Sent</span>;
    case "MISSED":
      return <span className={CHIP.muted}>Closed</span>;
    default:
      return <span className={CHIP.muted}>Not written yet</span>;
  }
}

function occasionLabel(row: UpcomingRow): string {
  if (row.kind === "BIRTHDAY") return "Birthday";
  const y = row.years ?? 0;
  return `${y} ${y === 1 ? "year" : "years"}`;
}

export function UpcomingBoard({
  rows,
  period,
  basePath,
  showAssignee,
  canPreview,
  emptyNote,
}: {
  rows: Array<UpcomingRow & { draft: DraftItem | null }>;
  period: PeriodKey;
  /** Where the tabs link back to — the two screens live at different addresses. */
  basePath: string;
  /** HR is looking across everybody's, so it needs to say whose each one is. */
  showAssignee: boolean;
  /** The preview route is an admin surface. */
  canPreview: boolean;
  emptyNote: string;
}) {
  // Grouped by month, because a quarter read as one flat list is a wall.
  const groups = new Map<string, Array<UpcomingRow & { draft: DraftItem | null }>>();
  for (const r of rows) {
    const k = `${r.occasionDate.getUTCFullYear()}-${r.occasionDate.getUTCMonth()}`;
    const list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }

  return (
    <div>
      <div className="mt-4 flex flex-wrap gap-2 border-b border-line pb-3">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`${basePath}?period=${p.key}`}
            className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold ${
              period === p.key
                ? "border-navy-800 bg-navy-800 text-white"
                : "border-line bg-surface text-ink hover:bg-navy-50"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-5 max-w-[820px] rounded-xl border border-line bg-surface p-5 text-sm text-muted">
          {emptyNote}
        </p>
      ) : (
        [...groups.entries()].map(([k, list]) => {
          const [, m] = k.split("-");
          return (
            <section key={k} className="mt-5 max-w-[880px]">
              <div className="mb-2 flex items-baseline gap-2">
                <b className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-navy-800">
                  {MONTHS[Number(m)]}
                </b>
                <span className="text-[12px] text-muted">
                  {list.length} {list.length === 1 ? "person" : "people"}
                </span>
              </div>
              <ul className="space-y-2">
                {list.map((row) => {
                  const key = `${row.userId}-${row.kind}-${row.occasionYear}`;

                  // Written: the SAME row HR and managers already use to read, change and send.
                  // Not a link to a different screen — one interaction, wherever it is reached.
                  if (row.draft && row.mine) {
                    return <DraftRow key={key} item={row.draft} canPreview={canPreview} />;
                  }

                  // Not written, or somebody else's. A compact line that says what it is and, when
                  // it is the viewer's to write, offers to write it.
                  return (
                    <li
                      key={key}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3"
                    >
                      <span className="w-[54px] shrink-0 border-r border-line pr-2.5 text-center">
                        <span className="block font-serif text-[18px] leading-none text-navy-800">
                          {String(row.occasionDate.getUTCDate()).padStart(2, "0")}
                        </span>
                        <span className="mt-0.5 block text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted">
                          {MONTHS[row.occasionDate.getUTCMonth()]}
                        </span>
                      </span>

                      <span className="min-w-[180px] flex-1">
                        <span className="block text-[14px] font-bold text-navy-800">{row.name}</span>
                        <span className="mt-0.5 block text-[12.2px] text-muted">
                          {occasionLabel(row)}
                          {row.unitName ? ` · ${row.unitName}` : ""}
                          {showAssignee && row.assigneeName ? ` · ${row.assigneeName}` : ""}
                        </span>
                      </span>

                      {stateChip(row.state)}

                      {row.mine && row.state === "UNWRITTEN" ? (
                        <WriteNowButton userId={row.userId} kind={row.kind} occasionYear={row.occasionYear} />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
