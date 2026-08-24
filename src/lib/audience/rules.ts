import type { AudienceKind, EmploymentType, Prisma, TenureBand } from "@prisma/client";

/**
 * Audiences: routing rules compiled into ONE registry query.
 *
 * SHARED. Written for Learning (spec 038, research D2) and moved here on 2026-08-24 when
 * Communications (spec 039) needed to ask the same question. It is deliberately module-agnostic:
 * nothing below knows what a course is, or what an announcement is. `src/lib/learning/audience.ts`
 * re-exports it so Learning's behaviour is untouched.
 *
 * WHY IT IS SHARED RATHER THAN COPIED
 * This codebase has been bitten twice by one rule living in two places — the pool ceiling in three
 * copies, and "everyone" being expressible two ways so a RESTRICTED course reached the whole
 * company. A copy is how the second one is born. The constitution flags repetition at two uses;
 * Communications is the second.
 *
 * WHY THIS SHAPE
 * A thing is routed to "the Consulting department" or "everyone in their first two years" — and
 * that has to stay true as people join, move and leave, without anybody re-running anything. So a
 * row stores the RULE, never its expansion into member rows, and this module turns a set of rules
 * into a single `where` clause. One query answers "who does this reach" for the whole company; the
 * same clause answers "does it reach this person" with a userId added.
 *
 * Pure: no Prisma client, no I/O. `now` is injected so tenure maths is testable.
 */

/** The stored shape of one rule. `value` is interpreted per `kind`; null only for ALL_ACTIVE. */
export type AudienceRule = { kind: AudienceKind; value: string | null };

/**
 * The startDate window that corresponds to a tenure band, as of `now`.
 *
 * THIS IS THE POINT OF THE FUNCTION: `User.tenureBand` is a stored column, but the truth is
 * DERIVED from the hire date (`lib/tenure.ts` — "auto-calculated, not input"), so the column can be
 * stale for anyone who crossed a boundary since it was last written. Filtering an audience on it
 * would hand back a confidently wrong list. Filtering on a startDate RANGE is both the derived
 * truth and something SQL can express, which is what keeps the whole-company direction one query.
 *
 * Mirrors `deriveTenureBand` exactly, including the 365.25-day year and the top band absorbing
 * everyone past ten years. Someone under six months has no band and falls in no window — which is
 * correct: they are not in any tenure audience.
 *
 * MIND THE BOUNDARY DIRECTION. `deriveTenureBand` bands on `years >= a && years < b`, and a LONGER
 * tenure means an EARLIER hire date, so the comparison flips: `years >= a` is `hire <= ago(a)` and
 * `years < b` is `hire > ago(b)`. The window is therefore half-open at the OLD end (`gt`) and
 * closed at the RECENT end (`lte`) — the mirror image of how it reads in years. Getting this the
 * intuitive way round silently drops everyone sitting exactly on a boundary, which
 * `tests/learning-audience.test.ts` catches by sampling every month against `deriveTenureBand`.
 */
export function bandStartDateRange(
  band: TenureBand,
  now: Date = new Date()
): { gt?: Date; lte?: Date } {
  const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
  /** A hire date exactly `years` ago — a LONGER-serving employee's hire date is EARLIER than this. */
  const ago = (years: number) => new Date(now.getTime() - years * YEAR_MS);

  switch (band) {
    // 6 months – 2 years: hired at least 6 months ago (inclusive), less than 2 years ago.
    case "BAND_6MO_2Y":
      return { gt: ago(2), lte: ago(0.5) };
    case "BAND_2_4Y":
      return { gt: ago(4), lte: ago(2) };
    case "BAND_4_7Y":
      return { gt: ago(7), lte: ago(4) };
    // Top band absorbs everyone beyond 10 years, so it has no old-end bound.
    case "BAND_7_10Y":
      return { lte: ago(7) };
  }
}

/**
 * One rule → one `where` fragment, or null when the rule is unusable (a kind that needs a value
 * and hasn't got one). A null fragment is DROPPED rather than matching everything — a malformed
 * rule must never widen access.
 */
function ruleWhere(rule: AudienceRule, now: Date): Prisma.UserWhereInput | null {
  const value = rule.value?.trim();

  switch (rule.kind) {
    case "ALL_ACTIVE":
      // The ACTIVE filter is applied once by the caller below; this rule adds nothing else.
      return {};
    case "DEPARTMENT":
      // Note the absence of any null handling: `{ department: "Consulting" }` simply does not
      // match a row whose department is null. No audience kind here uses negation, which is what
      // makes "a person with a missing field matches nothing and errors on nothing" free (FR-016).
      return value ? { department: value } : null;
    case "BUSINESS_UNIT":
      return value ? { businessUnitId: value } : null;
    case "EMPLOYMENT_TYPE":
      return value === "FULL_TIME" || value === "PART_TIME"
        ? { employmentType: value as EmploymentType }
        : null;
    case "TENURE_BAND": {
      if (!isTenureBand(value)) return null;
      const range = bandStartDateRange(value, now);
      // A null startDate can't be in a range, so people with no hire date on file are excluded.
      return { startDate: range };
    }
    case "REPORTS_TO":
      // Direct reports only — not the whole subtree. A subtree audience is a later addition;
      // silently including it would surprise whoever set the rule.
      return value ? { reportsToId: value } : null;
  }
}

