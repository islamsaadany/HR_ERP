/**
 * The contrast rule — pure, no database.
 *
 * What is protected here is a promise made to whoever picks a brand colour: they choose a colour
 * for brand reasons, and text on it is legible without them having to think about it.
 *
 * The table below is the SIX MEASURED COLOURS from research D5, including the two real ones
 * (Forefront navy, Visual Shift purple). The properties after it matter more than the table: a
 * table only proves the cases somebody thought of, and the failure this guards against is a colour
 * nobody anticipated.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  contrast,
  kickerInk,
  surfaceFor,
  DARK_INK,
  LIGHT_INK,
  MIN_CONTRAST,
} from "@/lib/comms/brand";

describe("surfaceFor — the six measured colours", () => {
  const cases: Array<[string, string, string, boolean]> = [
    // brand,      what it is,            expected ink, expected to be left alone
    ["#0f2444", "Forefront navy", LIGHT_INK, true],
    ["#450059", "Visual Shift purple", LIGHT_INK, true],
    ["#E0653F", "a coral", DARK_INK, true],
    ["#F2D65C", "a pale gold", DARK_INK, true],
    ["#8A94A6", "a mid grey", DARK_INK, true],
    ["#2E8B84", "a mid teal", DARK_INK, false],
  ];

  for (const [brand, what, ink, untouched] of cases) {
    test(`${what} (${brand})`, () => {
      const s = surfaceFor(brand);
      assert.equal(s.ink, ink, "wrong ink chosen");
      assert.ok(s.ratio >= MIN_CONTRAST, `${s.ratio.toFixed(2)}:1 is below AA`);
      if (untouched) {
        assert.equal(
          s.background.toUpperCase(),
          brand.toUpperCase(),
          "the brand should have been left exactly as it was"
        );
        assert.equal(s.moved, 0);
      } else {
        assert.ok(s.moved > 0, "a mid-tone must be moved");
        assert.ok(s.moved <= 0.1, `moved ${Math.round(s.moved * 100)}% — that is visible`);
      }
    });
  }
});

describe("the promise, on colours nobody thought of", () => {
  /** A deterministic spread across the whole cube — no Math.random, so a failure reproduces. */
  function sweep(): string[] {
    const out: string[] = [];
    for (let r = 0; r < 256; r += 37) {
      for (let g = 0; g < 256; g += 41) {
        for (let b = 0; b < 256; b += 43) {
          out.push(
            "#" +
              [r, g, b].map((v) => Math.min(255, v).toString(16).padStart(2, "0")).join("")
          );
        }
      }
    }
    return out;
  }

  test("every colour in a 336-point sweep comes back legible", () => {
    const failures = sweep()
      .map((c) => ({ c, s: surfaceFor(c) }))
      .filter(({ s }) => s.ratio < MIN_CONTRAST);
    assert.deepEqual(failures, [], "these colours produced unreadable text");
  });

  test("no colour is moved more than 20% — a brand must stay recognisable", () => {
    const mangled = sweep()
      .map((c) => ({ c, moved: surfaceFor(c).moved }))
      .filter(({ moved }) => moved > 0.2);
    assert.deepEqual(mangled, [], "these colours were distorted beyond recognition");
  });

  test("most colours are not touched at all", () => {
    const all = sweep();
    const untouched = all.filter((c) => surfaceFor(c).moved === 0).length;
    // Measured at 100% on this sweep; asserted loosely so a small rule change is not a red test,
    // but a regression to the naive threshold (which mangles far more) would fail here.
    assert.ok(
      untouched / all.length > 0.85,
      `only ${Math.round((untouched / all.length) * 100)}% left alone`
    );
  });
});

describe("the naive rule, kept as a warning", () => {
  test("a single luminance threshold would fail on the coral and the teal", () => {
    // This is what the first draft did. Recorded as a test so nobody reintroduces it believing
    // it is equivalent.
    for (const brand of ["#E0653F", "#2E8B84"]) {
      assert.ok(
        contrast(LIGHT_INK, brand) < MIN_CONTRAST,
        `white on ${brand} would have passed — the warning is stale`
      );
      assert.ok(surfaceFor(brand).ratio >= MIN_CONTRAST, "but the real rule handles it");
    }
  });
});

describe("edge cases", () => {
  test("a 3-digit hex works", () => {
    assert.equal(surfaceFor("#036").background, surfaceFor("#003366").background);
  });

  test("nonsense falls back to the house navy rather than throwing", () => {
    for (const junk of ["", "not-a-colour", "#12", "rgb(1,2,3)", "#GGGGGG"]) {
      const s = surfaceFor(junk);
      assert.ok(s.ratio >= MIN_CONTRAST, `${junk} produced something illegible`);
    }
  });

  test("pure white and pure black both work", () => {
    assert.equal(surfaceFor("#FFFFFF").ink, DARK_INK);
    assert.equal(surfaceFor("#000000").ink, LIGHT_INK);
  });

  test("the kicker stays legible, or gives up and uses the full ink", () => {
    for (const brand of ["#0f2444", "#450059", "#E0653F", "#F2D65C", "#2E8B84"]) {
      const s = surfaceFor(brand);
      assert.ok(
        contrast(kickerInk(s), s.background) >= MIN_CONTRAST,
        `the kicker on ${brand} is unreadable`
      );
    }
  });
});
