// Reading a Gallup CliftonStrengths report (spec 039).
//
// ONE rule reads both report formats with no format detection and no branching:
//
//   1. Extract text from PAGE 1 ONLY.
//   2. Keep lines matching `<rank>. <Theme name>` (an optional ® is stripped).
//   3. Resolve each name against the fixed 34-theme vocabulary; discard anything
//      that is not a real theme.
//   4. Order by rank and STOP AT THE FIRST GAP.
//
// Step 4 alone yields 5 themes from a Top 5 report and 34 from a CliftonStrengths
// 34 report. Validated against two real reports (2020 CliftonStrengths 34 and
// 2025 Top 5) in both Python and Node before this file was written.
//
// TRAPS THIS SURVIVES — each one observed in the real samples:
//
//   • The 34 report's page-1 list is interrupted by "STRENGTHEN" / "NAVIGATE"
//     headings between ranks 10 and 11. Non-matching lines are simply skipped.
//
//   • Page 2 of the Top 5 report carries the full 34-theme DOMAIN GRID
//     (Executing / Influencing / Relationship Building / Strategic Thinking). It
//     is unnumbered, so reading page 1 only AND requiring a rank number both
//     independently exclude it. Reading the whole document would silently turn a
//     Top 5 profile into a 34-theme one — PAGE 1 ONLY IS LOAD-BEARING.
//
//   • Theme names carry ® inconsistently (page 1 has it, page 2 does not).
//
//   • `Self-Assurance` is the one hyphenated theme; the name pattern must allow it.
//
// The footer carries `<NAME> | <MM-DD-YYYY>`. The date is worth storing and the
// name is worth SHOWING at confirmation — but never matching on: extraction
// kerning produced "ISLAM SA ADANY" in one sample.
//
// This never throws. A report we cannot read returns a failure so the operator
// lands in manual entry (FR-027) rather than hitting an error page.

/** The fixed vocabulary, keyed by lowercased name. Mirrors the seeded table. */
export const THEME_NAMES = [
  "Achiever", "Activator", "Adaptability", "Analytical", "Arranger", "Belief",
  "Command", "Communication", "Competition", "Connectedness", "Consistency",
  "Context", "Deliberative", "Developer", "Discipline", "Empathy", "Focus",
  "Futuristic", "Harmony", "Ideation", "Includer", "Individualization", "Input",
  "Intellection", "Learner", "Maximizer", "Positivity", "Relator",
  "Responsibility", "Restorative", "Self-Assurance", "Significance", "Strategic",
  "Woo",
] as const;

export type ThemeName = (typeof THEME_NAMES)[number];

/** Name → the stable code used as `StrengthsTheme.code`. */
export function themeCodeFor(name: string): string {
  return name.toUpperCase().replace(/-/g, "_");
}

const BY_LOWER_NAME = new Map<string, ThemeName>(
  THEME_NAMES.map((n) => [n.toLowerCase(), n])
);

