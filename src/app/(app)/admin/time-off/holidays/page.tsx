import Link from "next/link";
import { requireAdmin } from "@/lib/roles";
import {
  listHolidays,
  needsVerification,
  announcementOutdated,
  alreadyAnnounced,
  isUpcoming,
  isDateConfirmed,
  todayUtc,
  type HolidayWithAnnouncement,
} from "@/lib/holidays";
import { getNotificationSettings } from "@/lib/notifications/settings";
import { formatDate } from "@/lib/labels";
import { BackLink } from "@/components/admin/BackLink";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import type { HolidaySuggestion } from "@/lib/timeoff/holiday-source";
import {
  addHoliday,
  removeHoliday,
  uploadHolidays,
  fetchHolidayYear,
  confirmSuggestions,
  verifyHoliday,
} from "./actions";
import { MoveHolidayForm } from "./MoveHolidayForm";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-navy-500 focus:outline-none";
const chip = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold";

/** dd/mm/yyyy, or "dd/mm/yyyy → dd/mm/yyyy" when the holiday covers more than one day. */
function rangeLabel(start: Date, end: Date): string {
  return start.getTime() === end.getTime()
    ? formatDate(start)
    : `${formatDate(start)} → ${formatDate(end)}`;
}

/**
 * Hidden fields that carry the current fetch back through an action, so verifying or moving
 * a holiday doesn't throw away the suggestion list HR just pulled.
 */
function KeepFetch({ year, suggestions }: { year?: string; suggestions?: string }) {
  return (
    <>
      {year ? <input type="hidden" name="year" value={year} /> : null}
      {suggestions ? <input type="hidden" name="suggestions" value={suggestions} /> : null}
    </>
  );
}

function StatusChip({ h }: { h: HolidayWithAnnouncement }) {
  if (h.status === "TENTATIVE") {
    return <span className={chip + " border border-gold-200 bg-gold-100 text-gold-800"}>● Tentative</span>;
  }
  if (h.status === "MOVED") {
    return <span className={chip + " border border-navy-100 bg-navy-50 text-navy-700"}>⇄ Moved</span>;
  }
  return <span className={chip + " border border-green-200 bg-green-50 text-green-700"}>✓ Verified</span>;
}

/**
 * Public holidays config (spec 035, reworked by spec 037 — mockup signed off 2026-08-19,
 * `design-mockups/037-official-holidays/2026-08-19_holidays-admin-and-banner.html`).
 *
 * Three jobs on one screen: fetch a year as suggestions and confirm what's real; keep each
 * holiday's announced-vs-observed dates and its verification status; and get from a
 * date-confirmed holiday to the announcement. Listed dates never count as working days.
 */
