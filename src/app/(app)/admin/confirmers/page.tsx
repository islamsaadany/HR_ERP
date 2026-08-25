import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSuperUser } from "@/lib/roles";
import { formatDate } from "@/lib/labels";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { appointConfirmer, removeConfirmer } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Who confirms transactions at the bank (spec 041). Super User only.
 *
 * ONE LIST PER BUSINESS UNIT since 2026-08-25 — each unit banks separately, so each is appointed
 * separately, and one person may hold several. A unit with nobody appointed is stated plainly
 * rather than left blank: an empty row is exactly the thing that stops Finance from sending, and
 * it should read that way here.
 *
 * The page states the unusual rule plainly, because somebody will eventually wonder why their
 * admin account cannot confirm anything.
 */
export default async function ConfirmersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireSuperUser();
  const { ok, error } = await searchParams;

  const [units, candidates] = await Promise.all([
    prisma.businessUnit.findMany({
      select: {
        id: true,
        name: true,
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
  ]);

  const nobodyAnywhere = units.every((u) => u.transactionConfirmers.length === 0);

  return (
    <div>
      <Link href="/admin" className="text-[12.5px] font-semibold text-navy-700 hover:underline">
        ← Admin
      </Link>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Admin · Finance
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Who confirms transactions</h1>
      <p className="mt-1 max-w-[72ch] text-muted">
        Finance creates transactions in the bank; these people confirm them there and record it here.
        Each business unit banks separately, so each one is appointed separately. The appointment
        changes nothing else about what they can see.
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
      ) : nobodyAnywhere ? (
        <p className="mt-6 rounded-lg border border-gold-300 bg-gold-50 px-4 py-3 text-sm text-gold-800">
          Nobody is appointed anywhere, so Finance cannot send any transactions for confirmation.
          Appointing somebody — including yourself — unblocks that unit immediately.
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-4">
        {units.map((unit) => (
          <section
            key={unit.id}
            className={
              "overflow-hidden rounded-xl border border-line border-l-4 bg-surface " +
              (unit.transactionConfirmers.length ? "border-l-navy-800" : "border-l-gold-500")
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#fbfaf7] px-4 py-3">
              <div>
                <p className="font-serif text-[17px] text-ink">{unit.name}</p>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  {unit.transactionConfirmers.length === 0
                    ? "Nobody appointed"
                    : `${unit.transactionConfirmers.length} appointed`}
                  {unit._count.paymentBatches > 0
                    ? ` · ${unit._count.paymentBatches} ${
                        unit._count.paymentBatches === 1 ? "transaction" : "transactions"
                      } waiting`
                    : ""}
                </p>
              </div>
            </div>

            {unit.transactionConfirmers.length === 0 && unit._count.paymentBatches > 0 ? (
              <p className="mx-4 mt-3 rounded-r-lg border-l-[3px] border-gold-500 bg-gold-50 px-3 py-2.5 text-[12.5px] text-gold-800">
                <b>
                  {unit.name} has {unit._count.paymentBatches}{" "}
                  {unit._count.paymentBatches === 1 ? "transaction" : "transactions"} and nobody to
                  confirm {unit._count.paymentBatches === 1 ? "it" : "them"}.
                </b>{" "}
                Appointing yourself takes one click.
              </p>
            ) : null}

            <div className="p-4">
              {unit.transactionConfirmers.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {unit.transactionConfirmers.map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-3"
                    >
                      <span className="text-sm">
                        <b className="font-semibold text-ink">{c.user.name}</b>
                        <span className="block text-[11.5px] text-muted">
                          {c.user.title ? `${c.user.title} · ` : ""}
                          {c.user.email}
                          {c.appointedBy?.name ? ` · appointed by ${c.appointedBy.name}` : ""} ·{" "}
                          {formatDate(c.createdAt)}
                          {c.user.status !== "ACTIVE" ? " · no longer active, so cannot confirm" : ""}
                        </span>
                      </span>
                      <form action={removeConfirmer}>
                        <input type="hidden" name="userId" value={c.user.id} />
                        <input type="hidden" name="businessUnitId" value={unit.id} />
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
              ) : null}

              <form action={appointConfirmer} className="mt-3 flex flex-wrap items-end gap-3">
                <input type="hidden" name="businessUnitId" value={unit.id} />
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-[11.5px] font-semibold text-navy-700">
                    Appoint somebody for {unit.name}
                  </span>
                  <select
                    name="userId"
                    required
                    defaultValue=""
                    className="w-full rounded-lg border border-navy-200 bg-surface px-3 py-2 text-sm"
                  >
                    <option value="" disabled>
                      Choose…
                    </option>
                    {candidates
                      .filter((p) => !unit.transactionConfirmers.some((c) => c.user.id === p.id))
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
          </section>
        ))}
      </div>

      <p className="mt-6 max-w-[72ch] text-[11.5px] text-muted">
        Unlike everywhere else in this application, holding top-level access does <b>not</b> by itself
        let you confirm a transaction — only the people listed against a unit can, and only for that
        unit. That is deliberate: the instruction was that transactions wait for the appointed person
        and nobody else stands in. Appointing yourself takes one click, so an empty list is never a
        lock-out. There is no appointment covering every unit, so a unit added later starts with
        nobody rather than quietly inheriting whoever was appointed before it existed.
      </p>
    </div>
  );
}