/** A numbered rank line: "12. Arranger" / "3. Responsibility®". */
const RANK_LINE = /^\s*(\d{1,2})\.\s*([A-Za-z][A-Za-z\-' ]{2,24}?)\s*(?:®|®)?\s*$/;

/** Footer: "ISLAM SA ADANY | 11-13-2020" — MM-DD-YYYY, as Gallup prints it. */
const FOOTER = /^\s*(.+?)\s*\|\s*(\d{2})-(\d{2})-(\d{4})\s*$/;

/**
 * Some footers put the report's own title on the same line as the name:
 * "| CliftonStrengths® Top 5 NOR AN E SAM | 11-18-2025". Strip the known product
 * labels so the confirmation banner shows a name and not a product name. A
 * defined list, not a heuristic — a clever rule here would eventually eat part of
 * somebody's actual name.
 */
const FOOTER_LABELS =
  /\b(?:CliftonStrengths|StrengthsFinder|Signature\s+Themes|Top\s*\d{1,2}|Full\s*34)\b[®™]?/gi;

export type GallupParse =
  | {
      ok: true;
      /** Ordered theme names, rank 1..n. 5 for a Top 5 report, 34 for a full one. */
      themes: ThemeName[];
      /** As printed in the report. For a human to check — never matched on. */
      printedName: string | null;
      assessmentDate: Date | null;
      /** Non-fatal observations worth showing the operator. */
      warnings: string[];
    }
  | { ok: false; reason: string };

/**
 * Parse already-extracted page text. Kept separate from PDF handling so the rule
 * itself is pure and can be exercised against fixture text.
 *
 * @param pages Text per page, in order. Only the first is read for themes.
 */
export function parseGallupPages(pages: string[]): GallupParse {
  if (pages.length === 0) return { ok: false, reason: "The file has no readable pages." };

  const warnings: string[] = [];
  const byRank = new Map<number, ThemeName>();
  let unresolved = 0;

  for (const raw of (pages[0] ?? "").split("\n")) {
    const m = RANK_LINE.exec(raw);
    if (!m) continue;
    const rank = Number(m[1]);
    if (rank < 1 || rank > 34) continue;
    const name = BY_LOWER_NAME.get(m[2].trim().toLowerCase());
    if (!name) {
      // A numbered line that is not a theme is usually ordinary body copy
      // ("1. Read everything about your top CliftonStrengths."). Only count it
      // as unresolved if nothing has been found yet at that rank.
      if (!byRank.has(rank)) unresolved += 1;
      continue;
    }
    if (!byRank.has(rank)) byRank.set(rank, name);
  }

  const themes: ThemeName[] = [];
  for (let rank = 1; rank <= 34; rank++) {
    const name = byRank.get(rank);
    if (!name) break; // stop at the first gap — this is what sizes the profile
    themes.push(name);
  }

  if (themes.length === 0) {
    return {
      ok: false,
      reason:
        "No CliftonStrengths themes could be read from the first page. " +
        "This may not be a Gallup report, or it may be a scan with no text layer.",
    };
  }

  // A profile that stops at an odd length is worth flagging: the two shapes
  // Gallup issues are 5 and 34.
  if (themes.length !== 5 && themes.length !== 34) {
    warnings.push(
      `Read ${themes.length} themes in order, then the ranks stopped being consecutive. ` +
        `A Gallup report is normally 5 or 34 — check the order before confirming.`
    );
  }
  if (unresolved > 0 && themes.length < 34) {
    warnings.push(
      `${unresolved} numbered line(s) did not match a known theme and were skipped rather than guessed.`
    );
  }

  const footer = readFooter(pages);

  return {
    ok: true,
    themes,
    printedName: footer.name,
    assessmentDate: footer.date,
    warnings,
  };
}

function readFooter(pages: string[]): { name: string | null; date: Date | null } {
  // The footer repeats on every page after the first; page 2 is the reliable one.
  for (const page of pages.slice(0, 4)) {
    for (const raw of page.split("\n")) {
      const m = FOOTER.exec(raw);
      if (!m) continue;
      const [, rawName, mm, dd, yyyy] = m;
      // Kerning splits words in extracted text ("ISLAM SA ADANY"); collapse runs
      // of whitespace but otherwise leave it exactly as printed — this is shown
      // for a human to recognise, never matched against an employee record.
      const name = rawName
        .replace(FOOTER_LABELS, " ")
        .replace(/[|®™]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!name || name.length > 80) continue;
      const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
      return { name, date: Number.isNaN(date.getTime()) ? null : date };
    }
  }
  return { name: null, date: null };
}

/**
 * Read a Gallup PDF.
 *
 * Runs on the Node runtime only — `unpdf` is not an Edge-compatible dependency.
 * Never throws: an unreadable file is a result, not an exception, because manual
 * entry is the required fallback either way.
 */
export async function parseGallupReport(bytes: Uint8Array): Promise<GallupParse> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [text];
    return parseGallupPages(pages);
  } catch {
    return {
      ok: false,
      reason:
        "This file could not be read as a PDF. Enter the themes by hand instead — " +
        "nothing is lost.",
    };
  }
}
