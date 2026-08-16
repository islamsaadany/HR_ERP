/**
 * The registry of fields an employee may ask HR to correct (spec 029).
 *
 * One place defines, per field: its label, its input type, how the current record value
 * serialises to text, how a submitted string parses back to a typed column value, and which
 * `User` column an approval writes. Everything else — the request form, the comparison HR
 * reads, and the approval write — is driven off this list, so adding a requestable field later
 * is an entry here rather than a schema change and three edited screens.
 *
 * Phone is deliberately NOT here: it is the employee's own contact number, nothing reads it for
 * eligibility or money, and they edit it directly (FR-002a). Job, employment and compensation
 * fields are out of scope by spec — correcting those is a conversation, not a form.
 */

import { MARITAL_STATUS_LABEL } from "@/lib/labels";
import type { MaritalStatus, User } from "@prisma/client";

/** The subset of the employee record this feature can propose changes to. */
export type RequestableUser = Pick<
  User,
  | "emergencyContactName"
  | "emergencyContactRelationship"
  | "emergencyContactPhone"
  | "dateOfBirth"
  | "maritalStatus"
>;

export type RequestableKey = keyof RequestableUser;

export type ParseResult =
  | { ok: true; value: string | Date | MaritalStatus | null }
  | { ok: false; error: string };

export type RequestableField = {
  key: RequestableKey;
  label: string;
  /** Which card the field sits under on My Profile — used to group the form. */
  group: "Emergency contact" | "Personal";
  input: "text" | "tel" | "date" | "select";
  /** Options for `select`, in display order. */
  options?: { value: string; label: string }[];
  /**
   * The record's current value as the text the form submits. Must round-trip with `parse`,
   * because "did anything actually change?" is decided by comparing these two strings.
   */
  serialise: (user: RequestableUser) => string;
  /** How the stored text reads to a person (HR's comparison, the employee's status list). */
  display: (raw: string) => string;
  /** Turn submitted text into the value written to the column, or explain why it can't be. */
  parse: (raw: string) => ParseResult;
};

const MARITAL_VALUES: MaritalStatus[] = ["SINGLE", "MARRIED", "DIVORCED", "WIDOWED"];

/** A free-text field. Empty means "clear it", which is a legitimate correction. */
function textField(
  key: RequestableKey,
  label: string,
  group: RequestableField["group"],
  input: "text" | "tel" = "text"
): RequestableField {
  return {
    key,
    label,
    group,
    input,
    serialise: (user) => {
      const v = user[key];
      return typeof v === "string" ? v : "";
    },
    display: (raw) => (raw.trim() === "" ? "—" : raw.trim()),
    parse: (raw) => {
      const trimmed = raw.trim();
      if (trimmed.length > 120) return { ok: false, error: `${label} is too long (max 120).` };
      return { ok: true, value: trimmed === "" ? null : trimmed };
    },
  };
}

export const REQUESTABLE_FIELDS: RequestableField[] = [
  textField("emergencyContactName", "Emergency contact name", "Emergency contact"),
  textField("emergencyContactRelationship", "Relationship", "Emergency contact"),
  textField("emergencyContactPhone", "Emergency contact phone", "Emergency contact", "tel"),
  {
    key: "dateOfBirth",
    label: "Date of birth",
    group: "Personal",
    input: "date",
    // Read in UTC to match how the column is written elsewhere; a local-time read would shift the
    // date by a day for anyone east or west of UTC and make an unchanged field look edited.
    serialise: (user) => (user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : ""),
    display: (raw) => {
      const d = parseIsoDate(raw);
      return d
        ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
        : "—";
    },
    parse: (raw) => {
      const trimmed = raw.trim();
      if (trimmed === "") return { ok: true, value: null };
      const d = parseIsoDate(trimmed);
      if (!d) return { ok: false, error: "Date of birth is not a valid date." };
      // A future birth date is a typo, not a correction; storing it would price medical off it.
      if (d.getTime() > Date.now()) return { ok: false, error: "Date of birth cannot be in the future." };
      return { ok: true, value: d };
    },
  },
  {
    key: "maritalStatus",
    label: "Marital status",
    group: "Personal",
    input: "select",
    options: [
      { value: "", label: "—" },
      ...MARITAL_VALUES.map((v) => ({ value: v, label: MARITAL_STATUS_LABEL[v] })),
    ],
    serialise: (user) => user.maritalStatus ?? "",
    display: (raw) =>
      MARITAL_VALUES.includes(raw as MaritalStatus) ? MARITAL_STATUS_LABEL[raw as MaritalStatus] : "—",
    parse: (raw) => {
      const trimmed = raw.trim();
      if (trimmed === "") return { ok: true, value: null };
      if (!MARITAL_VALUES.includes(trimmed as MaritalStatus)) {
        return { ok: false, error: "Marital status is not a recognised option." };
      }
      return { ok: true, value: trimmed as MaritalStatus };
    },
  },
];

const BY_KEY = new Map(REQUESTABLE_FIELDS.map((f) => [f.key as string, f]));

/** The registry entry for a stored field key, or null if the key is unknown (or retired). */
export function requestableField(key: string): RequestableField | null {
  return BY_KEY.get(key) ?? null;
}

/** A field's label, falling back to the raw key so a retired field never renders as blank. */
export function fieldLabel(key: string): string {
  return requestableField(key)?.label ?? key;
}

/** A stored value as a person reads it, safe for any key including retired ones. */
export function displayValue(key: string, raw: string): string {
  const field = requestableField(key);
  return field ? field.display(raw) : raw.trim() === "" ? "—" : raw;
}

/** The record's current value for a field, as the text a proposal is compared against. */
export function currentValue(key: string, user: RequestableUser): string {
  return requestableField(key)?.serialise(user) ?? "";
}

/**
 * Parse `yyyy-mm-dd` as a UTC midnight date. Deliberately not `new Date(raw)` alone: that reads a
 * bare date as UTC but a malformed one as Invalid Date silently, and we want both the strict
 * shape check and the UTC anchoring that keeps a date of birth from drifting a day.
 */
function parseIsoDate(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Rejects 2026-02-31, which the Date constructor would roll forward into March.
  if (d.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}`) return null;
  return d;
}