export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; year?: string; suggestions?: string }>;
}) {
  await requireAdmin();
  const { ok, error, year, suggestions } = await searchParams;
  const [holidays, settings] = await Promise.all([listHolidays(), getNotificationSettings()]);
  const today = todayUtc();
  const lead = settings.verificationLeadDays;

  // Suggestions ride back from the fetch action in the URL; a malformed value degrades to
  // "no suggestions" rather than breaking the screen.
  let fetched: HolidaySuggestion[] = [];
  if (suggestions) {
    try {
      const parsed: unknown = JSON.parse(suggestions);
      if (Array.isArray(parsed)) fetched = parsed as HolidaySuggestion[];
    } catch {
      fetched = [];
    }
  }

  const byStartISO = new Map(holidays.map((h) => [h.actualStart.toISOString().slice(0, 10), h]));
  const byName = new Map(holidays.map((h) => [h.name.toLowerCase(), h]));

  const toVerify = holidays.filter((h) => needsVerification(h, lead, today) && isUpcoming(h, today));

  const byYear = new Map<number, HolidayWithAnnouncement[]>();
  for (const h of holidays) {
    const y = h.actualStart.getUTCFullYear();
    const list = byYear.get(y) ?? [];
    list.push(h);
    byYear.set(y, list);
  }

  return (
    <div className="max-w-5xl">
      <BackLink href="/admin/time-off" label="Time-Off" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · Time-Off</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Public holidays</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Listed dates never count as working days — alongside the Friday + Saturday weekend.
        Counts are always live: moving a holiday re-counts every request it touches, including
        ones already approved.
      </p>

      {ok ? <p className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{ok}</p> : null}
      {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {toVerify.length > 0 ? (
        <p className="mt-4 rounded-lg border border-gold-300 bg-gold-100 px-4 py-3 text-sm text-gold-800">
          <b>
            {toVerify.length} holiday{toVerify.length === 1 ? "" : "s"} need
            {toVerify.length === 1 ? "s" : ""} verifying.
          </b>{" "}
          {toVerify.map((h) => `${h.name} (${formatDate(h.actualStart)})`).join(", ")} — inside the{" "}
          {lead}-day check window. Confirm the date or move it.
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {/* ── The log ─────────────────────────────────────────────── */}
        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="font-serif text-lg text-ink">Listed holidays</h2>
          {holidays.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              None yet — every weekday currently counts as a working day.
            </p>
          ) : (
            Array.from(byYear.entries()).map(([y, list]) => (
              <div key={y} className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{y}</h3>
                <ul className="mt-1">
                  {list.map((h) => {
                    const moved =
                      h.originalStart.getTime() !== h.actualStart.getTime() ||
                      h.originalEnd.getTime() !== h.actualEnd.getTime();
                    const past = !isUpcoming(h, today);
                    const outdated = announcementOutdated(h);
                    const announced = alreadyAnnounced(h);
                    return (
                      <li key={h.id} className="border-b border-dashed border-line py-2.5 last:border-b-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                          <span className="tabular-nums font-semibold text-ink">
                            {rangeLabel(h.actualStart, h.actualEnd)}
                          </span>
                          <span className="text-muted">· {h.name}</span>
                          <StatusChip h={h} />
                          {outdated ? (
                            <span className={chip + " border border-gold-300 bg-gold-100 text-gold-800"}>
                              ⚠ Announced with an outdated date
                            </span>
                          ) : announced ? (
                            <span className={chip + " border border-green-200 bg-green-50 text-green-700"}>
                              ✓ Announced
                            </span>
                          ) : null}
                        </div>
                        {moved ? (
                          <div className="text-[11.5px] tabular-nums text-muted">
                            announced {rangeLabel(h.originalStart, h.originalEnd)}
                          </div>
                        ) : null}

                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {h.status === "TENTATIVE" ? (
                            <form action={verifyHoliday}>
                              <input type="hidden" name="id" value={h.id} />
                              <KeepFetch year={year} suggestions={suggestions} />
                              <button className="rounded-lg bg-navy-800 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-navy-700">
                                Verify date
                              </button>
                            </form>
                          ) : null}

                          {isDateConfirmed(h) && isUpcoming(h, today) ? (
                            <Link
                              href={`/admin/time-off/holidays/announce/${h.id}`}
                              className="rounded-lg border border-navy-200 px-2.5 py-1 text-[11px] font-semibold text-navy-700 hover:bg-navy-50"
                            >
                              {outdated ? "Send correction" : announced ? "Announce again" : "Prepare announcement"}
                            </Link>
                          ) : null}

                          <MoveHolidayForm
                            id={h.id}
                            name={h.name}
                            startISO={h.actualStart.toISOString().slice(0, 10)}
                            endISO={h.actualEnd.toISOString().slice(0, 10)}
                            isPast={past}
                            year={year}
                            suggestions={suggestions}
                          />

                          <form action={removeHoliday}>
                            <input type="hidden" name="id" value={h.id} />
                            <KeepFetch year={year} suggestions={suggestions} />
                            {past ? <input type="hidden" name="confirmPast" value="1" /> : null}
                            <ConfirmSubmitButton
                              message={
                                past
                                  ? `Remove ${h.name}? It has already passed, so past working-day counts will change.`
                                  : `Remove ${h.name}? Those days start counting as working days again.`
                              }
                              className="rounded-lg border border-line px-2.5 py-1 text-[11px] font-semibold text-muted hover:border-red-300 hover:text-red-600"
                            >
                              Remove
                            </ConfirmSubmitButton>
                          </form>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </section>

        <div className="flex flex-col gap-4">
          {/* ── Fetch ─────────────────────────────────────────────── */}
          <section className="rounded-xl border border-line bg-surface p-6">
            <h2 className="font-serif text-lg text-ink">Fetch official holidays</h2>
            <p className="mt-1 text-sm text-muted">
              Pulls the announced list for a year. Nothing is saved until you confirm — moon-dependent
              dates arrive as predictions and need verifying nearer the day.
            </p>
            <form action={fetchHolidayYear} className="mt-3 flex flex-wrap items-end gap-2">
              <div className="max-w-[130px]">
                <label htmlFor="fetch-year" className="mb-1 block text-xs uppercase tracking-wide text-muted">
                  Year
                </label>
                <input
                  id="fetch-year"
                  name="year"
                  defaultValue={year ?? String(today.getUTCFullYear())}
                  className={inputCls}
                />
              </div>
              <button className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
                Fetch list
              </button>
            </form>

            {fetched.length > 0 ? (
              <form action={confirmSuggestions} className="mt-4">
                <KeepFetch year={year} suggestions={suggestions} />
                <ul className="divide-y divide-dashed divide-line">
                  {fetched.map((s) => {
                    const existingSameStart = byStartISO.get(s.startISO);
                    const existingSameName = byName.get(s.name.toLowerCase());
                    const recordedElsewhere =
                      !existingSameStart && existingSameName ? existingSameName : null;
                    return (
                      <li key={`${s.startISO}-${s.name}`} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                        {existingSameStart || recordedElsewhere ? null : (
                          <input
                            type="checkbox"
                            name="pick"
                            value={`${s.startISO}|${s.endISO}|${s.name}|${s.localName ?? ""}`}
                            defaultChecked
                            className="h-4 w-4"
                          />
                        )}
                        <span className="tabular-nums font-semibold text-ink">
                          {s.startISO === s.endISO
                            ? formatDate(new Date(s.startISO + "T00:00:00Z"))
                            : `${formatDate(new Date(s.startISO + "T00:00:00Z"))} → ${formatDate(
                                new Date(s.endISO + "T00:00:00Z")
                              )}`}
                        </span>
                        <span className="text-muted">· {s.name}</span>
                        {existingSameStart ? (
                          <span className={chip + " border border-line bg-paper text-muted"}>
                            Already recorded
                          </span>
                        ) : recordedElsewhere ? (
                          <span className={chip + " border border-gold-300 bg-gold-100 text-gold-800"}>
                            Different date — you recorded{" "}
                            {rangeLabel(recordedElsewhere.actualStart, recordedElsewhere.actualEnd)}
                          </span>
                        ) : (
                          <span className={chip + " bg-navy-800 text-white"}>New</span>
                        )}
                        {recordedElsewhere ? (
                          <MoveHolidayForm
                            id={recordedElsewhere.id}
                            name={recordedElsewhere.name}
                            startISO={s.startISO}
                            endISO={s.endISO}
                            isPast={!isUpcoming(recordedElsewhere, today)}
                            label="Apply as move"
                            year={year}
                            suggestions={suggestions}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                <button className="mt-3 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
                  Confirm ticked holidays
                </button>
                <p className="mt-2 text-[11.5px] text-muted">
                  A multi-day holiday like Eid arrives as ONE entry covering all its days — verify or
                  move it as a whole.
                </p>
              </form>
            ) : null}
          </section>

          {/* ── Add by hand ───────────────────────────────────────── */}
          <section className="rounded-xl border border-line bg-surface p-6">
            <h2 className="font-serif text-lg text-ink">Add a holiday</h2>
            <form action={addHoliday} className="mt-3 flex flex-col gap-3">
              <div className="flex flex-wrap gap-3">
                <div className="min-w-[140px] flex-1">
                  <label htmlFor="h-start" className="mb-1 block text-xs uppercase tracking-wide text-muted">
                    First day
                  </label>
                  <input id="h-start" name="start" type="date" required className={inputCls} />
                </div>
                <div className="min-w-[140px] flex-1">
                  <label htmlFor="h-end" className="mb-1 block text-xs uppercase tracking-wide text-muted">
                    Last day
                  </label>
                  <input id="h-end" name="end" type="date" className={inputCls} />
                </div>
              </div>
              <div>
                <label htmlFor="h-name" className="mb-1 block text-xs uppercase tracking-wide text-muted">
                  Name
                </label>
                <input
                  id="h-name"
                  name="name"
                  required
                  maxLength={120}
                  placeholder="e.g. Sham El-Nessim"
                  className={inputCls}
                />
              </div>
              <button className="self-start rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
                Add holiday
              </button>
              <p className="text-[11.5px] text-muted">
                Leave the last day empty for a one-day holiday. Added by hand counts as verified.
              </p>
            </form>
          </section>

          {/* ── Bulk upload ───────────────────────────────────────── */}
          <section className="rounded-xl border border-line bg-surface p-6">
            <h2 className="font-serif text-lg text-ink">Bulk upload (Excel)</h2>
            <p className="mt-1 text-sm text-muted">
              Download the template — it comes pre-filled with the current list — edit it, and upload
              it back. Existing dates are updated, never duplicated.
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
