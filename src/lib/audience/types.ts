/**
 * The vocabulary of "who does this reach" — shared by Learning and Communications.
 *
 * Seven fields. Five compile to audience RULES resolved live against the registry; two
 * (GROUP, PERSON) are direct assignments to a named group or person. A caller treats them the
 * same because to an operator they are the same question, and the difference is ours not theirs.
 *
 * ALL_ACTIVE is deliberately NOT a field. "Everyone" is its own control on whatever is choosing —
 * a course's visibility, a message's reach. Having it here as well is how a thing marked
 * "only certain people" quietly went to the whole company (the Learning defect, fixed 2026-08-22).
 */

export const AUDIENCE_FIELDS = [
  "DEPARTMENT",
  "BUSINESS_UNIT",
  "EMPLOYMENT_TYPE",
  "TENURE_BAND",
  "REPORTS_TO",
  "GROUP",
  "PERSON",
] as const;

export type AudienceField = (typeof AUDIENCE_FIELDS)[number];

/** The five that are RULES rather than named assignments. */
export const RULE_FIELDS: readonly AudienceField[] = [
  "DEPARTMENT",
  "BUSINESS_UNIT",
  "EMPLOYMENT_TYPE",
  "TENURE_BAND",
  "REPORTS_TO",
];

export function isRuleField(field: AudienceField): boolean {
  return RULE_FIELDS.includes(field);
}

/** One stored choice: which field, and which value of it. */
export type AudienceChoice = { field: AudienceField; value: string };

export const AUDIENCE_FIELD_LABEL: Record<AudienceField, string> = {
  DEPARTMENT: "Departments",
  GROUP: "Groups",
  PERSON: "Specific people",
  BUSINESS_UNIT: "Business units",
  TENURE_BAND: "Tenure",
  EMPLOYMENT_TYPE: "Employment type",
  REPORTS_TO: "A manager's team",
};

/** Said once, under each field's label — what it actually means. */
export const AUDIENCE_FIELD_HINT: Record<AudienceField, string> = {
  DEPARTMENT: "everyone in them, now and later",
  GROUP: "lists you made on Manage groups",
  PERSON: "named one by one",
  BUSINESS_UNIT: "the brand someone belongs to",
  TENURE_BAND: "how long they have been here — worked out from their start date, live",
  EMPLOYMENT_TYPE: "full-time or part-time",
  REPORTS_TO: "their direct reports, as the org chart stands today",
};

export const TENURE_BAND_LABEL: Record<string, string> = {
  BAND_6MO_2Y: "6 months – 2 years",
  BAND_2_4Y: "2 – 4 years",
  BAND_4_7Y: "4 – 7 years",
  BAND_7_10Y: "7 years and over",
};
