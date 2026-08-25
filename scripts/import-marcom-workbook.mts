/**
 * Turn the marketing expenses workbook into migration 072 (spec 040, 2026-08-25).
 *
 * NOT part of the build. It was run once, by hand, against `NEW_MARCOM_Expenses.xlsx`, and its
 * output — `prisma/sql/072_marcom_petty_cash_history.sql` — is what actually ships. It is kept
 * because the migration is 144 generated INSERTs that nobody can review line by line, and this
 * file is the reviewable statement of how each one was derived.
 *
 *   npx tsx scripts/import-marcom-workbook.mts <path-to-workbook.xlsx> > prisma/sql/072_….sql
 *
 * WHAT IT DECIDES, and why (each one was put to the CEO on 2026-08-25):
 *
 *   • Every tab becomes ONE CLOSED PERIOD, settled — the custodian was reimbursed at the end of
 *     each, which is what "earlier months are already settled" means. The settlement is recorded
 *     as a real top-up dated at the period's end, so the arithmetic explains itself rather than
 *     being asserted by an opening balance nobody can trace. August 2026 is left OPEN: it is the
 *     live month, and its 9,726.26 is the figure the whole import has to land on.
 *
 *   • `Oct-Nov`, `Dec` and `JAN` predate the sheet's "Payment" column, so nothing records whether
 *     an item came from the float or a company transfer. They are read as float spending (his
 *     call, of three offered). Their "Budget" figure is a real budget and is kept; the later tabs
 *     have none — their "Monthly Pitty Cash" is the float advanced, not a budget, and conflating
 *     the two would put a ceiling on a thing that has none.
 *
 *   • `April- May` is DROPPED. It and `JUN-JUL` are two drafts of the same April–May 2026 month
 *     and share seven identical lines; loading both would count 3,376.29 twice. `JUN-JUL` is the
 *     fuller, later draft (his call). `JUN` (three rows duplicating `May-June`), `Pitty Cash`
 *     (one scratch row pointing at `April`) and `Pivot Table 1` (empty) are dropped for the same
 *     reason. `Forecast` and `Tools Subscription` are out of scope by his earlier decision — and
 *     the latter holds plaintext passwords, which must not travel into git.
 *
 *   • A line's date is often missing or written as prose ("Sep", "not paid yet", "10/02, 03/02").
 *     A date is REQUIRED, so an unreadable one falls back to the period's end date. It is never
 *     invented from a neighbouring row: the fallback is uniform, so a reader can tell which dates
 *     the sheet actually recorded — everything on a period's last day was not.
 *
 *   • Receipts are Google Drive hyperlinks. Nothing is downloaded; each becomes an
 *     `ExpenseEvidence` row with `externalUrl` set (migration 071). A receipt cell with text but
 *     no link ("on the portal", "Nina Printing (WILL BE ADDED)") yields NO evidence row — the
 *     line is genuinely missing its receipt, and is named in the period's acknowledgement rather
 *     than given a receipt that does not resolve.
 *
 * WHAT IT REFUSES TO DO
 *   It never writes a figure the sheet does not contain, and it never ships a parse nothing has
 *   checked. Every tab is compared against the total the SHEET states for it, and the whole
 *   import against 9,726.26 — a mismatch on a new-format tab throws rather than shipping.
 *
 *   FOUR of the sheet's own SUM formulas are short by a row, in two different ways. On `April`
 *   and `JUN-JUL` it is the TOTAL EXPENSES line (missing 4,000 and 3,400); those figures are
 *   derived here, so they are simply reported. On `Oct-Nov` and `JAN` the short SUM is the only
 *   total there is, so the imported month legitimately exceeds it — 47,769.23 against a stated
 *   35,229.23, and 13,276.45 against 13,136.45. The extra lines are real and are imported; the
 *   difference is REPORTED rather than absorbed, because whoever reads the screen will be
 *   holding the sheet next to it. The petty cash column that actually moves the float is
 *   correct on every new-format tab and is asserted exactly.
 */
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";

