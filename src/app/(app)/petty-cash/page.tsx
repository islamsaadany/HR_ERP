import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { canManagePettyCash } from "@/lib/finance/access";
import { accountBalanceFor } from "@/lib/finance/queries";
import { describeBalance } from "@/lib/finance/pettycash";
import { fromPiastres } from "@/lib/finance/money";
import { formatEGP2 } from "@/lib/labels";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { createAccount } from "@/app/(app)/petty-cash/finance-actions";

export const dynamic = "force-dynamic";

const STATUS_CHIP: Record<string, string> = {
  OPEN: "border-navy-200 bg-navy-50 text-navy-700",
  SUBMITTED: "border-gold-300 bg-gold-100 text-gold-800",
  CLOSED: "border-green-200 bg-green-50 text-green-700",
};

/**
 * Petty cash accounts (spec 039).
 *
 * ONE surface for Finance and custodians: Finance sees every float and the controls, a custodian
 * sees the one they hold. Two parallel pages would be a second copy of the access rule, which is
 * the failure this codebase has already paid for once in the Learning module.
 */
export default async function PettyCashPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const manager = canManagePettyCash(user.role);
  const { ok, error } = await searchParams;

  const accounts = await prisma.pettyCashAccount.findMany({
    where: manager ? {} : { custodianId: user.id },
    include: {
      custodian: { select: { name: true, status: true } },
      periods: {
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { label: true, status: true },
      },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  // A person who holds no float and isn't Finance has no business here at all.
  if (accounts.length === 0 && !manager) redirect("/dashboard");

  const rows = await Promise.all(
    accounts.map(async (a) => {
      const balance = await accountBalanceFor(a.id);
      return {
        id: a.id,
        name: a.name,
        archived: a.status === "ARCHIVED",
        custodian: a.custodian.name,
        custodianActive: a.custodian.status === "ACTIVE",
        period: a.periods[0] ?? null,
        balance,
        standing: describeBalance(balance, a.custodian.name).sentence,
      };
    }),
  );

  const candidates = manager
    ? await prisma.user.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true, department: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div>
      <AutoRefresh />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        {manager ? "Finance" : "My float"}
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Petty cash</h1>
      <p className="mt-1 max-w-[72ch] text-muted">
        A float is money the company has advanced to someone. A negative balance means they have spent their
        own money on our behalf and we owe them.
      </p>

      {ok ? <p className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">✓ {ok}</p> : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
          No petty cash accounts yet.
        </div>
      ) : (
        <div className="ff-data-scroll mt-6 rounded-xl border border-line bg-surface">
          <table className="ff-data-table text-sm">
            <thead>
              <tr>
                <th className="px-3 py-3 text-left font-medium">Account</th>
                <th className="px-3 py-3 text-left font-medium">Custodian</th>
                <th className="px-3 py-3 text-left font-medium">Current period</th>
                <th className="px-3 py-3 text-right font-medium">Balance</th>
                <th className="px-3 py-3 text-left font-medium">Standing</th>
                <th className="px-3 py-3 text-right font-medium">·</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2">
                    <span className="font-medium text-ink">{r.name}</span>
                    {r.archived ? (
                      <span className="ml-2 rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] font-semibold text-muted">
                        Archived
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {r.custodian ?? "—"}
                    {r.custodianActive ? null : (
                      <span className="ml-2 rounded-full border border-gold-300 bg-gold-100 px-2 py-0.5 text-[10px] font-bold text-gold-800">
                        Needs a new custodian
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {r.period ? (
                      <>
                        {r.period.label}{" "}
                        <span
                          className={`ml-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_CHIP[r.period.status]}`}
                        >
                          {r.period.status === "OPEN"
                            ? "Open"
                            : r.period.status === "SUBMITTED"
                              ? "Submitted"
                              : "Closed"}
                        </span>
                      </>
                    ) : (
                      "none yet"
                    )}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${r.balance < 0 ? "text-red-700" : "text-ink"}`}
                  >
                    {formatEGP2(fromPiastres(r.balance))}
                  </td>
                  <td className="px-3 py-2 text-muted">{r.standing}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/petty-cash/${r.id}`}
                      className="rounded-lg border border-navy-200 px-3 py-1.5 text-[12.5px] font-semibold text-navy-700 hover:bg-navy-50"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {manager ? (
        <details className="mt-6 rounded-xl border border-line bg-surface">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-navy-800 [&::-webkit-details-marker]:hidden">
            <span aria-hidden>+</span> New account
          </summary>
          <form action={createAccount} className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-navy-700">Name</span>
              <input
                type="text"
                name="name"
                required
                placeholder="Marketing petty cash"
                className="w-full rounded-lg border border-navy-200 bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-navy-700">Who holds it</span>
              <select
                name="custodianId"
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
                    {c.department ? ` — ${c.department}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <PendingSubmitButton
                pendingLabel="Creating…"
                className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900"
              >
                Create the account
              </PendingSubmitButton>
            </div>
          </form>
        </details>
      ) : null}
    </div>
  );
}
