// Employee CSV import — pure parsing (no DB). Turns a messy real-world HR sheet
// into structured, validated rows plus per-row warnings for anything the app
// had to guess or couldn't read. The server action in the admin import page
// performs the upserts; this file never touches Prisma so it stays testable.
//
// Alignment decisions baked in (confirmed with HR, 2026-07-28):
//  - Ambiguous numeric dates (both parts <= 12, e.g. 4/5/1980) are read DAY-FIRST.
//  - Tenure band is DERIVED from Date of Hiring (no band column in the sheet).
//  - Unreadable/annotated dates (e.g. "22-Sep-2-15", "16.06.2025 (Hopefully)")
//    are left blank and reported — never invented.

import type {
  EmploymentType,
  MaritalStatus,
  TenureBand,
} from "@prisma/client";
import { parseDelimited } from "./csv";
import { deriveTenureBand } from "@/lib/tenure";
import { isValidNationalId, isValidStoredPhone, normalizeLoosePhone } from "@/lib/phone";

// ─── Dates ──────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const WEEKDAYS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

const BLANKS = new Set(["", "na", "n/a", "none", "-", "—", "tbd", "n.a", "n.a."]);

export type DateStatus = "empty" | "ok" | "ambiguous" | "unparseable";

export interface ParsedDate {
  status: DateStatus;
  value: Date | null; // UTC midnight of the parsed calendar day
  raw: string;
}

/** Expand a 2-digit year: <50 → 2000s, else 1900s. */
function expandYear(y: number): number {
  if (y >= 100) return y;
  return y < 50 ? 2000 + y : 1900 + y;
}

/** Build a UTC date and confirm the calendar day is real (rejects 31 Feb, etc.). */
function buildDate(
  year: number,
  month: number,
  day: number,
  raw: string,
  ambiguous: boolean
): ParsedDate | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return { status: ambiguous ? "ambiguous" : "ok", value: d, raw };
}

/** Dates containing a month name: "Monday, April 01, 2024", "2-May-2013", "28 Feb 2013", "1-Jun-26". */
function matchMonthName(raw: string): ParsedDate | null {
  const lower = raw.toLowerCase();
  const monthKey = Object.keys(MONTHS).find((k) =>
    new RegExp(`(^|[^a-z])${k}([^a-z]|$)`).test(lower)
  );
  if (!monthKey) return null;

  let rest = lower.replace(new RegExp(monthKey), " ");
  for (const wd of WEEKDAYS) rest = rest.replace(wd, " ");
  // Any leftover letters mean a note we don't understand (e.g. "(hopefully)").
  if (/[a-z]/.test(rest)) return { status: "unparseable", value: null, raw };

  const nums = (rest.match(/\d+/g) ?? []).map(Number);
  if (nums.length < 2) return { status: "unparseable", value: null, raw };

  // Convention across the sheet: day first, year last.
  const day = nums[0];
  const year = expandYear(nums[nums.length - 1]);
  const built = buildDate(year, MONTHS[monthKey], day, raw, false);
  return built ?? { status: "unparseable", value: null, raw };
}

/** Purely numeric dates: 16.02.1990, 8/20/1983, 4/5/1980, 16/11/2025. */
function matchNumeric(raw: string): ParsedDate | null {
  const parts = raw.split(/[./\-\s]+/).filter(Boolean);
  if (parts.length !== 3) return null;
  if (!parts.every((p) => /^\d+$/.test(p))) return null;
  const [a, b, c] = parts.map(Number);

  // ISO-ish yyyy-mm-dd (no such rows in the current sheet, but handle it safely).
  if (parts[0].length === 4) {
    return (
      buildDate(a, b, c, raw, false) ?? { status: "unparseable", value: null, raw }
    );
  }

  // Otherwise the year is the last field.
  const year = parts[2].length === 4 ? c : expandYear(c);
  const p = a; // day-first expectation
  const q = b;

  let day: number;
  let month: number;
  let ambiguous = false;
  if (p > 12 && q <= 12) {
    day = p;
    month = q;
  } else if (q > 12 && p <= 12) {
    // Clearly month/day order (e.g. 8/20/1983).
    day = q;
    month = p;
  } else if (p <= 12 && q <= 12) {
    // Genuinely ambiguous → day-first per HR decision.
    day = p;
    month = q;
    ambiguous = true;
  } else {
    return { status: "unparseable", value: null, raw };
  }

  return (
    buildDate(year, month, day, raw, ambiguous) ?? {
      status: "unparseable",
      value: null,
      raw,
    }
  );
}

