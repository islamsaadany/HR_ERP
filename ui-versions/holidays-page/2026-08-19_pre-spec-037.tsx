import { requireAdmin } from "@/lib/roles";
import { listHolidays } from "@/lib/holidays";
import { formatDate } from "@/lib/labels";
import { BackLink } from "@/components/admin/BackLink";
import { addHoliday, removeHoliday, uploadHolidays } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Public holidays config (spec 035, mockup section 4 + Excel bulk upload per request):
 * date + name, add/remove one at a time, or download the template and upload the filled
 * file. Listed dates never count as working days anywhere in Time-Off.
 */
export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const { ok, error } = await searchParams;
  const holidays = await listHolidays();

  const byYear = new Map<number, typeof holidays>();
  for (const h of holidays) {
    const y = h.date.getUTCFullYear();
    const list = byYear.get(y) ?? [];
    list.push(h);
    byYear.set(y, list);
  }

  const inputCls =
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-navy-500 focus:outline-none";

  return (
    <div className="max-w-4xl">
      <BackLink href="/admin/time-off" label="Time-Off" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Admin · Time-Off
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Public holidays</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Listed dates never count as working days — alongside the Friday + Saturday weekend.
        Counts are always live: adding a holiday inside an already-approved trip lowers its
        displayed working-day count (nothing is deducted from a limit, so nothing needs freezing).
      </p>

      {ok ? <p className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{ok}</p> : null}
      {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {/* The list */}
        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="font-serif text-lg text-ink">Listed holidays</h2>
          {holidays.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              None yet — every weekday currently counts as a working day.
            </p>
          ) : (
            Array.from(byYear.entries()).map(([year, list]) => (
              <div key={year} className="mt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{year}</h3>
                <ul className="mt-1">
                  {list.map((h) => (
                    <li
                      key={h.id}
                      className="flex items-center justify-between gap-3 border-b border-dashed border-line py-1.5 text-sm last:border-b-0"
                    >
                      <span>
                        <span className="tabular-nums text-ink">{formatDate(h.date)}</span>
                        <span className="text-muted"> · {h.name}</span>
                      </span>
                      <form action={removeHoliday}>
                        <input type="hidden" name="id" value={h.id} />
                        <button className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-muted hover:border-red-300 hover:text-red-600">
                          Remove
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>

        <div className="flex flex-col gap-4">
          {/* Add one */}
          <section className="rounded-xl border border-line bg-surface p-6">
            <h2 className="font-serif text-lg text-ink">Add a holiday</h2>
            <form action={addHoliday} className="mt-3 flex flex-col gap-3">
              <div>
                <label htmlFor="holiday-date" className="mb-1 block text-xs uppercase tracking-wide text-muted">
                  Date
                </label>
                <input id="holiday-date" name="date" type="date" required className={inputCls} />
              </div>
              <div>
                <label htmlFor="holiday-name" className="mb-1 block text-xs uppercase tracking-wide text-muted">
                  Name
                </label>
                <input
                  id="holiday-name"
                  name="name"
                  required
                  maxLength={120}
                  placeholder="e.g. Eid al-Fitr — day 1"
                  className={inputCls}
                />
              </div>
              <button className="self-start rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
                Add holiday
              </button>
            </form>
          </section>

          {/* Bulk upload */}
          <section className="rounded-xl border border-line bg-surface p-6">
            <h2 className="font-serif text-lg text-ink">Bulk upload (Excel)</h2>
            <p className="mt-1 text-sm text-muted">
              Download the template — it comes pre-filled with the current list — edit it, and
              upload it back. Existing dates are updated, never duplicated.
            </p>
            <a
              href="/api/admin/time-off/holidays/template"
              className="mt-3 inline-block rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
            >
              Download template
            </a>
            <form action={uploadHolidays} className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="file"
                name="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                required
                className="text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-navy-700 hover:file:bg-navy-50"
              />
              <button className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
                Upload
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