const workbookPath = process.argv[2];
if (!workbookPath) {
  console.error("usage: tsx scripts/import-marcom-workbook.mts <workbook.xlsx>");
  process.exit(1);
}

// ─── Reading cells ──────────────────────────────────────────────────────────
// ExcelJS gives back numbers, Dates, formula objects ({formula, result}), hyperlink objects
// ({text, hyperlink}) and rich text. Every read goes through one of these three.

type Cell = unknown;

function asNumber(v: Cell): number | null {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && typeof (v as { result?: unknown }).result === "number") {
    return (v as { result: number }).result;
  }
  return null;
}

function asText(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; text?: unknown; result?: unknown };
    if (o.richText) return o.richText.map((r) => r.text).join("").trim();
    // A hyperlink's own label can itself be rich text — several receipt cells are — so this
    // recurses rather than stringifying. `String({…})` gives "[object Object]", which would
    // have shipped as the file name on a dozen receipts.
    if (o.text !== undefined) return asText(o.text);
    if (o.result !== undefined) return String(o.result).trim();
    return "";
  }
  return String(v).trim();
}

function asLink(v: Cell): string | null {
  if (v && typeof v === "object") {
    const h = (v as { hyperlink?: unknown }).hyperlink;
    if (typeof h === "string" && h.length) return h;
  }
  return null;
}

// ─── The tabs, in order, with the facts the sheet does not state ────────────
// `floatGivenOverride` is only for the three old-format tabs: they have a budget, not a float
// advance, so nothing was advanced and the whole spend was settled at the end.

type TabSpec = {
  /** Sheet name, verbatim — several carry stray spaces. */
  sheet: string;
  /** What the period is called on screen. */
  label: string;
  start: string;
  end: string;
  /** "old" = the pre-March-2025 expense-report layout; "new" = the Date/Section/…/Amount one. */
  layout: "old" | "new";
  /** A real budget, where the sheet set one. */
  budget?: number;
  /**
   * The total the SHEET itself states for the tab, where it states one somewhere this parser
   * cannot find it — `JAN` computes its total inside the header block rather than as a row
   * under the lines. Every parse is checked against a stated total; a tab with none is a tab
   * nothing is verifying, which is how the first run doubled two months unnoticed.
   */
  statedTotal?: number;
};

const TABS: TabSpec[] = [
  { sheet: "Oct-Nov", label: "Oct–Nov 2024", start: "2024-10-01", end: "2024-11-30", layout: "old", budget: 35000 },
  { sheet: "Dec", label: "Dec 2024", start: "2024-12-01", end: "2024-12-31", layout: "old" },
  { sheet: "JAN", label: "Jan 2025", start: "2025-01-01", end: "2025-01-31", layout: "old", budget: 1000, statedTotal: 13136.45 },
  { sheet: "March", label: "Mar 2025", start: "2025-02-28", end: "2025-04-10", layout: "new" },
  { sheet: "April", label: "Apr 2025", start: "2025-04-11", end: "2025-05-04", layout: "new" },
  { sheet: "May-June", label: "May–Jun 2025", start: "2025-05-05", end: "2025-06-30", layout: "new" },
  { sheet: "JUL- AUG", label: "Jul–Aug 2025", start: "2025-07-01", end: "2025-08-31", layout: "new" },
  { sheet: "SEP-OCT", label: "Sep–Oct 2025", start: "2025-09-01", end: "2025-11-02", layout: "new" },
  { sheet: "NOV-DEC", label: "Nov–Dec 2025", start: "2025-11-03", end: "2025-12-31", layout: "new" },
  { sheet: "JAN- FEB 26", label: "Jan–Feb 2026", start: "2026-01-01", end: "2026-03-05", layout: "new" },
  { sheet: "JUN-JUL", label: "Apr–May 2026", start: "2026-04-01", end: "2026-05-31", layout: "new" },
  { sheet: "AUG26", label: "Aug 2026", start: "2026-08-01", end: "2026-08-31", layout: "new" },
];

/** The one period left OPEN — the live month everything else settles into. */
const OPEN_PERIOD = "Aug 2026";

