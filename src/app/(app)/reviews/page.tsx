import Link from "next/link";
import { requireRealUser } from "@/lib/reviews/access";
import { requireModuleEnabled } from "@/lib/modules";
import { formatDate } from "@/lib/labels";
import {
  quarterOf,
  quarterLabel,
  quarterMonths,
  recentQuarters,
  type QuarterRef,
} from "@/lib/reviews/quarters";
import { buildSystemPack, packIsEmpty } from "@/lib/reviews/pack";
import { currentManagerOf, currentReportsOf, mySheets } from "@/lib/reviews/queries";
import { OpenSheetButton } from "@/components/reviews/OpenSheetButton";
import { SystemPackTiles } from "@/components/reviews/SystemPackTiles";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

type Row = {
  sheetId: string | null;
  counterpartId: string;
  counterpartName: string;
  state: string;
  tone: "action" | "waiting" | "done";
};

export default async function ReviewsPage() {
  const me = await requireRealUser();
  await requireModuleEnabled("reviews");

  const now = quarterOf(new Date());
  const [manager, reports, sheets] = await Promise.all([
    currentManagerOf(me.id),
    currentReportsOf(me.id),
    mySheets(me.id),
  ]);

  const pack = await buildSystemPack(me.id, now);

  const sheetFor = (ref: QuarterRef, employeeId: string, managerId: string) =>
    sheets.find(
      (s) =>
        s.year === ref.year &&
        s.quarter === ref.quarter &&
        s.employeeId === employeeId &&
        s.managerId === managerId
    ) ?? null;

  /** What this pair still has to do — the only "status" this module has. */
  const describe = (
    sheet: ReturnType<typeof sheetFor>,
    iAm: "employee" | "manager"
  ): { state: string; tone: Row["tone"] } => {
    if (!sheet) return { state: "Not started", tone: "action" };
    if (sheet.openedAt) {
      if (sheet.outcome?.finalAt) {
        return { state: `Met ${formatDate(sheet.openedAt)} · outcome agreed`, tone: "done" };
      }
      return { state: `Met ${formatDate(sheet.openedAt)} · agree the outcome`, tone: "action" };
    }
    const mine = iAm === "employee" ? sheet.employeeSubmittedAt : sheet.managerSubmittedAt;
    const theirs = iAm === "employee" ? sheet.managerSubmittedAt : sheet.employeeSubmittedAt;
    if (!mine) return { state: "You have not submitted yet", tone: "action" };
    if (!theirs) return { state: "Waiting for them to submit", tone: "waiting" };
    const myMet =
      iAm === "employee" ? sheet.employeeMetConfirmedAt : sheet.managerMetConfirmedAt;
    if (!myMet) return { state: "Both submitted · confirm you met", tone: "action" };
    return { state: "Waiting for them to confirm you met", tone: "waiting" };
  };

  const myRow: Row | null = manager
    ? (() => {
        const sheet = sheetFor(now, me.id, manager.id);
        const d = describe(sheet, "employee");
        return {
          sheetId: sheet?.id ?? null,
          counterpartId: manager.id,
          counterpartName: manager.name,
          ...d,
        };
      })()
    : null;

  const teamRows: Row[] = reports.map((r) => {
    const sheet = sheetFor(now, r.id, me.id);
    const d = describe(sheet, "manager");
    return { sheetId: sheet?.id ?? null, counterpartId: r.id, counterpartName: r.name, ...d };
  });

  const past = sheets.filter((s) => !(s.year === now.year && s.quarter === now.quarter));

  return (
    <div className="max-w-4xl">
      {/* People sit on this page waiting for a counterpart to submit or confirm. */}
      <AutoRefresh />

      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Reviews &amp; 1:1s
      </p>
      <h1 className="mt-1 font-serif text-2xl text-navy-900">{quarterLabel(now)}</h1>
      <p className="mt-1 text-sm text-muted">
        {quarterMonths(now)} · private to you and the person you are reviewing with.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href="/reviews/journal"
          className="rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-xs font-semibold text-navy-700"
        >
          Your journal
        </Link>
        <Link
          href="/reviews/one-on-ones"
          className="rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-xs font-semibold text-navy-700"
        >
          1:1s
        </Link>
      </div>

      {/* ── Your own review ─────────────────────────────────────────────── */}
      <section className="mt-7">
        <h2 className="font-serif text-lg text-navy-900">Your review</h2>
        {myRow ? (
          <>
            <RowCard row={myRow} quarter={now} youAre="employee" />
            {!packIsEmpty(pack) && (
              <div className="mt-3">
                <SystemPackTiles pack={pack} />
              </div>
            )}
          </>
        ) : (
          <p className="mt-2 rounded-xl border border-line bg-surface p-4 text-sm text-muted">
            You do not report to anyone, so there is no review to hold. Your{" "}
            <Link href="/reviews/journal" className="font-semibold text-navy-700 underline">
              journal
            </Link>{" "}
            is still yours to keep.
          </p>
        )}
      </section>

      {/* ── Your team ───────────────────────────────────────────────────── */}
      {teamRows.length > 0 && (
        <section className="mt-8">
          <h2 className="font-serif text-lg text-navy-900">Your team</h2>
          <p className="mt-1 text-xs text-muted">
            {teamRows.length} {teamRows.length === 1 ? "person reports" : "people report"} to you.
          </p>
          <div className="mt-2 space-y-2">
            {teamRows.map((row) => (
              <RowCard key={row.counterpartId} row={row} quarter={now} youAre="manager" />
            ))}
          </div>
        </section>
      )}

      {/* ── Earlier quarters ────────────────────────────────────────────── */}
      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="font-serif text-lg text-navy-900">Earlier</h2>
          <div className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {past.map((s) => {
              const other = s.employeeId === me.id ? s.manager : s.employee;
              return (
                <Link
                  key={s.id}
                  href={`/reviews/${s.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm hover:bg-navy-50"
                >
                  <span className="font-semibold text-navy-900">
                    {quarterLabel({ year: s.year, quarter: s.quarter as 1 | 2 | 3 | 4 })}
                  </span>
                  <span className="text-muted">
                    with {other.name}
                    {s.employeeId === me.id ? "" : " (you were the manager)"}
                  </span>
                  <span className="ml-auto text-xs text-muted">
                    {s.outcome?.finalAt
                      ? `Agreed ${formatDate(s.outcome.finalAt)}`
                      : s.openedAt
                        ? "Outcome not agreed"
                        : "Never met — stayed sealed"}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <p className="mt-8 text-xs leading-relaxed text-muted">
        Nobody outside a pair can read a review, a 1:1 or a journal — not HR, not a Super
        User. There is no completion report and nothing chases anyone: a quarter that ends
        without a meeting simply stays sealed.
      </p>
    </div>
  );
}

function RowCard({
  row,
  quarter,
  youAre,
}: {
  row: Row;
  quarter: QuarterRef;
  youAre: "employee" | "manager";
}) {
  const chip =
    row.tone === "done"
      ? "border-green-200 bg-green-50 text-green-700"
      : row.tone === "action"
        ? "border-gold-300 bg-gold-100 text-gold-800"
        : "border-line bg-paper text-muted";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface p-4 shadow-card">
      <span className="font-semibold text-navy-900">
        {youAre === "employee" ? `With ${row.counterpartName}` : row.counterpartName}
      </span>
      <span className="text-sm text-muted">{row.state}</span>
      <span className={`ml-auto rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${chip}`}>
        {row.tone === "done" ? "Done" : row.tone === "action" ? "Your turn" : "Waiting"}
      </span>
      {row.sheetId ? (
        <Link
          href={`/reviews/${row.sheetId}`}
          className="rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-semibold text-white"
        >
          Open
        </Link>
      ) : (
        <OpenSheetButton
          year={quarter.year}
          quarter={quarter.quarter}
          counterpartId={row.counterpartId}
        />
      )}
    </div>
  );
}
