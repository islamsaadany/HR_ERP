/**
 * Learning's audience rules — now a re-export.
 *
 * The derivation moved to `src/lib/audience/rules.ts` on 2026-08-24, when Communications
 * (spec 039) needed to ask the same question: who does this reach? Copying it would have been the
 * third time one rule lived in two places in this codebase, and the previous two both ended with
 * the looser copy quietly deciding.
 *
 * NOTHING IN LEARNING CHANGES. This file keeps its name and its exports, so every import across
 * the module still resolves and still gets the same behaviour — verified by re-running the
 * existing course-access checks against a real database after the move.
 */
export {
  bandStartDateRange,
  audienceWhere,
  reachesNobody,
  subjectMatchesAudience,
  type AudienceRule,
  type AudienceSubject,
} from "@/lib/audience/rules";
