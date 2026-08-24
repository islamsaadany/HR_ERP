import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSuperUser } from "@/lib/roles";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { addValue, renameValue, archiveValue, restoreValue } from "./actions";

export const dynamic = "force-dynamic";

type Row = { id: string; name: string; archivedAt: Date | null };

/**
 * Sections and categories for expenses (spec 039). Super User only.
 *
 * The two lists are INDEPENDENT: the source workbook pairs them freely (Team/office supply,
 * Community/Media coverage) and leaves category blank on half its rows, so a line requires a
 * section, may carry a category, and neither constrains the other.
 */
export default async function ExpenseListsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireSuperUser();
  const { ok, error } = await searchParams;

  const [sections, categories] = await Promise.all([
    prisma.expenseSection.findMany({ orderBy: [{ archivedAt: "asc" }, { sortOrder: "asc" }] }),
    prisma.expenseCategory.findMany({ orderBy: [{ archivedAt: "asc" }, { sortOrder: "asc" }] }),
  ]);

  return (
    <div>
      <Link href="/admin" className="text-[12.5px] font-semibold text-navy-700 hover:underline">
        ← Admin
      </Link>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Admin · Finance
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Expense lists</h1>
      <p className="mt-1 max-w-[72ch] text-muted">
        What petty cash lines and payback requests are filed under. Archiving keeps a value on the
        records that already use it and stops offering it on new ones — nothing is ever deleted out
        from under a closed period.
      </p>

      {ok ? <p className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">✓ {ok}</p> : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ListCard
          kind="section"
          title="Sections"
          hint="Required on every line — the part of the business the money belongs to."
          rows={sections}
        />
        <ListCard
          kind="category"
          title="Categories"
          hint="Optional — what kind of thing was bought."
          rows={categories}
        />
      </div>
    </div>
  );
}

function ListCard({
  kind,
  title,
  hint,
  rows,
}: {
  kind: "section" | "category";
  title: string;
  hint: string;
  rows: Row[];
}) {
  const live = rows.filter((r) => !r.archivedAt);
  const archived = rows.filter((r) => r.archivedAt);

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-navy-800">{title}</h2>
        <p className="mt-0.5 text-[11.5px] text-muted">{hint}</p>
      </div>

      <ul className="divide-y divide-line">
        {live.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <form action={renameValue} className="flex flex-1 items-center gap-2">
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="id" value={r.id} />
              <input
                type="text"
                name="name"
                defaultValue={r.name}
                maxLength={60}
                className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-[13px] text-ink hover:border-navy-200 focus:border-navy-500 focus:bg-surface focus:outline-none"
              />
              <PendingSubmitButton
                pendingLabel="…"
                className="rounded-md border border-line px-2 py-1 text-[11px] font-semibold text-muted hover:border-navy-200 hover:text-navy-700"
              >
                Rename
              </PendingSubmitButton>
            </form>
            <form action={archiveValue}>
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="id" value={r.id} />
              <PendingSubmitButton
                pendingLabel="…"
                className="rounded-md border border-line px-2 py-1 text-[11px] font-semibold text-muted hover:border-gold-300 hover:text-gold-800"
              >
                Archive
              </PendingSubmitButton>
            </form>
          </li>
        ))}
      </ul>

      <form action={addValue} className="flex items-center gap-2 border-t border-line px-4 py-3">
        <input type="hidden" name="kind" value={kind} />
        <input
          type="text"
          name="name"
          required
          maxLength={60}
          placeholder={kind === "section" ? "New section" : "New category"}
          className="min-w-0 flex-1 rounded-lg border border-navy-200 bg-surface px-3 py-2 text-[13px]"
        />
        <PendingSubmitButton
          pendingLabel="Adding…"
          className="rounded-lg bg-navy-800 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-900"
        >
          Add
        </PendingSubmitButton>
      </form>

      {archived.length > 0 ? (
        <details className="border-t border-line px-4 py-3">
          <summary className="cursor-pointer list-none text-[11.5px] font-semibold text-muted [&::-webkit-details-marker]:hidden">
            {archived.length} archived
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {archived.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] text-muted line-through">{r.name}</span>
                <form action={restoreValue}>
                  <input type="hidden" name="kind" value={kind} />
                  <input type="hidden" name="id" value={r.id} />
                  <PendingSubmitButton
                    pendingLabel="…"
                    className="rounded-md border border-line px-2 py-1 text-[11px] font-semibold text-muted hover:border-navy-200 hover:text-navy-700"
                  >
                    Restore
                  </PendingSubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