// ─── Mapping the sheet's words onto the seeded lists (migration 068) ────────

const SECTIONS: Record<string, string> = {
  marketing: "sec_marketing",
  community: "sec_community",
  team: "sec_team",
  "team requirments": "sec_team",
  "online media": "sec_marketing",
  // The old tabs name a PROJECT where the later ones name a section.
  "el abds giveaways": "sec_marketing",
  "team requirments ": "sec_team",
};
/** Rows whose Section cell is blank. The sheet's own habit is that these are office/team spend. */
const DEFAULT_SECTION = "sec_team";

const CATEGORIES: Record<string, string> = {
  "office supply": "cat_office_supply",
  office: "cat_office_supply",
  "media coverage": "cat_media_coverage",
  media: "cat_media_coverage",
  printings: "cat_printings",
  transportation: "cat_transportation",
  catering: "cat_catering",
  venue: "cat_venue",
  booking: "cat_booking",
  gifts: "cat_gifts",
  logistics: "cat_logistics",
  tool: "cat_tools",
  tools: "cat_tools",
  assets: "cat_assets",
  stationary: "cat_stationery",
  stationery: "cat_stationery",
  "employer branding": "cat_employer_branding",
  "social media": "cat_social_media",
  team: "cat_team",
  marketing: "cat_social_media",
  development: "cat_tools",
  community: "cat_media_coverage",
};

// ─── Parsing one line ───────────────────────────────────────────────────────

type Line = {
  id: string;
  date: string;
  sectionId: string;
  categoryId: string | null;
  description: string;
  method: "FLOAT" | "COMPANY_TRANSFER";
  paymentDetails: string | null;
  payee: string | null;
  amount: number;
  receiptName: string | null;
  receiptUrl: string | null;
  /** True when the date could not be read and the period's end date stood in. */
  dateAssumed: boolean;
};

/**
 * Read a date cell. Handles a real Date, "dd/mm", "dd/mm/yyyy", and the several ways the sheet
 * writes "I don't know" ("Sep", "not paid yet", "--", ""). Returns null when it cannot be read;
 * the caller substitutes the period's end date and marks the line.
 */
