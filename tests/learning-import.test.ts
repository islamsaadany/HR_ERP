/**
 * Course workbook parsing — pure, no database, no file.
 *
 * The two behaviours worth protecting: a bad file is rejected WHOLE (a half-imported course is
 * worse than none, because you can't see what's missing), and EVERY fault is reported at once
 * rather than making the operator fix-and-retry one line at a time.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseCourseWorkbook, groupIntoSections } from "@/lib/learning/import";

const course = ["Client Engagement", "How we run engagements", "Consulting", ""];
const good = [
  ["Before", "Why scoping fails", "Yes", "8", "https://vimeo.com/948120774", "80", ""],
  ["Before", "Further reading", "No", "3", "", "", "Some **markdown**"],
  ["On site", "First workshop", "Yes", "15", "https://www.youtube.com/watch?v=abc", "", ""],
];

describe("a well-formed workbook", () => {
  const r = parseCourseWorkbook(course, good);
  test("parses", () => assert.equal(r.ok, true));
  test("keeps the course fields", () => {
    assert.ok(r.ok);
    assert.equal(r.course.title, "Client Engagement");
    assert.equal(r.course.category, "Consulting");
    assert.equal(r.course.renewAfterMonths, null);
  });
  test("classifies the video sources", () => {
    assert.ok(r.ok);
    assert.equal(r.course.lessons[0].videoSource, "VIMEO");
    assert.equal(r.course.lessons[2].videoSource, "YOUTUBE");
    assert.equal(r.course.lessons[1].videoSource, null);
  });
  test("Yes/No becomes required/optional", () => {
    assert.ok(r.ok);
    assert.deepEqual(r.course.lessons.map((l) => l.isRequired), [true, false, true]);
  });
  test("groups sections in first-appearance order", () => {
    assert.ok(r.ok);
    const s = groupIntoSections(r.course.lessons);
    assert.deepEqual(s.map((x) => x.title), ["Before", "On site"]);
    assert.deepEqual(s.map((x) => x.lessons.length), [2, 1]);
  });
  test("blank spacer rows are ignored", () => {
    const withGap = parseCourseWorkbook(course, [good[0], ["", "", "", "", "", "", ""], good[1]]);
    assert.ok(withGap.ok);
    assert.equal(withGap.course.lessons.length, 2);
  });
});

describe("every fault is reported at once, not just the first", () => {
  const r = parseCourseWorkbook(
    ["", "", "", "9"],
    [
      ["", "", "maybe", "eight", "notaurl", "150", ""],
      ["Before", "Dup", "Yes", "", "https://vimeo.com/1", "", ""],
      ["Before", "dup", "Yes", "", "https://vimeo.com/2", "", ""],
    ]
  );
  test("rejects", () => assert.equal(r.ok, false));
  test("catches all of them in one pass", () => {
    assert.ok(!r.ok);
    const all = r.problems.map((p) => p.message).join(" | ");
    assert.match(all, /title/i, "missing course title");
    assert.match(all, /Redo after/i, "invalid renewal period");
    assert.match(all, /Section is empty/i);
    assert.match(all, /Lesson is empty/i);
    assert.match(all, /Required should be Yes or No/i);
    assert.match(all, /Minutes should be a whole number/i);
    assert.match(all, /http/i, "bad video link");
    assert.match(all, /Must watch/i);
    assert.match(all, /appears twice/i, "duplicate lesson in a section");
    assert.ok(r.problems.length >= 8, `expected many problems, got ${r.problems.length}`);
  });
  test("names where each problem is", () => {
    assert.ok(!r.ok);
    assert.ok(r.problems.some((p) => p.where === "Course sheet"));
    assert.ok(r.problems.some((p) => /Lessons row 2/.test(p.where)));
  });
});

describe("rules that must survive the importer", () => {
  test("a watch requirement on a Google Drive video is refused (FR-031)", () => {
    const r = parseCourseWorkbook(course, [
      ["S", "L", "Yes", "", "https://drive.google.com/file/d/xyz/view", "80", ""],
    ]);
    assert.ok(!r.ok);
    assert.match(r.problems[0].message, /Google Drive/);
  });
  test("...but a Drive video with no requirement is fine", () => {
    const r = parseCourseWorkbook(course, [
      ["S", "L", "Yes", "", "https://drive.google.com/file/d/xyz/view", "", ""],
    ]);
    assert.equal(r.ok, true);
  });
  test("a watch % with no video is refused", () => {
    const r = parseCourseWorkbook(course, [["S", "L", "Yes", "", "", "80", "notes"]]);
    assert.ok(!r.ok);
    assert.match(r.problems.map((p) => p.message).join(" "), /no video link/i);
  });
  test("an empty lesson (no video, no notes) is refused", () => {
    const r = parseCourseWorkbook(course, [["S", "L", "Yes", "", "", "", ""]]);
    assert.ok(!r.ok);
    assert.match(r.problems.map((p) => p.message).join(" "), /video link, notes, or both/i);
  });
  test("a file with no lessons is refused", () => {
    const r = parseCourseWorkbook(course, []);
    assert.ok(!r.ok);
    assert.match(r.problems[0].message, /No lessons/i);
  });
  test("renewal accepts Never, blank, and the offered periods", () => {
    for (const v of ["", "Never", "12", "24"]) {
      assert.equal(parseCourseWorkbook(["T", "", "", v], good).ok, true, `"${v}" should be accepted`);
    }
    assert.equal(parseCourseWorkbook(["T", "", "", "7"], good).ok, false);
  });
});
