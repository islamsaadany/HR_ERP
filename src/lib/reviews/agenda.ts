// THE review agenda (spec 040). One registry, the way `campaign-fields.ts` is the
// one registry of employee-answerable fields.
//
// The questions are the supplied PERFORMANCE REVIEW AGENDA verbatim, with one
// change agreed in the spec: "this year" becomes "this period", because cycles
// are quarterly (FR-010).
//
// WHY THIS IS CODE AND NOT A TABLE
//   Nothing about the agenda is editable at runtime. This module has no operator
//   (FR-002), so an admin-editable question table would be a screen nobody is
//   allowed to have — and a second place for the wording to drift.
//
// WHO AUTHORS WHAT
//   The sheet has two halves. Most questions are the employee reflecting; two
//   sections are addressed TO the other party, so the manager answers a mirrored
//   copy. `askedOf` says which half writes a given question.

export type AgendaSectionKey =
  | "went-well"
  | "didnt-go-well"
  | "key-learnings"
  | "mutual-expectations"
  | "forward-expectations"
  | "alignment";

export type AgendaHalf = "employee" | "manager" | "both";

export type AgendaQuestion = {
  key: string;
  prompt: string;
  /** Which half writes this. "both" means each party answers their own copy. */
  askedOf: AgendaHalf;
  /** Picks from the author's own CliftonStrengths profile instead of free text. */
  strengths?: boolean;
  /** Shown under the prompt when the question needs framing. */
  hint?: string;
};

export type AgendaSection = {
  key: AgendaSectionKey;
  title: string;
  /** "1. Reflections" / "2. Forward-Looking Expectations" in the source template. */
  part: "reflections" | "forward";
  questions: AgendaQuestion[];
};

export const AGENDA: readonly AgendaSection[] = [
  {
    key: "went-well",
    title: "What went well",
    part: "reflections",
    questions: [
      {
        key: "proud-of",
        prompt: "What achievements are you most proud of this period?",
        askedOf: "employee",
      },
      {
        key: "most-value",
        prompt: "Where do you think you created the most value?",
        askedOf: "employee",
      },
      {
        key: "strengths-relied-on",
        prompt: "What strengths did you rely on most?",
        askedOf: "employee",
        strengths: true,
        hint: "Your own CliftonStrengths themes.",
      },
    ],
  },
  {
    key: "didnt-go-well",
    title: "What didn't go well",
    part: "reflections",
    questions: [
      {
        key: "not-as-expected",
        prompt: "What didn't work as expected?",
        askedOf: "employee",
      },
      {
        key: "struggled-blocked",
        prompt: "Where did you struggle or feel blocked?",
        askedOf: "employee",
      },
      {
        key: "strengths-misused",
        prompt: "What strengths did you misutilise?",
        askedOf: "employee",
        strengths: true,
        hint: "You can only misuse a strength you have — your own themes again.",
      },
    ],
  },
  {
    key: "key-learnings",
    title: "Key learnings",
    part: "reflections",
    questions: [
      {
        key: "lessons",
        prompt: "Your top 2–3 lessons from this period.",
        askedOf: "employee",
      },
      {
        key: "developed",
        prompt: "Skills, behaviours or mindsets you developed.",
        askedOf: "employee",
      },
      {
        key: "carry-forward",
        prompt: "One lesson you want to intentionally carry forward.",
        askedOf: "employee",
      },
    ],
  },
  {
    key: "mutual-expectations",
    title: "Mutual expectations review",
    part: "reflections",
    questions: [
      {
        key: "expected-happened",
        prompt: "What you expected from me and did happen.",
        askedOf: "both",
      },
      {
        key: "expected-didnt-happen",
        prompt: "What you expected from me and did not happen.",
        askedOf: "both",
      },
    ],
  },
  {
    key: "forward-expectations",
    title: "What you expect from the other party",
    part: "forward",
    questions: [
      {
        key: "support-needed",
        prompt: "What support do you need more of?",
        askedOf: "both",
      },
      {
        key: "do-differently",
        prompt: "What should I do differently?",
        askedOf: "both",
      },
      {
        key: "continue-doing",
        prompt: "What should I continue doing?",
        askedOf: "both",
      },
    ],
  },
  {
    key: "alignment",
    title: "Alignment & commitments",
    part: "forward",
    questions: [
      {
        key: "top-priorities",
        prompt: "Top 3 priorities for the next period.",
        askedOf: "both",
      },
      {
        key: "risks",
        prompt: "Key risks or concerns to watch.",
        askedOf: "both",
      },
      {
        key: "success-looks-like",
        prompt: "What would make the next review feel like a success?",
        askedOf: "both",
      },
    ],
  },
] as const;

const BY_KEY: ReadonlyMap<string, { section: AgendaSection; question: AgendaQuestion }> =
  new Map(
    AGENDA.flatMap((section) =>
      section.questions.map((question) => [question.key, { section, question }] as const)
    )
  );

export function findQuestion(key: string) {
  return BY_KEY.get(key) ?? null;
}

/** A question key is only valid if it is in this registry — never trusted from a form. */
export function isAgendaQuestion(key: string): boolean {
  return BY_KEY.has(key);
}

/** The questions one half of the sheet is asked to answer. */
export function questionsFor(half: "employee" | "manager"): AgendaQuestion[] {
  return AGENDA.flatMap((s) =>
    s.questions.filter((q) => q.askedOf === "both" || q.askedOf === half)
  );
}

export function sectionsFor(half: "employee" | "manager"): AgendaSection[] {
  return AGENDA.map((s) => ({
    ...s,
    questions: s.questions.filter((q) => q.askedOf === "both" || q.askedOf === half),
  })).filter((s) => s.questions.length > 0);
}

export function isStrengthsQuestion(key: string): boolean {
  return BY_KEY.get(key)?.question.strengths === true;
}

/** Journal sections map onto agenda sections so a promoted entry lands sensibly. */
export const JOURNAL_SECTION_LABEL: Record<string, string> = {
  WENT_WELL: "Went well",
  DIDNT_GO_WELL: "Didn't go well",
  LEARNING: "Learning",
  BLOCKER: "Blocker",
  EXPECTATION: "Expectation",
};
