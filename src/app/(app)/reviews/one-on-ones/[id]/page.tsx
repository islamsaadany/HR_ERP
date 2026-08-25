import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRealUser, myHalf } from "@/lib/reviews/access";
import { requireModuleEnabled } from "@/lib/modules";
import { formatDate } from "@/lib/labels";
import { oneOnOneForRead, flaggedToRaise } from "@/lib/reviews/queries";
import { OneOnOneBoard } from "@/components/reviews/OneOnOneBoard";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function OneOnOnePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireRealUser();
  await requireModuleEnabled("reviews");
  const { id } = await params;

  // Not one of the pair reads as not-found — a refusal would confirm it exists.
  const record = await oneOnOneForRead(id, me.id);
  if (!record) notFound();

  // My own flagged notes only — this never reads the counterpart's journal,
  // because no query in this module can.
  const flagged = await flaggedToRaise(me.id);

  const half = myHalf(record, me.id);
  if (!half) notFound();

  const other = half === "employee" ? record.manager : record.employee;

  return (
    <div className="max-w-3xl">
      <AutoRefresh />

      <Link
        href="/reviews/one-on-ones"
        className="text-xs font-semibold text-navy-600 hover:underline"
      >
        ← 1:1s
      </Link>

      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        1:1
      </p>
      <h1 className="mt-1 font-serif text-2xl text-navy-900">With {other.name}</h1>
      <p className="mt-1 text-sm text-muted">Held {formatDate(record.heldOn)}</p>

      <div className="mt-5">
        <OneOnOneBoard
          oneOnOneId={record.id}
          notes={record.notes.map((n) => ({
            id: n.id,
            authorName: n.author.name,
            authorInitials: initials(n.author.name),
            mine: n.authorId === me.id,
            body: n.body,
            createdAt: formatDate(n.createdAt),
            fromJournal: n.sourceKind === "JOURNAL",
          }))}
          flagged={flagged.map((f) => ({
            id: f.id,
            body: f.body,
            occurredOn: formatDate(f.occurredOn),
          }))}
          outcome={record.outcome}
          employeeName={record.employee.name.split(" ")[0]}
          managerName={record.manager.name.split(" ")[0]}
          employeeAckAt={record.employeeAckAt ? formatDate(record.employeeAckAt) : null}
          managerAckAt={record.managerAckAt ? formatDate(record.managerAckAt) : null}
          final={Boolean(record.finalAt)}
          iAcknowledged={Boolean(
            half === "employee" ? record.employeeAckAt : record.managerAckAt
          )}
        />
      </div>

      <p className="mt-5 max-w-[70ch] text-xs leading-relaxed text-muted">
        Nothing is sealed in a 1:1 — the point of one is being quick. What needs both of you
        is the outcome, because that is what gets carried to the quarterly review as settled.
        Once you have both agreed it, the record locks.
      </p>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
