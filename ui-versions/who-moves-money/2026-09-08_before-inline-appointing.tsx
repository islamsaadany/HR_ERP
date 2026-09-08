import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSuperUser } from "@/lib/roles";
import { formatDate } from "@/lib/labels";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { appointConfirmer, removeConfirmer, appointUnitHead, removeUnitHead } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Who moves money — Super User only (spec 041, widened 2026-08-26).
 *
 * ONE SCREEN FOR THE WHOLE CHAIN. The CEO asked for the terminology and access to be
 * consistent, and the reason it did not feel so is that the three powers exist in two
 * different shapes: releasing and confirming are APPOINTMENTS, held per business unit
 * because each unit banks separately, while being Finance is an account ROLE and is not
 * about one unit at all. That split is right; what was missing was a single place to see
 * all three. So the Finance row is shown here and edited on the employee record — one
 * screen answers the question, one place owns each setting.
 *
 * Named for what each person DOES, in the order money moves: releases → creates the
 * transaction → confirms at the bank. Deliberately not called "roles", which already means
 * an account's role — the very collision being removed.
 */
export default async function WhoMovesMoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireSuperUser();
  const { ok, error } = await searchParams;

  const [units, candidates, financeStaff] = await Promise.all([
    prisma.businessUnit.findMany({
      select: {
        id: true,
        name: true,
        heads: {
          select: {
            id: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true, status: true, title: true } },
            appointedBy: { select: { name: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        transactionConfirmers: {
          select: {
            id: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true, status: true, title: true } },
            appointedBy: { select: { name: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { paymentBatches: { where: { status: "SUBMITTED" } } } },
      },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, title: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE", role: { in: ["FINANCE", "SUPER_USER"] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const nobodyConfirmsAnywhere = units.every((u) => u.transactionConfirmers.length === 0);

  return (
    <div>
      <Link href="/admin" className="text-[12.5px] font-semibold text-navy-700 hover:underline">
        ← Admin
      </Link>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · Finance</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Who moves money</h1>
      <p className="mt-1 max-w-[74ch] text-muted">
        The three steps a payment takes, per business unit and in the order the money moves. Releasing
        and confirming are appointed here, one unit at a time, because each unit banks separately.
        Being Finance is not about one unit, so it stays on the person&rsquo;s employee record — shown
        below, but set there.
      </p>

      {ok ? <p className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">✓ {ok}</p> : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {units.length === 0 ? (
        <p className="mt-6 rounded-lg border border-gold-300 bg-gold-50 px-4 py-3 text-sm text-gold-800">
          There are no business units yet, so there is nothing to appoint anybody to. Add one under
          Admin → Business units first.
        </p>
      ) : nobodyConfirmsAnywhere ? (
        <p className="mt-6 rounded-lg border border-gold-300 bg-gold-50 px-4 py-3 text-sm text-gold-800">
          Nobody is appointed to confirm anywhere, so Finance cannot send any transactions.
          Appointing somebody — including yourself — unblocks that unit immediately.
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-4">
        {units.map((unit) => (
          <section key={unit.id} className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#fbfaf7] px-4 py-3">
              <p className="font-serif text-[17px] text-ink">{unit.name}</p>
              <p className="text-[11.5px] text-muted">
                {unit._count.paymentBatches > 0
                  ? `${unit._count.paymentBatches} ${
                      unit._count.paymentBatches === 1 ? "transaction" : "transactions"
                    } awaiting confirmation`
                  : "nothing waiting"}
              </p>
            </div>

            <Appointment
              step="Releases payments"
              unitId={unit.id}
              unitName={unit.name}
              rows={unit.heads}
              candidates={candidates}
              appoint={appointUnitHead}
              remove={removeUnitHead}
              emptyNote={`Nobody appointed — ${unit.name}'s payments cannot be released.`}
              verb="release"
            />

            {/* The account role, shown so this screen answers the whole question — but set
                on the employee record, so two screens never claim to own one setting. */}
            <div className="flex flex-wrap items-start gap-3 border-t border-line px-4 py-3">
              <span className="w-[9.5rem] shrink-0 text-[10px] font-extrabold uppercase tracking-[0.07em] text-muted">
                Creates the transaction
              </span>
              <span className="min-w-[12rem] flex-1 text-sm">
                {financeStaff.length === 0 ? (
                  <span className="font-semibold text-red-700">
                    Nobody holds Finance, so no transaction can be created.
                  </span>
                ) : (
                  <>
                    {financeStaff.map((f) => (
                      <span
                        key={f.id}
                        className="mr-1.5 inline-block rounded-full border border-dashed border-line bg-surface px-3 py-1 text-[12.5px] text-muted"
                      >
                        {f.name}
                      </span>
                    ))}
                    <span className="block pt-1 text-[11px] text-muted">
                      the Finance role — company-wide, not per unit
                    </span>
                  </>
                )}
              </span>
              <Link
                href="/admin/employees"
                className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-navy-700 hover:bg-navy-50"
              >
                Open registry
              </Link>
            </div>

            <Appointment
              step="Confirms at the bank"
              unitId={unit.id}
              unitName={unit.name}
              rows={unit.transactionConfirmers}
              candidates={candidates}
              appoint={appointConfirmer}
              remove={removeConfirmer}
              emptyNote={`Nobody appointed — Finance cannot send ${unit.name}'s transactions.`}
              verb="confirm"
            />
          </section>
        ))}
      </div>

      <p className="mt-6 max-w-[74ch] text-[11.5px] text-muted">
        Unlike everywhere else in this application, holding top-level access does <b>not</b> by itself
        let you release or confirm — only the people listed against a unit can, and only for that unit.
        That is deliberate: the instruction was that money waits for the appointed person and nobody
        else stands in. Appointing yourself takes one click, so an empty list is never a lock-out.
        There is no appointment covering every unit, so a unit added later starts with nobody rather
        than quietly inheriting whoever was appointed before it existed. One person may hold two of
        the three steps for a unit; that is an arrangement, not a mistake, and nothing here warns
        about it.
      </p>
    </div>
  );
}

type Row = {
  id: string;
  createdAt: Date;
  user: { id: string; name: string | null; email: string; status: string; title: string | null };
  appointedBy: { name: string | null } | null;
};

/**
 * One appointment step for one unit. Extracted because releasing and confirming are the
 * same list, the same form and the same rules — two copies would drift the first time one
 * of them was improved.
 */
function Appointment({
  step,
  unitId,
  unitName,
  rows,
  candidates,
  appoint,
  remove,
  emptyNote,
  verb,
}: {
  step: string;
  unitId: string;
  unitName: string;
  rows: Row[];
  candidates: { id: string; name: string | null; title: string | null }[];
  appoint: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
  emptyNote: string;
  verb: string;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3 border-t border-line px-4 py-3">
      <span className="w-[9.5rem] shrink-0 pt-1 text-[10px] font-extrabold uppercase tracking-[0.07em] text-navy-600">
        {step}
      </span>

      <div className="min-w-[12rem] flex-1">
        {rows.length === 0 ? (
          <p className="text-[12.5px] font-semibold text-red-700">{emptyNote}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
              >
                <span className="text-sm">
                  <b className="font-semibold text-ink">{r.user.name}</b>
                  <span className="block text-[11.5px] text-muted">
                    {r.user.title ? `${r.user.title} · ` : ""}
                    {r.user.email}
                    {r.appointedBy?.name ? ` · appointed by ${r.appointedBy.name}` : ""} ·{" "}
                    {formatDate(r.createdAt)}
                    {r.user.status !== "ACTIVE" ? ` · no longer active, so cannot ${verb}` : ""}
                  </span>
                </span>
                <form action={remove}>
                  <input type="hidden" name="userId" value={r.user.id} />
                  <input type="hidden" name="businessUnitId" value={unitId} />
                  <PendingSubmitButton
                    pendingLabel="Removing…"
                    className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-muted hover:border-red-200 hover:text-red-700"
                  >
                    Remove
                  </PendingSubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form action={appoint} className="mt-2.5 flex flex-wrap items-end gap-2.5">
          <input type="hidden" name="businessUnitId" value={unitId} />
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
            <span className="sr-only">{`${step} for ${unitName}`}</span>
            <select
              name="userId"
              required
              defaultValue=""
              aria-label={`${step} for ${unitName}`}
              className="w-full rounded-lg border border-navy-200 bg-surface px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Appoint somebody…
              </option>
              {candidates
                .filter((p) => !rows.some((r) => r.user.id === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.title ? ` — ${p.title}` : ""}
                  </option>
                ))}
            </select>
          </label>
          <PendingSubmitButton
            pendingLabel="Appointing…"
            className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900"
          >
            Appoint
          </PendingSubmitButton>
        </form>
      </div>
    </div>
  );
}