/** Parse a date cell in any of the sheet's formats. Never guesses beyond day/month order. */
export function parseFlexibleDate(rawInput: string): ParsedDate {
  const raw = (rawInput ?? "").trim();
  if (BLANKS.has(raw.toLowerCase())) return { status: "empty", value: null, raw };
  return (
    matchMonthName(raw) ??
    matchNumeric(raw) ?? { status: "unparseable", value: null, raw }
  );
}

// Tenure band derivation lives in the shared, client-safe module `@/lib/tenure`
// (imported above) so the registry grid can mirror it for instant feedback.
// Re-exported here for existing callers.
export { deriveTenureBand };

// ─── Enum normalisation ─────────────────────────────────────────────────

export function normalizeEmploymentType(raw: string): {
  value: EmploymentType | null;
  unknown: boolean;
} {
  const s = (raw ?? "").trim().toLowerCase();
  if (BLANKS.has(s)) return { value: null, unknown: false };
  if (s.startsWith("full") || s === "ft") return { value: "FULL_TIME", unknown: false };
  if (s.startsWith("part") || s === "pt") return { value: "PART_TIME", unknown: false };
  return { value: null, unknown: true };
}

export function normalizeMaritalStatus(raw: string): MaritalStatus | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (BLANKS.has(s)) return null;
  if (s.startsWith("marr") || s === "maried") return "MARRIED";
  if (s.startsWith("sing")) return "SINGLE";
  if (s.startsWith("div")) return "DIVORCED";
  if (s.startsWith("wid")) return "WIDOWED";
  return null;
}

// ─── Header mapping ─────────────────────────────────────────────────────

type FieldKey =
  | "name"
  | "legalName"
  | "legalNameAr"
  | "nationalId"
  | "employeeId"
  | "department"
  | "businessUnit"
  | "startDate"
  | "title"
  | "employmentType"
  | "email"
  | "phone"
  | "dateOfBirth"
  | "maritalStatus"
  | "numberOfKids"
  | "managerEmail"
  | "spouseName"
  | "spouseDob"
  | "emergencyContactName"
  | "emergencyContactRelationship"
  | "emergencyContactPhone";

const HEADER_ALIASES: Record<FieldKey, string[]> = {
  name: ["name", "full name", "employee name"],
  // normHeader() strips parentheses, so "Legal Name (English)" arrives as "legal name english".
  legalName: ["legal name english", "legal name", "legal name en"],
  legalNameAr: ["legal name arabic", "legal name ar", "arabic legal name"],
  nationalId: ["national id", "national id number", "nid"],
  employeeId: ["employee id", "employeeid", "emp id", "staff id", "employee number"],
  department: ["department", "dept"],
  businessUnit: ["business unit", "businessunit", "bu"],
  startDate: [
    "date of hiring", "hire date", "hiring date", "start date",
    "date of hire", "joining date", "date joined",
  ],
  title: ["title", "job title", "position"],
  employmentType: ["contract type", "employment type", "contract", "type"],
  email: ["email", "e mail", "email address"],
  phone: ["phone number", "phone", "mobile", "contact number"],
  dateOfBirth: ["date of birth", "dob", "birth date", "birthdate"],
  maritalStatus: ["marital status", "marital"],
  numberOfKids: [
    "number of kids", "no of kids", "kids", "children", "number of children",
  ],
  managerEmail: ["manager email", "reports to", "manager", "line manager"],
  spouseName: ["spouse name", "spouse"],
  spouseDob: ["spouse date of birth", "spouse dob", "spouse date of birth"],
  emergencyContactName: ["emergency contact name", "emergency name", "emergency contact"],
  emergencyContactRelationship: [
    "emergency contact relationship", "emergency relationship", "relationship",
  ],
  emergencyContactPhone: [
    "emergency contact phone", "emergency phone", "emergency contact number", "emergency phone number",
  ],
};

function normHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface ColumnMap {
  fields: Partial<Record<FieldKey, number>>;
  kids: { index: number; col: number }[]; // "Kid (N) Date of Birth" columns
  kidNames: { index: number; col: number }[]; // "Kid (N) Name" columns
}

function mapColumns(headerRow: string[]): ColumnMap {
  const fields: Partial<Record<FieldKey, number>> = {};
  const kids: { index: number; col: number }[] = [];
  const kidNames: { index: number; col: number }[] = [];

  headerRow.forEach((rawHeader, col) => {
    const h = normHeader(rawHeader);
    const kidNameMatch = h.match(/^kid\s*(\d+)\s*name$/);
    if (kidNameMatch) {
      kidNames.push({ index: Number(kidNameMatch[1]), col });
      return;
    }
    const kidMatch = h.match(/^kid\s*(\d+)\s*(?:date of birth|dob)$/);
    if (kidMatch) {
      kids.push({ index: Number(kidMatch[1]), col });
      return;
    }
    for (const key of Object.keys(HEADER_ALIASES) as FieldKey[]) {
      if (fields[key] !== undefined) continue;
      if (HEADER_ALIASES[key].includes(h)) {
        fields[key] = col;
        return;
      }
    }
  });

  kids.sort((a, b) => a.index - b.index);
  kidNames.sort((a, b) => a.index - b.index);
  return { fields, kids, kidNames };
}

// ─── Row parsing ────────────────────────────────────────────────────────

export interface ParsedDependant {
  name: string | null;
  dateOfBirth: Date;
  kind: "CHILD" | "SPOUSE";
}

export interface ParsedRow {
  rowNumber: number; // 1-based sheet row (header is row 1)
  name: string;
  email: string;
  emailIsExternal: boolean;
  phone: string | null;
  // The three self-entered identity fields: `undefined` means the sheet has NO such column —
  // the import then leaves the stored value untouched, so a pre-round-5 sheet re-uploaded
  // can never wipe what employees typed. `null` means the column exists and the cell is empty.
  legalName: string | null | undefined;
  legalNameAr: string | null | undefined;
  nationalId: string | null | undefined;
  employeeId: string | null; // person identifier (spec 025); a duplicate links accounts
  department: string | null;
  businessUnitName: string | null; // raw name; resolved to a BU id in the import action
  title: string | null;
  employmentType: EmploymentType | null;
  tenureBand: TenureBand | null;
  startDate: Date | null;
  dateOfBirth: Date | null;
  maritalStatus: MaritalStatus | null;
  managerEmail: string | null;
  dependants: ParsedDependant[];
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  warnings: string[];
  errors: string[]; // non-empty → the row is skipped (not imported)
}