function isTenureBand(v: string | undefined): v is TenureBand {
  return (
    v === "BAND_6MO_2Y" || v === "BAND_2_4Y" || v === "BAND_4_7Y" || v === "BAND_7_10Y"
  );
}

/**
 * A course's audience rules → ONE `Prisma.UserWhereInput`.
 *
 * Rules UNION (OR), never intersect. "This is for Consulting and for the part-timers" means both
 * groups, not the handful of people in both — an intersection is expressible as an ad-hoc group
 * when it is genuinely wanted.
 *
 * Returns null when no rule is usable, which callers MUST treat as "reaches nobody". Returning an
 * empty `where` there would match the entire company, turning a broken rule into a company-wide
 * disclosure — the one failure mode this function must not have.
 */
export function audienceWhere(
  rules: AudienceRule[],
  now: Date = new Date()
): Prisma.UserWhereInput | null {
  const fragments = rules
    .map((r) => ruleWhere(r, now))
    .filter((f): f is Prisma.UserWhereInput => f !== null);

  if (fragments.length === 0) return null;

  // Leavers are never in an audience (FR-017), and this is the single place that is applied.
  const active: Prisma.UserWhereInput = { status: "ACTIVE" };

  // An ALL_ACTIVE rule contributes `{}`; if one is present it subsumes every other fragment, so
  // collapse to the plain active filter rather than OR-ing a match-everything term with the rest.
  if (fragments.some((f) => Object.keys(f).length === 0)) return active;

  return { AND: [active, { OR: fragments }] };
}

/** Whether a set of rules reaches anybody at all — the honest reading of a null `where`. */
export function reachesNobody(rules: AudienceRule[], now: Date = new Date()): boolean {
  return audienceWhere(rules, now) === null;
}

// ─── The same rule, in memory ───────────────────────────────────────────
//
// READ THIS BEFORE EDITING EITHER FORM.
//
// The rule above is expressed as SQL because the per-course direction ("who does this reach")
// must be one query regardless of headcount. The per-person direction ("which courses does this
// employee hold") needs the same rule applied to ONE already-loaded employee across many courses —
// and issuing a query per course to answer it would be absurd.
//
// So the rule has two encodings. That is the exact hazard this module otherwise exists to avoid,
// and it is accepted here only because both live in this file, both switch on the same `kind`, and
// `tests/learning-audience.test.ts` cross-checks them: for a fixed set of employees the predicate
// must select precisely the set the `where` clause selects. If you change one arm of either
// switch, change the other and run that test — a divergence here is an access-control bug, not a
// tidiness issue.

/** The employee fields the rules read. Exactly the columns `ruleWhere` filters on. */
export type AudienceSubject = {
  status: "ACTIVE" | "LEFT";
  department: string | null;
  businessUnitId: string | null;
  employmentType: EmploymentType | null;
  tenureBand: TenureBand | null; // present for shape parity only — never read (see below)
  startDate: Date | null;
  reportsToId: string | null;
};

/** In-memory twin of `ruleWhere`. Same switch, same arms, same omissions. */
function subjectMatchesRule(
  subject: AudienceSubject,
  rule: AudienceRule,
  now: Date
): boolean {
  const value = rule.value?.trim();

  switch (rule.kind) {
    case "ALL_ACTIVE":
      return true;
    case "DEPARTMENT":
      return !!value && subject.department === value;
    case "BUSINESS_UNIT":
      return !!value && subject.businessUnitId === value;
    case "EMPLOYMENT_TYPE":
      return (
        (value === "FULL_TIME" || value === "PART_TIME") && subject.employmentType === value
      );
    case "TENURE_BAND": {
      if (!isTenureBand(value)) return false;
      // Derived from startDate, NOT from subject.tenureBand — same reason as the SQL form: the
      // stored column can be stale for anyone who crossed a boundary since it was last written.
      if (!subject.startDate) return false;
      const { gt, lte } = bandStartDateRange(value, now);
      const t = subject.startDate.getTime();
      if (gt && t <= gt.getTime()) return false;
      if (lte && t > lte.getTime()) return false;
      return true;
    }
    case "REPORTS_TO":
      return !!value && subject.reportsToId === value;
  }
}

/**
 * Does this employee match ANY of a course's audience rules? Union semantics and the ACTIVE gate,
 * matching `audienceWhere` exactly.
 */
export function subjectMatchesAudience(
  subject: AudienceSubject,
  rules: AudienceRule[],
  now: Date = new Date()
): boolean {
  if (subject.status !== "ACTIVE") return false;
  return rules.some((rule) => subjectMatchesRule(subject, rule, now));
}
