// Online holiday suggestions (spec 037, FR-001). Server-side only.
//
// Nager.Date is a free, keyless public-holidays service. It is a SUGGESTION source and
// nothing more: HR confirms every entry before anything is stored, so a wrong prediction can
// never reach working-day counting on its own. Islamic holidays come back as predictions,
// which is exactly why confirmed fetches land as TENTATIVE and get verified nearer the date.
//
// The response is untrusted input: dates are re-parsed to UTC midnight and names are
// length-capped before they are shown, let alone saved.

import { dayKey } from "@/lib/workdays";
import { addDays } from "@/lib/timeoff/breaks";

/** Two-letter country the fetch asks about. Egypt today; the only place the choice lives. */
export const HOLIDAY_COUNTRY = "EG";

const ENDPOINT = (year: number, country: string) =>
  `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`;

/** How long to wait before giving up — HR is watching a button, not a batch job. */
const TIMEOUT_MS = 8_000;
const MAX_NAME = 120;

export type HolidaySuggestion = {
  /** yyyy-mm-dd of the first and last day — consecutive days of one holiday are grouped. */
  startISO: string;
  endISO: string;
  name: string;
  /** The local (Arabic) name when the source gives one — used by the bilingual announcement. */
  localName: string | null;
};

export type FetchResult =
  | { ok: true; suggestions: HolidaySuggestion[] }
  | { ok: false; error: string };

type RawHoliday = { date?: unknown; name?: unknown; localName?: unknown };

/** yyyy-mm-dd → UTC-midnight Date, or null if it isn't a real calendar day. */
function parseISO(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  // Reject rollovers like 2026-02-31, which Date would silently accept as 3 March.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Group consecutive days carrying the same name into ONE multi-day suggestion — the user's
 * explicit choice (2026-08-19): Eid is a single entry HR verifies and moves as a whole,
 * not four rows that can drift apart.
 */
export function groupConsecutive(
  days: { date: Date; name: string; localName: string | null }[]
): HolidaySuggestion[] {
  const sorted = [...days].sort((a, b) => a.date.getTime() - b.date.getTime() || a.name.localeCompare(b.name));
  const out: HolidaySuggestion[] = [];
  for (const day of sorted) {
    const last = out[out.length - 1];
    const isNextDayOfSameHoliday =
      last && last.name === day.name && dayKey(addDays(new Date(last.endISO + "T00:00:00Z"), 1)) === dayKey(day.date);
    if (isNextDayOfSameHoliday) {
      last.endISO = dayKey(day.date);
      continue;
    }
    out.push({
      startISO: dayKey(day.date),
      endISO: dayKey(day.date),
      name: day.name,
      localName: day.localName,
    });
  }
  return out;
}

/**
 * Ask the source for one year's holidays. Never throws: a failure is a message HR can read,
 * because manual entry must stay usable when the service is down (spec 037 acceptance 1.4).
 */
export async function fetchHolidaySuggestions(
  year: number,
  country: string = HOLIDAY_COUNTRY
): Promise<FetchResult> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, error: "Enter a four-digit year." };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT(year, country), {
      signal: controller.signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      return { ok: false, error: `The holidays source answered ${res.status}. Nothing was changed — try again shortly.` };
    }
    const body: unknown = await res.json();
    if (!Array.isArray(body)) {
      return { ok: false, error: "The holidays source sent something unreadable. Nothing was changed." };
    }
    const days: { date: Date; name: string; localName: string | null }[] = [];
    for (const raw of body as RawHoliday[]) {
      const date = parseISO(raw?.date);
      const name = cleanName(raw?.name);
      if (!date || !name) continue; // skip junk rows rather than failing the whole fetch
      days.push({ date, name, localName: cleanName(raw?.localName) });
    }
    if (days.length === 0) {
      return { ok: false, error: `No holidays came back for ${year}. Add them by hand below.` };
    }
    return { ok: true, suggestions: groupConsecutive(days) };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? "The holidays source took too long to answer. Nothing was changed — try again, or add them by hand."
        : "Couldn't reach the holidays source. Nothing was changed — try again, or add them by hand.",
    };
  } finally {
    clearTimeout(timer);
  }
}