export interface ParseResult {
  rows: ParsedRow[];
  headerErrors: string[];
  companyDomain: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function niceDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse a full employee CSV/TSV into structured rows + warnings. */
export function parseEmployeesCsv(
  text: string,
  opts: { companyDomain?: string; now?: Date; knownDepartments?: string[] } = {}
): ParseResult {
  const companyDomain = (opts.companyDomain ?? "forefront.consulting").toLowerCase();
  const now = opts.now ?? new Date();
  // Managed department list (spec 014) — used only for a soft "unknown department" flag;
  // import stays tolerant and still imports whatever value the cell holds.
  const knownDepartments = new Set(
    (opts.knownDepartments ?? []).map((d) => d.trim().toLowerCase())
  );

  const grid = parseDelimited(text);
  if (grid.length === 0) {
    return { rows: [], headerErrors: ["The file is empty."], companyDomain };
  }

  const header = grid[0];
  const { fields, kids, kidNames } = mapColumns(header);
  const headerErrors: string[] = [];
  if (fields.name === undefined)
    headerErrors.push('Missing a "Name" column.');
  if (fields.email === undefined)
    headerErrors.push('Missing an "Email" column.');
  if (headerErrors.length) return { rows: [], headerErrors, companyDomain };

  const cell = (row: string[], key: FieldKey): string => {
    const col = fields[key];
    if (col === undefined) return "";
    return (row[col] ?? "").trim();
  };

  const rows: ParsedRow[] = [];

  for (let i = 1; i < grid.length; i++) {
    const raw = grid[i];
    const rowNumber = i + 1;
    const warnings: string[] = [];
    const errors: string[] = [];

    const name = cell(raw, "name");
    const email = cell(raw, "email").toLowerCase();

    if (!name) errors.push("no name");
    if (!email) errors.push("no email");
    else if (!EMAIL_RE.test(email)) errors.push(`invalid email "${email}"`);

    const emailIsExternal = !!email && !email.endsWith(`@${companyDomain}`);
    if (emailIsExternal && errors.length === 0) {
      warnings.push(
        `non-company email — appears in the directory but can't sign in until they get a @${companyDomain} address`
      );
    }

    // Start date + derived tenure band.
    let startDate: Date | null = null;
    const startRaw = cell(raw, "startDate");
    if (startRaw && !BLANKS.has(startRaw.toLowerCase())) {
      const d = parseFlexibleDate(startRaw);
      startDate = d.value;
      if (d.status === "ambiguous")
        warnings.push(
          `hire date "${d.raw}" read day-first as ${niceDate(d.value!)} — verify`
        );
      else if (d.status === "unparseable")
        warnings.push(`hire date "${d.raw}" couldn't be read — left blank`);
    }
    const { band, note: bandNote } = deriveTenureBand(startDate, now);
    if (bandNote) warnings.push(bandNote);

    // Date of birth.
    let dateOfBirth: Date | null = null;
    const dobRaw = cell(raw, "dateOfBirth");
    if (dobRaw && !BLANKS.has(dobRaw.toLowerCase())) {
      const d = parseFlexibleDate(dobRaw);
      dateOfBirth = d.value;
      if (d.status === "ambiguous")
        warnings.push(
          `date of birth "${d.raw}" read day-first as ${niceDate(d.value!)} — verify`
        );
      else if (d.status === "unparseable")
        warnings.push(`date of birth "${d.raw}" couldn't be read — left blank`);
    }

    // Employment type.
    const et = normalizeEmploymentType(cell(raw, "employmentType"));
    if (et.unknown)
      warnings.push(
        `unrecognised contract type "${cell(raw, "employmentType")}" — left blank`
      );

    // Dependants — children (one per Kid (N) DOB column that parses) + an optional spouse.
    const dependants: ParsedDependant[] = [];
    const kidNameFor = (index: number): string | null => {
      const kn = kidNames.find((k) => k.index === index);
      return kn ? (raw[kn.col] ?? "").trim() || null : null;
    };
    for (const kid of kids) {
      const kidRaw = (raw[kid.col] ?? "").trim();
      if (!kidRaw || BLANKS.has(kidRaw.toLowerCase())) continue;
      const d = parseFlexibleDate(kidRaw);
      if (d.value) {
        dependants.push({ name: kidNameFor(kid.index), dateOfBirth: d.value, kind: "CHILD" });
        if (d.status === "ambiguous")
          warnings.push(
            `kid ${kid.index} DOB "${d.raw}" read day-first as ${niceDate(d.value)} — verify`
          );
      } else {
        warnings.push(`kid ${kid.index} DOB "${d.raw}" couldn't be read — skipped`);
      }
    }

    // Spouse — a dependant (kind SPOUSE) when a spouse date of birth is present (spec 023).
    const spouseNameRaw = cell(raw, "spouseName");
    const spouseDobRaw = cell(raw, "spouseDob");
    if (spouseDobRaw && !BLANKS.has(spouseDobRaw.toLowerCase())) {
      const sd = parseFlexibleDate(spouseDobRaw);
      if (sd.value) {
        dependants.push({ name: spouseNameRaw || null, dateOfBirth: sd.value, kind: "SPOUSE" });
        if (sd.status === "ambiguous")
          warnings.push(`spouse DOB "${sd.raw}" read day-first as ${niceDate(sd.value)} — verify`);
      } else {
        warnings.push(`spouse date of birth "${sd.raw}" couldn't be read — spouse skipped`);
      }
    } else if (spouseNameRaw && !BLANKS.has(spouseNameRaw.toLowerCase())) {
      warnings.push(`spouse "${spouseNameRaw}" has no date of birth — add it in the profile so medical can price them`);
    }

    const childrenCount = dependants.filter((d) => d.kind === "CHILD").length;
    const kidsCountRaw = cell(raw, "numberOfKids");
    const kidsCount = Number(kidsCountRaw);
    if (
      Number.isFinite(kidsCount) &&
      kidsCount > childrenCount &&
      !BLANKS.has(kidsCountRaw.toLowerCase())
    ) {
      warnings.push(
        `sheet says ${kidsCount} kid(s) but ${childrenCount} valid date(s) found — add the rest in the profile`
      );
    }

    // Phones — strict everywhere (2026-08-17 round 5): legacy formats are auto-normalized
    // ("+20 100 123 4567" → "+201001234567"); anything that doesn't confidently parse is a
    // row ERROR with a clear message, so a half-imported wrong number never lands silently.
    const readPhone = (key: "phone" | "emergencyContactPhone", label: string): string | null => {
      const rawValue = cell(raw, key);
      if (!rawValue || BLANKS.has(rawValue.toLowerCase())) return null;
      if (isValidStoredPhone(rawValue)) return rawValue;
      const normalized = normalizeLoosePhone(rawValue);
      if (normalized) {
        if (normalized !== rawValue)
          warnings.push(`${label} "${rawValue}" normalized to ${normalized}`);
        return normalized;
      }
      errors.push(
        `${label} "${rawValue}" isn't a valid number — use a country code + digits, no spaces (e.g. +201001234567)`
      );
      return null;
    };
    const phoneValue = readPhone("phone", "phone");
    const emergencyPhoneValue = readPhone("emergencyContactPhone", "emergency contact phone");

    // National ID — exactly 14 digits (separators stripped first, so "291-05…" still reads).
    let nationalIdValue: string | null | undefined =
      fields.nationalId === undefined ? undefined : null;
    const nationalIdRaw = cell(raw, "nationalId");
    if (nationalIdRaw && !BLANKS.has(nationalIdRaw.toLowerCase())) {
      const digits = nationalIdRaw.replace(/[\s.\-]/g, "");
      if (isValidNationalId(digits)) {
        nationalIdValue = digits;
        if (digits !== nationalIdRaw)
          warnings.push(`national ID "${nationalIdRaw}" normalized to ${digits}`);
      } else {
        errors.push(`national ID "${nationalIdRaw}" must be exactly 14 digits`);
      }
    }

    const managerEmailRaw = cell(raw, "managerEmail").toLowerCase();
    const managerEmail =
      managerEmailRaw && EMAIL_RE.test(managerEmailRaw) ? managerEmailRaw : null;
    if (fields.managerEmail !== undefined && managerEmailRaw && !managerEmail) {
      warnings.push(`manager reference "${managerEmailRaw}" isn't a valid email — skipped`);
    }

    // Department: imported as-is (tolerant), but flag values not in the managed list (spec 014).
    const departmentValue = cell(raw, "department") || null;
    if (
      departmentValue &&
      knownDepartments.size > 0 &&
      !knownDepartments.has(departmentValue.toLowerCase())
    ) {
      warnings.push(
        `department "${departmentValue}" isn't in the managed list — imported anyway; add it under Admin → Departments if it should be official`
      );
    }

    rows.push({
      rowNumber,
      name,
      email,
      emailIsExternal,
      phone: phoneValue,
      legalName: fields.legalName === undefined ? undefined : cell(raw, "legalName") || null,
      legalNameAr: fields.legalNameAr === undefined ? undefined : cell(raw, "legalNameAr") || null,
      nationalId: nationalIdValue,
      employeeId: cell(raw, "employeeId") || null,
      department: departmentValue,
      businessUnitName: cell(raw, "businessUnit") || null,
      title: cell(raw, "title") || null,
      employmentType: et.value,
      tenureBand: band,
      startDate,
      dateOfBirth,
      maritalStatus: normalizeMaritalStatus(cell(raw, "maritalStatus")),
      managerEmail,
      dependants,
      emergencyContactName: cell(raw, "emergencyContactName") || null,
      emergencyContactRelationship: cell(raw, "emergencyContactRelationship") || null,
      emergencyContactPhone: emergencyPhoneValue,
      warnings,
      errors,
    });
  }

  return { rows, headerErrors: [], companyDomain };
}
