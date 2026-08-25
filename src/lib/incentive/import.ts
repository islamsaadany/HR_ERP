/**
 * Incentive Scheme — CSV parsing + validation for the uploaded sheets.
 *
 * Canonical upload format is CSV (export each sheet from Excel as CSV). Pure and
 * dependency-free. Validation follows the agreed "flag and block" rule: rows
 * with problems are reported and the affected assignment is excluded from the
 * payout until the data is corrected.
 */
import type { AssignmentType } from "./rules";

/** Minimal robust CSV parser (handles quotes, embedded commas, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // ignore
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-blank rows.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, "");

/** Map a header row to indices by normalised name, tolerating spacing/underscores. */
function headerIndex(header: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    idx[norm(h)] = i;
  });
  return idx;
}

/**
 * Read a figure the way an operator writes one. Strips thousands separators,
 * spaces, currency, and a trailing percent sign so "7%", "1,000", "EGP 500", and
 * "66 %" all parse (percent values are converted to a fraction by the caller
 * where relevant); "pending"/"TBD"/"n/a" read as "not known yet" (null).
 *
 * Exported because the on-screen review editor (`./review`) must read a typed
 * figure identically — the same number pasted into a cell and into a CSV cannot
 * be allowed to mean two different things.
 */
export function parseSheetNumber(v: string | undefined): number | null {
  if (v == null) return null;
  const s = v.replace(/[,%\s]/g, "").replace(/egp/i, "").trim();
  if (s === "" || /pending|tbd|n\/a/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const num = parseSheetNumber;

function boolYes(v: string | undefined): boolean {
  return /^(y|yes|true|1)$/i.test((v ?? "").trim());
}

/** Excel serial date → JS Date (Excel epoch 1899-12-30). */
function fromExcelSerial(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}

function parseDate(v: string | undefined): Date | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 80000) return fromExcelSerial(n); // plausible Excel serial
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export type ParsedPerson = {
  name: string;
  role: string | null;
  netMonthlySalary: number;
  startDate: Date | null;
  eligibleToLead: boolean;
  utilization: number | null;
};

export type ParsedAssignment = {
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
  status: "closed" | "ongoing" | "in_progress" | "pending";
};

export type ParsedContribution = { client: string; person: string; share: number };

export type ParseResult<T> = { rows: T[]; issues: string[] };

export function parsePeople(csv: string): ParseResult<ParsedPerson> {
  const table = parseCsv(csv);
  const issues: string[] = [];
  if (table.length < 2) return { rows: [], issues: ["People sheet has no data rows."] };
  const h = headerIndex(table[0]);
  const need = ["name", "netmonthlysalary"];
  for (const k of need) if (!(k in h)) issues.push(`People sheet is missing a "${k}" column.`);
  const rows: ParsedPerson[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const name = (cells[h["name"]] ?? "").trim();
    if (!name) continue;
    const salary = num(cells[h["netmonthlysalary"]]);
    if (salary == null) issues.push(`Person "${name}": missing/invalid net monthly salary.`);
    const util = num(cells[h["utilization"] ?? h["utilisation"]]);
    rows.push({
      name,
      role: (cells[h["role"]] ?? "").trim() || null,
      netMonthlySalary: salary ?? 0,
      startDate: parseDate(cells[h["startdate"]]),
      eligibleToLead: h["eligibletolead"] != null ? boolYes(cells[h["eligibletolead"]]) : true,
      // Accept utilisation as a fraction (0.66) or a percentage (66) → store as fraction.
      utilization: util == null ? null : util > 1 ? util / 100 : util,
    });
  }
  return { rows, issues };
}

function deriveStatus(type: AssignmentType, closeRaw: string, directCost: number | null): ParsedAssignment["status"] {
  const s = closeRaw.trim().toLowerCase();
  if (/^ongoing$/.test(s)) return "ongoing";
  if (/in\s*progress/.test(s)) return "in_progress";
  if (parseDate(closeRaw)) return "closed";
  if (!s || /pending/.test(s) || directCost == null) return type === "RET" ? "ongoing" : "pending";
  return "pending";
}

export function parseAssignments(csv: string): ParseResult<ParsedAssignment> {
  const table = parseCsv(csv);
  const issues: string[] = [];
  if (table.length < 2) return { rows: [], issues: ["Assignments sheet has no data rows."] };
  const h = headerIndex(table[0]);
  for (const k of ["client", "type", "lead", "bd"]) if (!(k in h)) issues.push(`Assignments sheet is missing a "${k}" column.`);
  const rows: ParsedAssignment[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const client = (cells[h["client"]] ?? "").trim();
    if (!client) continue;
    const typeRaw = (cells[h["type"]] ?? "").trim().toUpperCase();
    const type: AssignmentType = typeRaw === "RET" ? "RET" : "PRJ";
    if (typeRaw !== "RET" && typeRaw !== "PRJ") issues.push(`Assignment "${client}": type "${typeRaw}" not RET/PRJ — treated as PRJ.`);
    const directCost = num(cells[h["directcost"]]);
    const closeRaw = cells[h["closedate"]] ?? "";
    rows.push({
      client,
      type,
      lead: (cells[h["lead"]] ?? "").trim(),
      bd: (cells[h["bd"]] ?? "").trim(),
      leadSource: (cells[h["leadsource"]] ?? "").trim() || null,
      revenue: num(cells[h["revenue"]]),
      directCost,
      vendorCost: num(cells[h["vendorcost"]]) ?? 0,
      markupPct: num(cells[h["markuppct"]]) ?? 0,
      startDate: parseDate(cells[h["startdate"]]),
      closeDate: parseDate(closeRaw),
      status: deriveStatus(type, closeRaw, directCost),
    });
  }
  return { rows, issues };
}

/**
 * Contributions arrive as a matrix: first column = client, remaining columns are
 * headed by person names; each cell is that person's share (fraction or %).
 */
export function parseContributions(csv: string): ParseResult<ParsedContribution> {
  const table = parseCsv(csv);
  const issues: string[] = [];
  if (table.length < 2) return { rows: [], issues: ["Contributions sheet has no data rows."] };
  const header = table[0];
  const people = header.slice(1).map((p) => p.trim());
  const rows: ParsedContribution[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const client = (cells[0] ?? "").trim();
    if (!client) continue;
    for (let c = 1; c < header.length; c++) {
      const person = people[c - 1];
      if (!person) continue;
      const raw = (cells[c] ?? "").trim();
      if (raw === "") continue;
      const n = num(raw);
      if (n == null) {
        issues.push(`Contribution for ${client}/${person}: "${raw}" is not a number.`);
        continue;
      }
      rows.push({ client, person, share: n > 1 ? n / 100 : n });
    }
  }
  return { rows, issues };
}