function readDate(raw: Cell, spec: TabSpec): string | null {
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const text = asText(raw);
  if (!text) return null;

  // "10/02, 03/02" — two dates in one cell. The first is the one the amount is dated by.
  const first = text.split(",")[0]!.trim();
  const m = /^(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?$/.exec(first);
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = m[3] ? Number(m[3]) : NaN;
  if (m[3] && String(m[3]).length === 2) year += 2000;
  if (!Number.isFinite(year)) {
    // No year in the cell: take it from whichever end of the period shares the month.
    const startYear = Number(spec.start.slice(0, 4));
    const endYear = Number(spec.end.slice(0, 4));
    year = month === Number(spec.end.slice(5, 7)) || startYear === endYear ? endYear : startYear;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

type ParsedTab = {
  spec: TabSpec;
  lines: Line[];
  floatGiven: number;
  /** The sheet's own total for the tab, where it states one. Every parse is checked against it. */
  sheetFloatTotal: number | null;
};

function parseTab(wb: ExcelJS.Workbook, spec: TabSpec): ParsedTab {
  const ws = wb.getWorksheet(spec.sheet);
  if (!ws) throw new Error(`sheet not found: ${spec.sheet}`);

  const lines: Line[] = [];
  let floatGiven = 0;
  let sheetFloatTotal: number | null = null;

  if (spec.layout === "new") {
    // Columns: A Date · B Section · C Category · D Description · E Receipt · F Status
    //          G Payment · H Payment details · I Amount · J TO
    // The footer sits in H (label) and I (value), below the lines.
    let headerRow = 0;
    ws.eachRow((row, i) => {
      if (!headerRow && asText(row.values[1 as keyof typeof row.values]).toLowerCase() === "date") headerRow = i;
    });

    ws.eachRow((row, i) => {
      if (i <= headerRow) return;
      const v = row.values as Cell[];

      const footLabel = asText(v[8]).toLowerCase();
      if (footLabel.includes("total pitty") || footLabel.includes("total petty")) {
        sheetFloatTotal = asNumber(v[9]);
        return;
      }
      if (footLabel.includes("monthly pitty") || footLabel.includes("monthly petty")) {
        floatGiven = asNumber(v[9]) ?? 0;
        return;
      }
      // "TOTAL EXPENSES" and "Amount to reimburse" are derived here, never read.
      if (footLabel.includes("total expenses") || footLabel.includes("reimburse")) return;

      const amount = asNumber(v[9]);
      if (amount === null || amount === 0) return;

      const date = readDate(v[1], spec);
      const receiptCell = v[5];
      const receiptName = asText(receiptCell).split("\n")[0]!.trim() || null;
      const description =
        asText(v[4]) || asText(v[8]) || asText(v[3]) || "(no description in the sheet)";

      lines.push({
        id: `mc_${slug(spec.sheet)}_${i}`,
        date: date ?? spec.end,
        dateAssumed: date === null,
        sectionId: SECTIONS[asText(v[2]).toLowerCase()] ?? DEFAULT_SECTION,
        categoryId: CATEGORIES[asText(v[3]).toLowerCase()] ?? null,
        description,
        method: /pitty|petty/i.test(asText(v[7])) ? "FLOAT" : "COMPANY_TRANSFER",
        paymentDetails: asText(v[8]) || null,
        payee: asText(v[10]) || null,
        amount,
        receiptName,
        receiptUrl: asLink(receiptCell),
      });
    });
  } else {
    // The old expense-report layout. Its columns MOVED between the three tabs, so each is
    // located by its own header row rather than by a fixed offset.
    //   Oct-Nov : A DATE · B ITEMS · C Q · D DESCRIPTION · E RECEIPTS · F BUDGET · G TOTAL · H project
    //   Dec     : the same, plus I PAYMENT TO — and no dates at all
    //   JAN     : A ITEMS · B Q · C "DESCRIPTION" · D RECEIPTS · E COST · G project · H PAYMENT TO
    //             …where C is labelled DESCRIPTION but actually holds the receipt hyperlink and D
    //             is always empty. Reading the labels rather than the cells cost every JAN line
    //             its receipt and gave it "[object Object]" for a description.
    const jan = spec.sheet === "JAN";
    const col = {
      date: jan ? 0 : 1,
      items: jan ? 1 : 2,
      description: jan ? 0 : 4,
      receipts: jan ? 3 : 5,
      amount: jan ? 5 : 7,
      project: jan ? 7 : 8,
      payee: jan ? 8 : 9,
    };

    ws.eachRow((row, i) => {
      if (i < 10) return; // rows 1–9 are the report's own header block
      const v = row.values as Cell[];
      const amount = asNumber(v[col.amount]);
      if (amount === null || amount === 0) return;

      const items = asText(v[col.items]);

      // The tab's own SUM row: an amount with no item beside it. It is the total OF the lines,
      // not another line — reading it as one silently DOUBLED Oct–Nov and Dec on the first run.
      // Captured so the parse can be checked against it rather than merely skipped.
      if (!items && !(col.description && asText(v[col.description]))) {
        if (sheetFloatTotal === null) sheetFloatTotal = amount;
        return;
      }

      // The sheet carried its own overspend forward as a typed line. The platform has a real
      // opening balance for that, so the hand-written one is dropped rather than imported as
      // a purchase that never happened.
      if (/overbudget/i.test(items)) return;

      const date = col.date ? readDate(v[col.date], spec) : null;
      const receiptCell = v[col.receipts];
      const description = [items, col.description ? asText(v[col.description]) : ""]
        .filter(Boolean)
        .join(" — ");

      lines.push({
        id: `mc_${slug(spec.sheet)}_${i}`,
        date: date ?? spec.end,
        dateAssumed: date === null,
        sectionId: SECTIONS[asText(v[col.project]).toLowerCase()] ?? DEFAULT_SECTION,
        categoryId: null,
        description: description || "(no description in the sheet)",
        method: "FLOAT",
        paymentDetails: null,
        payee: asText(v[col.payee]) || null,
        amount,
        receiptName: asText(receiptCell).split("\n")[0]!.trim() || null,
        receiptUrl: asLink(receiptCell),
      });
    });
  }

  return { spec, lines, floatGiven, sheetFloatTotal };
}

// ─── SQL helpers ────────────────────────────────────────────────────────────

const q = (s: string | null): string => (s === null ? "NULL" : `'${s.replace(/'/g, "''")}'`);
const money = (n: number): string => n.toFixed(2);
const round2 = (n: number): number => Math.round(n * 100) / 100;

function contentTypeFor(fileName: string | null): string {
  const ext = (fileName ?? "").toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "heic") return "image/heic";
  return "application/octet-stream";
}

// ─── Build ──────────────────────────────────────────────────────────────────

const wb = new ExcelJS.Workbook();
await wb.xlsx.read(
  (await import("node:stream")).Readable.from(readFileSync(workbookPath)),
);

const tabs = TABS.map((spec) => parseTab(wb, spec));

// Assert every tab against the sheet's OWN "Total Pitty Cash" line before writing anything.
const warnings: string[] = [];
for (const t of tabs) {
  const floatSpend = round2(t.lines.filter((l) => l.method === "FLOAT").reduce((s, l) => s + l.amount, 0));
  const stated = t.sheetFloatTotal ?? t.spec.statedTotal ?? null;

  if (stated === null) {
    warnings.push(`${t.spec.sheet}: the sheet states no total to check this parse against`);
    continue;
  }
  const difference = round2(floatSpend - stated);
  if (Math.abs(difference) < 0.005) continue;

  // A NEW-format tab states "Total Pitty Cash" explicitly and it has always been right. A
  // disagreement there means the parse is wrong, and nothing should ship.
  if (t.spec.layout === "new") {
    throw new Error(
      `${t.spec.sheet}: float spend ${floatSpend} does not match the sheet's "Total Pitty Cash" ${stated}`,
    );
  }
  // An OLD tab's total is a hand-written SUM over a fixed range, and Oct–Nov's stops one row
  // short of a 12,540 line somebody added underneath it. The line is real, so it is imported —
  // but the difference is reported rather than absorbed, because the person reading this will
  // be comparing it against the sheet.
  warnings.push(
    `${t.spec.sheet}: imported ${floatSpend} against the sheet's stated ${stated} ` +
      `(difference ${difference} — the sheet's SUM does not cover every row)`,
  );
}

// The whole import has to land on the figure the CEO confirmed.
let balance = 0;
const settlements: { label: string; amount: number; date: string }[] = [];
for (const t of tabs) {
  const floatSpend = round2(t.lines.filter((l) => l.method === "FLOAT").reduce((s, l) => s + l.amount, 0));
  const closing = round2(balance + t.floatGiven - floatSpend);
  if (t.spec.label === OPEN_PERIOD) {
    balance = closing;
  } else {
    // Settled at the end of the period: the company paid the custodian what it owed (or she
    // returned what she still held), so the next period opens at zero.
    if (Math.abs(closing) > 0.005) settlements.push({ label: t.spec.label, amount: closing, date: t.spec.end });
    balance = 0;
  }
}
const EXPECTED = -9726.26;
if (Math.abs(balance - EXPECTED) > 0.005) {
  throw new Error(`import lands on ${balance}, not the confirmed ${EXPECTED}`);
}

// ─── Emit ───────────────────────────────────────────────────────────────────

const totalLines = tabs.reduce((n, t) => n + t.lines.length, 0);
const missingReceipts = tabs.reduce((n, t) => n + t.lines.filter((l) => !l.receiptUrl).length, 0);
const assumedDates = tabs.reduce((n, t) => n + t.lines.filter((l) => l.dateAssumed).length, 0);

const out: string[] = [];
const w = (s = "") => out.push(s);

w(`-- HR_ERP — The marketing petty cash float, with its history (spec 040, 2026-08-25).`);
w(`--`);
w(`-- GENERATED by scripts/import-marcom-workbook.mts from NEW_MARCOM_Expenses.xlsx.`);
w(`-- Read that script for what each decision was and why; this file is its output.`);
w(`--`);
w(`--   ${tabs.length} periods · ${totalLines} lines · ${missingReceipts} without a receipt link`);
w(`--   ${assumedDates} lines whose date the sheet did not record (dated to their period's last day)`);
w(`--   Every period settled except ${OPEN_PERIOD}, which is left OPEN owing 9,726.26.`);
w(`--`);
w(`-- THE CUSTODIAN is resolved by lookup, never hard-coded to an id this file cannot know.`);
w(`-- If nobody matches, the import does nothing and says so — a half-imported ledger is worse`);
w(`-- than an empty one.`);
w(`--`);
w(`-- IDEMPOTENT: every row carries a deterministic id and every insert is ON CONFLICT DO NOTHING.`);
w();
w(`BEGIN;`);
w();
w(`DO $import$`);
w(`DECLARE`);
w(`  v_custodian TEXT;`);
w(`  v_finance   TEXT;`);
w(`  v_account   TEXT := 'pca_marketing';`);
w(`BEGIN`);
w(`  -- Raneem Sarhaan, Marketing Manager — the workbook's "SUBMITTED BY" on every tab.`);
w(`  SELECT id INTO v_custodian FROM "User"`);
w(`   WHERE lower(email) = 'raneem.sarhaan@forefront.consulting' AND status = 'ACTIVE' LIMIT 1;`);
w(`  IF v_custodian IS NULL THEN`);
w(`    SELECT id INTO v_custodian FROM "User"`);
w(`     WHERE name ILIKE '%raneem%' AND status = 'ACTIVE' ORDER BY "createdAt" LIMIT 1;`);
w(`  END IF;`);
w(`  IF v_custodian IS NULL THEN`);
w(`    RAISE WARNING 'marcom import skipped: no active user matching Raneem Sarhaan';`);
w(`    RETURN;`);
w(`  END IF;`);
w();
w(`  -- Mohamed Selim, Finance — the workbook's "SUBMITTED TO". Optional: every column that`);
w(`  -- records him is nullable, so a missing match costs an attribution, not the import.`);
w(`  SELECT id INTO v_finance FROM "User"`);
w(`   WHERE name ILIKE '%selim%' AND status = 'ACTIVE' ORDER BY "createdAt" LIMIT 1;`);
w();
w(`  INSERT INTO "PettyCashAccount" ("id","name","status","custodianId","createdById","createdAt","updatedAt")`);
w(`  VALUES (v_account, 'Marketing petty cash', 'ACTIVE', v_custodian, v_finance, now(), now())`);
w(`  ON CONFLICT ("id") DO NOTHING;`);
w();

for (const t of tabs) {
  const { spec } = t;
  const pid = `pcp_${slug(spec.sheet)}`;
  const floatSpend = round2(t.lines.filter((l) => l.method === "FLOAT").reduce((s, l) => s + l.amount, 0));
  const isOpen = spec.label === OPEN_PERIOD;
  const missing = t.lines.filter((l) => !l.receiptUrl);

  w(`  -- ─── ${spec.label} (sheet tab "${spec.sheet}") ${"─".repeat(Math.max(0, 44 - spec.label.length - spec.sheet.length))}`);
  w(`  --   ${t.lines.length} lines · float spend ${money(floatSpend)} · advanced ${money(t.floatGiven)}`);
  w(`  INSERT INTO "PettyCashPeriod"`);
  w(`    ("id","accountId","label","startDate","endDate","budget","openingBalance","status",`);
  w(`     "submittedAt","submittedById","closedAt","closedById",`);
  w(`     "missingEvidenceAckAt","missingEvidenceAckById","missingEvidenceAckNote","missingEvidenceAckLineIds",`);
  w(`     "createdAt","updatedAt")`);
  w(`  VALUES (${q(pid)}, v_account, ${q(spec.label)}, ${q(spec.start)}::timestamp, ${q(spec.end)}::timestamp,`);
  w(`     ${spec.budget === undefined ? "NULL" : money(spec.budget)}, 0.00, ${q(isOpen ? "OPEN" : "CLOSED")},`);
  if (isOpen) {
    w(`     NULL, NULL, NULL, NULL,`);
    w(`     NULL, NULL, NULL, '{}',`);
  } else {
    w(`     ${q(spec.end)}::timestamp, v_finance, ${q(spec.end)}::timestamp, v_finance,`);
    if (missing.length) {
      const note =
        `Imported from the marketing expenses workbook. These lines had no receipt link in the sheet.`;
      w(`     ${q(spec.end)}::timestamp, v_finance, ${q(note)},`);
      w(`     ARRAY[${missing.map((l) => q(l.id)).join(",")}]::text[],`);
    } else {
      w(`     NULL, NULL, NULL, '{}',`);
    }
  }
  w(`     now(), now())`);
  w(`  ON CONFLICT ("id") DO NOTHING;`);
  w();

  if (t.floatGiven > 0) {
    w(`  INSERT INTO "PettyCashFunding" ("id","accountId","periodId","type","date","amount","reference","note","recordedById","createdAt")`);
    w(`  VALUES ('pcf_${slug(spec.sheet)}_advance', v_account, ${q(pid)}, 'TOP_UP', ${q(spec.start)}::timestamp, ${money(t.floatGiven)}, NULL,`);
    w(`          'Float advanced for the period — the sheet''s "Monthly Pitty Cash".', v_finance, now())`);
    w(`  ON CONFLICT ("id") DO NOTHING;`);
    w();
  }

  const settlement = settlements.find((s) => s.label === spec.label);
  if (settlement) {
    const owed = settlement.amount < 0;
    w(`  INSERT INTO "PettyCashFunding" ("id","accountId","periodId","type","date","amount","reference","note","recordedById","createdAt")`);
    w(`  VALUES ('pcf_${slug(spec.sheet)}_settle', v_account, ${q(pid)}, ${q(owed ? "TOP_UP" : "RETURN")}, ${q(settlement.date)}::timestamp, ${money(Math.abs(settlement.amount))}, NULL,`);
    w(`          ${q(owed ? "Reimbursed to the custodian at the end of the period, settling it." : "Returned to the company at the end of the period, settling it.")}, v_finance, now())`);
    w(`  ON CONFLICT ("id") DO NOTHING;`);
    w();
  }

  for (const l of t.lines) {
    w(`  INSERT INTO "PettyCashLine" ("id","periodId","datePaid","sectionId","categoryId","description","method","paymentDetails","payee","amount","createdById","createdAt","updatedAt")`);
    w(`  VALUES (${q(l.id)}, ${q(pid)}, ${q(l.date)}::timestamp, ${q(l.sectionId)}, ${q(l.categoryId)}, ${q(l.description)}, ${q(l.method)}, ${q(l.paymentDetails)}, ${q(l.payee)}, ${money(l.amount)}, v_custodian, now(), now())`);
    w(`  ON CONFLICT ("id") DO NOTHING;`);
    if (l.receiptUrl) {
      w(`  INSERT INTO "ExpenseEvidence" ("id","blobUrl","externalUrl","fileName","contentType","sizeBytes","uploadedById","pettyCashLineId","createdAt")`);
      w(`  VALUES ('ev_${l.id}', NULL, ${q(l.receiptUrl)}, ${q(l.receiptName ?? "Receipt")}, ${q(contentTypeFor(l.receiptName))}, 0, v_custodian, ${q(l.id)}, now())`);
      w(`  ON CONFLICT ("id") DO NOTHING;`);
    }
  }
  w();
}

w(`END`);
w(`$import$;`);
w();
w(`COMMIT;`);
w();
w(`-- After this runs, the account's balance is  ${money(balance)}  — Forefront owes the custodian`);
w(`-- ${money(Math.abs(balance))}, the closing figure of the workbook's last tab.`);

console.error(`parsed ${totalLines} lines across ${tabs.length} periods; balance ${money(balance)}`);
for (const warning of warnings) console.error(`warning: ${warning}`);

console.log(out.join("\n"));
