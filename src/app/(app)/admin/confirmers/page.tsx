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

  const [confirmers, candidates] = await Promise.all([
    prisma.transactionConfirmer.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, status: true, title: true } },
        appointedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE", transactionConfirmer: null },
      select: { id: true, name: true, title: true },
      orderBy: { name: "asc" },
    }),
  ]);

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
        The appointment changes nothing else about what they can see.
      </p>

      {ok ? <p className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">✓ {ok}</p> : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {confirmers.length === 0 ? (
        <p className="mt-6 rounded-lg border border-gold-300 bg-gold-50 px-4 py-3 text-sm text-gold-800">
          Nobody is appointed. Finance can still record what they created in the bank, but it will
          wait here until somebody can confirm it — including you, if you appoint yourself below.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {confirmers.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3"
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

      <form
        action={appointConfirmer}
        className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4"
      >
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[11.5px] font-semibold text-navy-700">Appoint somebody</span>
          <select
            name="userId"
            required
            defaultValue=""
            className="w-full rounded-lg border border-navy-200 bg-surface px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Choose…
            </option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.title ? ` — ${c.title}` : ""}
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

      <p className="mt-4 max-w-[72ch] text-[11.5px] text-muted">
        Unlike everywhere else in this application, holding top-level access does <b>not</b> by itself
        let you confirm a transaction — only the people listed here can. That is deliberate: the
        instruction was that transactions wait for the appointed person and nobody else stands in.
        Appointing yourself takes one click, so an empty list is never a lock-out.
      </p>
    </div>
  );
}
