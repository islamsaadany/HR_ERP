/**
 * Incentive Scheme — validation for the on-screen edits to the three review sheets.
 *
 * The cycle page's "Review & validation" tables are editable in place, so a
 * correction spotted on screen doesn't mean rebuilding a CSV and re-uploading.
 * Everything a person types arrives here as raw strings and is parsed and checked
 * ONCE, in one pure function, before anything is written — the same shape as the
 * CSV importer, and reusing its tolerant number parser so "1,000" and "EGP 500"
 * mean the same thing whichever way they arrived.
 *
 * Two deliberate departures from the importer:
 *  - **Status is chosen, not derived.** The importer works status out from the
 *    closure-date column because a sheet only has that one column. The editor
 *    shows a dropdown, so it takes what was picked; setting a closure date does
 *    not silently re-decide it.
 *  - **Contributions that don't total 100% still save.** That is a payout rule
 *    (the engine already blocks such a client and the table flags it red), not a
 *    save rule — half-finished shares must be storable so an operator can come
 *    back to them.
 *
 * Every fault is reported at once: a form that rejects on the first problem makes
 * someone fix a table one round-trip at a time.
 */
import { parseSheetNumber } from "./import";
import { INCENTIVE_DATE_FORMAT, formatIncentiveDateISO, parseTypedDate } from "./dates";
import type { AssignmentType } from "./rules";

