/**
 * The field registry for data request campaigns (spec 033).
 *
 * A campaign can ask for any employee-answerable registry field: the four direct self-edit
 * fields (legal names, national ID, phone) PLUS everything the change-request registry
 * already defines (emergency contact, date of birth, marital status, dependants). This module
 * composes both into ONE list with a single shape — label, input, serialise, display, parse —
 * so the composer, the popup, the answer action, and the tracker all read the same source.
 *
 * Values here are ALWAYS the serialised text form (what forms submit and the tracker shows);
 * writing them to the record is the answer action's job.
 */

import {
  REQUESTABLE_FIELDS,
  type ParseResult,
  type RequestableField,
  type RequestableUser,
} from "@/lib/profile/requestable";
import {
  isValidNationalId,
  isValidStoredPhone,
  nationalNumberError,
  splitStoredPhone,
} from "@/lib/phone";
import type { User } from "@prisma/client";

/** What a campaign needs to read from the employee record to prefill its fields. */
export type CampaignUser = RequestableUser &
  Pick<User, "phone" | "legalName" | "legalNameAr" | "nationalId">;

export type CampaignField = {
  key: string;
  label: string;
  input: RequestableField["input"];
  options?: { value: string; label: string }[];
  /** "rtl" marks right-to-left values (the Arabic legal name). */
  dir?: "rtl";
  /** Short rule line shown under the input in the popup. */
  hint?: string;
  serialise: (user: CampaignUser) => string;
  display: (raw: string) => string;
  parse: (raw: string) => ParseResult;
};

const textDisplay = (raw: string) => (raw.trim() === "" ? "—" : raw.trim());

function strictPhoneParse(raw: string, label: string): ParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (!isValidStoredPhone(trimmed)) {
    const split = splitStoredPhone(trimmed);
    return {
      ok: false,
      error: split
        ? nationalNumberError(split.country, split.digits) ??
          `${label} isn't valid for its country code.`
        : `${label} needs a country code and digits only (no spaces).`,
    };
  }
  return { ok: true, value: trimmed };
}

/** All campaign-requestable fields, in the order the popup and composer show them. */
export const CAMPAIGN_FIELDS: CampaignField[] = [
  {
    key: "legalName",
    label: "Legal name (English)",
    input: "text",
    hint: "Your full official name in English, as on your passport or ID.",
    serialise: (u) => u.legalName ?? "",
    display: textDisplay,
    parse: (raw) => {
      const trimmed = raw.trim();
      if (trimmed.length > 120) return { ok: false, error: "Legal name (English) is too long (max 120)." };
      return { ok: true, value: trimmed === "" ? null : trimmed };
    },
  },
  {
    key: "legalNameAr",
    label: "Legal name (Arabic)",
    input: "text",
    dir: "rtl",
    hint: "Your full official name in Arabic, exactly as written on your national ID.",
    serialise: (u) => u.legalNameAr ?? "",
    display: textDisplay,
    parse: (raw) => {
      const trimmed = raw.trim();
      if (trimmed.length > 120) return { ok: false, error: "Legal name (Arabic) is too long (max 120)." };
      return { ok: true, value: trimmed === "" ? null : trimmed };
    },
  },
  {
    key: "nationalId",
    label: "National ID",
    input: "text",
    hint: "Exactly 14 digits, no spaces.",
    serialise: (u) => u.nationalId ?? "",
    display: textDisplay,
    parse: (raw) => {
      const trimmed = raw.trim();
      if (trimmed === "") return { ok: true, value: null };
      if (!isValidNationalId(trimmed)) {
        return { ok: false, error: "The national ID must be exactly 14 digits, with no spaces." };
      }
      return { ok: true, value: trimmed };
    },
  },
  {
    key: "phone",
    label: "Phone",
    input: "phone",
    serialise: (u) => u.phone ?? "",
    display: textDisplay,
    parse: (raw) => strictPhoneParse(raw, "Phone"),
  },
  // Everything the change-request registry defines is campaign-requestable as-is —
  // same labels, same inputs, same validation, same serialisation.
  ...REQUESTABLE_FIELDS.map<CampaignField>((f) => ({
    key: f.key,
    label: f.label,
    input: f.input,
    options: f.options,
    serialise: (u) => f.serialise(u),
    display: f.display,
    parse: f.parse,
  })),
];

const BY_KEY = new Map(CAMPAIGN_FIELDS.map((f) => [f.key, f]));

export function campaignField(key: string): CampaignField | null {
  return BY_KEY.get(key) ?? null;
}

export function campaignFieldLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

/** Validate + order a submitted key list against the registry (composer input). */
export function normalizeCampaignKeys(keys: string[]): string[] {
  const wanted = new Set(keys);
  return CAMPAIGN_FIELDS.filter((f) => wanted.has(f.key)).map((f) => f.key);
}

/** Registry entries as plain data for client components (functions can't cross the boundary). */
export type CampaignFieldDescriptor = {
  key: string;
  label: string;
  input: RequestableField["input"];
  options?: { value: string; label: string }[];
  dir?: "rtl";
  hint?: string;
  /** The record's current value in serialised form ("" = empty → fill; else → verify). */
  current: string;
};

export function campaignFieldDescriptors(
  user: CampaignUser,
  keys: string[]
): CampaignFieldDescriptor[] {
  return normalizeCampaignKeys(keys)
    .map((key) => BY_KEY.get(key)!)
    .map((f) => ({
      key: f.key,
      label: f.label,
      input: f.input,
      options: f.options,
      dir: f.dir,
      hint: f.hint,
      current: f.serialise(user),
    }));
}

/** The `User` select needed to serialise every campaign field. */
export const CAMPAIGN_USER_SELECT = {
  phone: true,
  legalName: true,
  legalNameAr: true,
  nationalId: true,
  emergencyContactName: true,
  emergencyContactRelationship: true,
  emergencyContactPhone: true,
  dateOfBirth: true,
  maritalStatus: true,
  dependants: {
    select: { name: true, dateOfBirth: true, kind: true },
    orderBy: { dateOfBirth: "asc" as const },
  },
} as const;
