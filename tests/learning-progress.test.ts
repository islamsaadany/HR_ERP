/**
 * Course progress — pure, no database.
 *
 * The rule these protect is FR-023: progress is keyed by LESSON IDENTITY, never by position. HR
 * reorders and renames curricula routinely; if any of that could move a learner's percentage, the
 * training record silently stops meaning anything. Lifted with the module from FFLMS and extended
 * with the reorder cases this platform cares about.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computeProgressPercent,
  firstIncompleteLessonId,
  isCourseComplete,
  type LessonRef,
} from "@/lib/learning/progress";

const req = (id: string): LessonRef => ({ id, isRequired: true });
const opt = (id: string): LessonRef => ({ id, isRequired: false });

describe("computeProgressPercent — required lessons are the denominator", () => {
  test("counts only required lessons", () => {
    const lessons = [req("a"), req("b"), req("c"), opt("x"), opt("y")];
    assert.equal(computeProgressPercent(lessons, ["a", "b", "c"]), 100);
  });

  test("completing an optional lesson does not move the figure", () => {
    const lessons = [req("a"), req("b"), opt("x")];
    assert.equal(computeProgressPercent(lessons, ["a"]), 50);
    assert.equal(computeProgressPercent(lessons, ["a", "x"]), 50);
  });

  test("a course with no required lessons reads as complete (FR-022)", () => {
    assert.equal(computeProgressPercent([opt("x"), opt("y")], []), 100);
  });

  test("an empty curriculum reads as complete rather than dividing by zero", () => {
    assert.equal(computeProgressPercent([], []), 100);
  });

  test("completions for lessons no longer in the curriculum are ignored", () => {
    // A required lesson was soft-deleted; the caller stops passing it in. The learner's other
    // completions must survive, and the percentage recomputes over what remains.
    assert.equal(computeProgressPercent([req("a"), req("b")], ["a", "b", "deleted"]), 100);
  });
});

describe("FR-023 — a curriculum edit cannot move anyone's percentage", () => {
  const before = [req("intro"), req("scoping"), req("workshop"), opt("reading")];
  const completed = ["intro", "workshop"];

  test("reordering changes nothing", () => {
    const reordered = [req("workshop"), opt("reading"), req("intro"), req("scoping")];
    assert.equal(
      computeProgressPercent(reordered, completed),
      computeProgressPercent(before, completed)
    );
  });

  test("adding an OPTIONAL lesson changes nothing", () => {
    const grown = [...before, opt("extra")];
    assert.equal(computeProgressPercent(grown, completed), computeProgressPercent(before, completed));
  });

  test("adding a REQUIRED lesson does lower it — which is why FR-039 asks first", () => {
    const grown = [...before, req("newly-required")];
    assert.equal(computeProgressPercent(before, completed), 67);
    assert.equal(computeProgressPercent(grown, completed), 50);
  });

  test("removing an unfinished required lesson can complete the course", () => {
    // Defensible and deliberate: the obligation genuinely no longer exists.
    assert.equal(computeProgressPercent([req("intro"), req("workshop")], completed), 100);
  });
});

describe("firstIncompleteLessonId — the resume point (FR-024)", () => {
  const lessons = [req("a"), opt("b"), req("c")];

  test("returns the first lesson not yet done, in curriculum order", () => {
    assert.equal(firstIncompleteLessonId(lessons, ["a"]), "b");
  });

  test("walks through optional lessons too rather than skipping them", () => {
    assert.equal(firstIncompleteLessonId(lessons, []), "a");
    assert.equal(firstIncompleteLessonId(lessons, ["a", "b"]), "c");
  });

  test("null when everything is done", () => {
    assert.equal(firstIncompleteLessonId(lessons, ["a", "b", "c"]), null);
  });
});

describe("isCourseComplete", () => {
  test("true at the threshold, false below it", () => {
    const lessons = [req("a"), req("b")];
    assert.equal(isCourseComplete(lessons, ["a"], 100), false);
    assert.equal(isCourseComplete(lessons, ["a", "b"], 100), true);
  });
});