export const ASSIGNMENT_STATUSES = ["ongoing", "closed", "in_progress", "pending"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

/** One row as the browser holds it: `id` is null for a row added on screen. */
export type ReviewPersonInput = {
  id: string | null;
  name: string;
  role: string;
  netMonthlySalary: string;
  startDate: string;
};

export type ReviewAssignmentInput = {
  id: string | null;
  client: string;
  type: string;
  lead: string;
  bd: string;
  leadSource: string;
  revenue: string;
  directCost: string;
  vendorCost: string;
  markupPct: string;
  startDate: string;
  closeDate: string;
  status: string;
};

/** The contributions matrix: person names are the columns, each row a client. */
export type ReviewContributionsInput = {
  persons: string[];
  rows: { client: string; shares: string[] }[];
};

export type ReviewPayload = {
  people: ReviewPersonInput[];
  assignments: ReviewAssignmentInput[];
  contributions: ReviewContributionsInput;
};

export type CleanPerson = {
  id: string | null;
  name: string;
  role: string | null;
  netMonthlySalary: number;
  startDate: Date | null;
};

export type CleanAssignment = {
  client: string;
  type: AssignmentType;
  lead: string;
  bd: string;
  leadSource: string | null;
  revenue: number | null;
  directCost: number | null;
  vendorCost: number;
  markupPct: number;
  startDate: Date | null;
  closeDate: Date | null;
  status: AssignmentStatus;
};

export type CleanContribution = { client: string; person: string; share: number };

export type ReviewValidation =
  | { ok: true; clean: { people: CleanPerson[]; assignments: CleanAssignment[]; contributions: CleanContribution[] } }
  | { ok: false; errors: string[] };

const key = (s: string) => s.trim().toLowerCase();

/**
 * A typed date cell → Date, `null` when blank, or `undefined` when unusable.
 *
 * The cells are **`14-Jul 2026`** (`dd-mmm yyyy`): a spelled month cannot be read
 * the wrong way round, so an operator can check at a glance that what they typed is
 * what landed. Other forms a person might paste in — dd/mm/yyyy and ISO — are still
 * accepted rather than rejected, so an untouched stored value or a value copied off
 * a sheet can't be refused on its way back out. Everything is read by the module's
 * one date reader (./dates), the same one the CSV importer uses.
 *
 * A native `<input type="date">` was the obvious control and was wrong: it draws
 * itself in the *browser's* UI language, rendering 1 March 2021 as `03/01/2021`
 * under en-GB, ar-EG and en-US alike when measured. A field whose format nobody can
 * promise is not a field you enter a closure date in.
 */
function parseDateInput(v: string): Date | null | undefined {
  if (!v.trim()) return null;
  return parseTypedDate(v) ?? undefined;
}

/** What the date cells tell the operator to type, and what a refusal repeats back. */
export const DATE_CELL_FORMAT = INCENTIVE_DATE_FORMAT;

/**
 * Collect the names that appear more than once (case-insensitively), so the
 * message can name them rather than saying "a duplicate exists somewhere".
 */
function duplicates(names: string[]): string[] {
  const seen = new Map<string, string>();
  const dupes: string[] = [];
  for (const n of names) {
    const k = key(n);
    if (!k) continue;
    if (seen.has(k)) {
      if (!dupes.includes(seen.get(k)!)) dupes.push(seen.get(k)!);
    } else seen.set(k, n.trim());
  }
  return dupes;
}

export function validateReview(payload: ReviewPayload): ReviewValidation {
  const errors: string[] = [];

  // ── People ────────────────────────────────────────────────────────────────
  const people: CleanPerson[] = [];
  payload.people.forEach((p, i) => {
    const name = p.name.trim();
    const where = name ? `"${name}"` : `People row ${i + 1}`;
    if (!name) errors.push(`People row ${i + 1}: enter a name.`);

    const salary = parseSheetNumber(p.netMonthlySalary);
    if (salary == null) errors.push(`${where}: net monthly salary must be a number.`);
    else if (salary < 0) errors.push(`${where}: net monthly salary can't be negative.`);

    const startDate = parseDateInput(p.startDate);
    if (startDate === undefined) errors.push(`${where}: start date must be a real date, e.g. 14-Jul 2026.`);

    people.push({
      id: p.id,
      name,
      role: p.role.trim() || null,
      netMonthlySalary: salary ?? 0,
      startDate: startDate ?? null,
    });
  });
  for (const d of duplicates(people.map((p) => p.name))) {
    errors.push(`Two people are called "${d}" — each name must appear once.`);
  }

  // ── Assignments ───────────────────────────────────────────────────────────
  const assignments: CleanAssignment[] = [];
  payload.assignments.forEach((a, i) => {
    const client = a.client.trim();
    const where = client ? `"${client}"` : `Assignments row ${i + 1}`;
    if (!client) errors.push(`Assignments row ${i + 1}: enter a client.`);

    const type = a.type.trim().toUpperCase();
    if (type !== "PRJ" && type !== "RET") errors.push(`${where}: type must be PRJ or RET.`);

    const status = a.status.trim() as AssignmentStatus;
    if (!ASSIGNMENT_STATUSES.includes(status)) errors.push(`${where}: pick a status.`);

    /** Blank is allowed (and means "not known yet"); anything present must be a non-negative number. */
    const money = (raw: string, label: string): number | null => {
      if (raw.trim() === "") return null;
      const n = parseSheetNumber(raw);
      if (n == null) {
        errors.push(`${where}: ${label} must be a number.`);
        return null;
      }
      if (n < 0) {
        errors.push(`${where}: ${label} can't be negative.`);
        return null;
      }
      return n;
    };

    const startDate = parseDateInput(a.startDate);
    if (startDate === undefined) errors.push(`${where}: start date must be a real date, e.g. 14-Jul 2026.`);
    const closeDate = parseDateInput(a.closeDate);
    if (closeDate === undefined) errors.push(`${where}: closure date must be a real date, e.g. 14-Jul 2026.`);

    assignments.push({
      client,
      type: type === "RET" ? "RET" : "PRJ",
      lead: a.lead.trim(),
      bd: a.bd.trim(),
      leadSource: a.leadSource.trim() || null,
      revenue: money(a.revenue, "revenue"),
      directCost: money(a.directCost, "direct cost"),
      vendorCost: money(a.vendorCost, "vendor cost") ?? 0,
      markupPct: money(a.markupPct, "markup %") ?? 0,
      startDate: startDate ?? null,
      closeDate: closeDate ?? null,
      status: ASSIGNMENT_STATUSES.includes(status) ? status : "pending",
    });
  });
  for (const d of duplicates(assignments.map((a) => a.client))) {
    errors.push(`Two assignments are for "${d}" — each client must appear once.`);
  }

  // ── Contributions matrix ──────────────────────────────────────────────────
  const persons = payload.contributions.persons.map((p) => p.trim());
  persons.forEach((p, i) => {
    if (!p) errors.push(`Contributions column ${i + 1}: pick a person, or remove the column.`);
  });
  for (const d of duplicates(persons)) {
    errors.push(`"${d}" has two columns in Contributions — each person gets one.`);
  }

  const contributions: CleanContribution[] = [];
  payload.contributions.rows.forEach((row, i) => {
    const client = row.client.trim();
    if (!client) {
      errors.push(`Contributions row ${i + 1}: enter a client, or remove the row.`);
      return;
    }
    persons.forEach((person, c) => {
      const raw = (row.shares[c] ?? "").trim();
      if (raw === "" || !person) return;
      const n = parseSheetNumber(raw);
      if (n == null) {
        errors.push(`"${client}" / ${person}: "${raw}" isn't a number.`);
        return;
      }
      if (n < 0) {
        errors.push(`"${client}" / ${person}: a share can't be negative.`);
        return;
      }
      // The matrix is entered in whole percent (the cell shows a % suffix); the
      // engine works in fractions.
      contributions.push({ client, person, share: n / 100 });
    });
  });
  for (const d of duplicates(payload.contributions.rows.map((r) => r.client))) {
    errors.push(`"${d}" has two rows in Contributions — each client gets one.`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, clean: { people, assignments, contributions } };
}

// ── The other direction: stored rows → what the browser edits ───────────────
// Kept here beside the validator so the round trip (stored → cells → stored) is
// one testable pair. A share that survives a trip through the editor unchanged
// is the whole point; two halves in two files is how that stops being true.

/** The three sheets as stored, which the section renders read-only and seeds the draft from. */
export type ReviewData = {
  people: { id: string; name: string; role: string | null; netMonthlySalary: number; startDate: string | null }[];
  assignments: {
    id: string;
    client: string;
    type: string;
    lead: string;
    bd: string;
    leadSource: string | null;
    revenue: number | null;
    directCost: number | null;
    vendorCost: number;
    markupPct: number;
    startDate: string | null;
    closeDate: string | null;
    status: string;
  }[];
  contributions: { client: string; person: string; share: number }[];
};

/** What the browser holds while editing: every cell a string, exactly as typed. */
export type ContribRow = { client: string; shares: string[] };
export type Draft = {
  people: ReviewPersonInput[];
  assignments: ReviewAssignmentInput[];
  persons: string[];
  rows: ContribRow[];
};

/**
 * Contribution column order: people in People order who actually have a share,
 * then anyone contributing who isn't in the People sheet (which the report
 * flags separately). Shared by the read-only table and the editor so the
 * columns don't reshuffle when Edit is pressed.
 */
export function contribPersonOrder(data: ReviewData): string[] {
  const contributing = new Set(data.contributions.map((c) => c.person));
  return [
    ...data.people.map((p) => p.name).filter((n) => contributing.has(n)),
    ...[...contributing].filter((n) => !data.people.some((p) => p.name === n)),
  ];
}

const numText = (n: number | null) => (n == null ? "" : String(n));

export function toDraft(data: ReviewData): Draft {
  const persons = contribPersonOrder(data);
  const clients: string[] = [];
  for (const c of data.contributions) if (!clients.includes(c.client)) clients.push(c.client);
  const at = new Map(data.contributions.map((c) => [`${c.client}||${c.person}`, c.share]));

  return {
    people: data.people.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role ?? "",
      netMonthlySalary: String(p.netMonthlySalary),
      startDate: formatIncentiveDateISO(p.startDate),
    })),
    assignments: data.assignments.map((a) => ({
      id: a.id,
      client: a.client,
      type: a.type,
      lead: a.lead,
      bd: a.bd,
      leadSource: a.leadSource ?? "",
      revenue: numText(a.revenue),
      directCost: numText(a.directCost),
      vendorCost: a.vendorCost ? String(a.vendorCost) : "",
      markupPct: a.markupPct ? String(a.markupPct) : "",
      startDate: formatIncentiveDateISO(a.startDate),
      closeDate: formatIncentiveDateISO(a.closeDate),
      status: a.status,
    })),
    persons,
    // Shares are held in whole percent — the same unit the cell shows and the
    // same unit validateReview divides back down by 100.
    rows: clients.map((client) => ({
      client,
      shares: persons.map((p) => {
        const s = at.get(`${client}||${p}`);
        return s == null ? "" : String(Math.round(s * 1000) / 10);
      }),
    })),
  };
}

/** A contributions row's live total, in whole percent, as the editor shows it. */
export function draftRowTotal(row: ContribRow): number {
  return row.shares.reduce((s, v) => s + (parseSheetNumber(v) ?? 0), 0);
}

/** ±1 percentage point — the same tolerance the engine blocks a client on. */
export function isOffTotal(totalPct: number): boolean {
  return Math.abs(totalPct - 100) > 1 + 1e-6;
}

/** The payload a draft is saved as. */
export function draftPayload(draft: Draft): ReviewPayload {
  return {
    people: draft.people,
    assignments: draft.assignments,
    contributions: { persons: draft.persons, rows: draft.rows },
  };
}
