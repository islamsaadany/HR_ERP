/**
 * Incentive Scheme — one place that reads and writes a date, for the whole module.
 *
 * The displayed and typed form is **`14-Jul 2026`** (`dd-mmm yyyy`), chosen so an
 * entry can be *checked at a glance*: a spelled month cannot be read the wrong way
 * round. Everywhere else in the platform dates are dd/mm/yyyy (`formatDate`); this
 * module is deliberately the exception, because it is the one screen where somebody
 * types compensation dates in from a spreadsheet and has to be sure they landed
 * right.
 *
 * Why one module rather than a formatter here and a parser there: the same date has
 * to survive display → cell → save → display, and a sheet's cell has to mean the
 * same thing as a typed one. Two halves in two files is how that quietly stops being
 * true — this module had already been bitten once, when `new Date("01/03/2021")`
 * (which is *American*) silently stored an operator's 1 March as 3 January.
 */

export const INCENTIVE_DATE_FORMAT = "dd-mmm yyyy";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONTH_INDEX: Record<string, number> = Object.fromEntries(
  MONTHS.map((m, i) => [m.toLowerCase(), i + 1])
);
// The full names too, so "14 July 2026" off a sheet isn't refused for being spelled out.
const FULL_MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
FULL_MONTHS.forEach((m, i) => (MONTH_INDEX[m] = i + 1));

/** A calendar date at UTC midnight, or null if the parts aren't a real date (31/02 included). */
export function buildUTC(year: number, month: number, day: number): Date | null {
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? d : null;
}

/**
 * Date → "14-Jul 2026". Read in **UTC**, because a date-only value is stored at UTC
 * midnight and reading it locally in a timezone behind UTC prints the day before —
 * nobody's start date should move because of where they are sitting.
 */
export function formatIncentiveDate(d: Date | null | undefined): string {
  if (!d || isNaN(d.getTime())) return "";
  return `${String(d.getUTCDate()).padStart(2, "0")}-${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** A stored "YYYY-MM-DD" → "14-Jul 2026", or "" when there is no date. */
export function formatIncentiveDateISO(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(iso);
  if (!m) return iso;
  const d = buildUTC(Number(m[1]), Number(m[2]), Number(m[3]));
  return d ? formatIncentiveDate(d) : iso;
}

/** The same, but for a read-only cell, where "no date" reads as an em dash. */
export function displayIncentiveDate(iso: string | null | undefined): string {
  return formatIncentiveDateISO(iso) || "—";
}

/** Excel serial → Date (Excel's epoch is 1899-12-30). */
function fromExcelSerial(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}

/**
 * Read a date a person wrote, in any of the forms this module promises to
 * understand. Returns null when it can't be read — the caller decides whether that
 * is "leave it blank" (a sheet row) or "refuse the save" (a typed cell).
 *
 * Order matters:
 *  1. **A spelled month** — `14-Jul 2026`, `14 July 2026`, `14/Jul/2026`. No
 *     ambiguity to resolve, so this is the form we ask for.
 *  2. **ISO** `yyyy-mm-dd` — unambiguous, taken as written.
 *  3. **All-numeric** `d/m/y`, `d-m-y`, `d.m.y` — **day-first**, the house
 *     convention, EXCEPT where the middle field is over 12 and the first isn't,
 *     which can only be a legacy m/d/y sheet and is read that way rather than
 *     refused.
 */
export function parseTypedDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  // 1. A month name anywhere in the value.
  const named = /^(\d{1,2})\s*[-/.\s]\s*([A-Za-z]{3,})\s*[-/.,\s]\s*(\d{2,4})$/.exec(s);
  if (named) {
    const month = MONTH_INDEX[named[2].toLowerCase()];
    if (!month) return null;
    return buildUTC(expandYear(Number(named[3])), month, Number(named[1]));
  }

  // 2. ISO.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) return buildUTC(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // 3. All-numeric, day-first.
  const parts = s.split(/[./\-\s]+/).filter(Boolean);
  if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
    const [a, b, c] = parts.map(Number);
    const [day, month] = b > 12 && a <= 12 ? [b, a] : [a, b];
    return buildUTC(expandYear(c), month, day);
  }

  return null;
}

/**
 * The same, for a cell that came out of a spreadsheet — where a date may also
 * arrive as an Excel serial number. Kept separate from `parseTypedDate` so a
 * five-digit number typed into a date field on screen is refused rather than
 * silently becoming a date in 1974.
 */
export function parseSheetDate(raw: string | undefined): Date | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return n > 20000 && n < 80000 ? fromExcelSerial(n) : null;
  }
  return parseTypedDate(s);
}

/** A two-digit year is this century up to '69, last century from '70. */
function expandYear(y: number): number {
  if (y >= 100) return y;
  return y < 70 ? 2000 + y : 1900 + y;
}
