/**
 * Making text legible on a colour somebody else chose (spec 039, research D5).
 *
 * An operator picks their unit's brand colour in Admin → Brand. That colour then becomes the
 * header and the button of every email their people receive. The operator is choosing a BRAND, not
 * a background for text, and they must not have to think about contrast — a rule that requires
 * the operator to be careful is a rule that will be broken.
 *
 * THE RULE, and why the obvious one is wrong:
 *
 *   The obvious rule is a single luminance threshold picking black or white. It was written first
 *   and it FAILS: it puts white on a coral #E0653F (3.44:1) and white on a mid teal #2E8B84
 *   (4.08:1), both under the 4.5:1 that AA requires for small text.
 *
 *   Trying BOTH inks and taking whichever passes fixes five of six real brand colours, and leaves
 *   the brand completely untouched. Only a genuine mid-tone — one where neither black nor white
 *   works — needs the colour itself moved, and then by the smallest step that gets there.
 *
 *   An earlier variant always deepened toward black. It was rejected after being measured: it
 *   turned a pale gold #F2D65C into #837432, an olive nobody would recognise as their brand.
 *   Moving toward whichever end the colour is ALREADY closer to keeps it recognisable.
 *
 * Pure: no I/O, no Prisma, no environment. Tested directly in `tests/comms-brand.test.ts`.
 */

/** AA for text under 18px. Everything here exists to clear this number. */
export const MIN_CONTRAST = 4.5;

/** The two candidate inks. Near-black rather than pure black — pure #000 reads as a hole. */
export const DARK_INK = "#111A28";
export const LIGHT_INK = "#FFFFFF";

/** A safe fallback for a colour we cannot parse at all. The house navy. */
const FALLBACK = "#0F2444";

function toRgb(hex: string): [number, number, number] | null {
  let h = String(hex ?? "").trim().replace(/^#/, "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(rgb: [number, number, number]): string {
  return (
    "#" +
    rgb
      .map((v) => {
        const clamped = Math.max(0, Math.min(255, Math.round(v)));
        return clamped.toString(16).padStart(2, "0");
      })
      .join("")
      .toUpperCase()
  );
}

/** Relative luminance, WCAG 2.x. */
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast ratio between two colours, 1:1 to 21:1. Returns 1 for anything unparseable. */
export function contrast(a: string, b: string): number {
  const ra = toRgb(a);
  const rb = toRgb(b);
  if (!ra || !rb) return 1;
  const la = luminance(ra);
  const lb = luminance(rb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function mix(a: string, b: string, t: number): string {
  const ra = toRgb(a) ?? toRgb(FALLBACK)!;
  const rb = toRgb(b) ?? toRgb(FALLBACK)!;
  return toHex([0, 1, 2].map((i) => ra[i] * (1 - t) + rb[i] * t) as [number, number, number]);
}

export type BrandSurface = {
  /** The colour to actually paint. Equal to the input unless it had to be moved. */
  background: string;
  /** The colour to set text in on that background. */
  ink: string;
  /** The ratio achieved. Always >= MIN_CONTRAST for any parseable input. */
  ratio: number;
  /** How far the brand had to be moved, 0–1. Zero for most real brands. */
  moved: number;
};

/**
 * Given a brand colour, return a background and an ink that are legible together.
 *
 * The brand is returned UNCHANGED whenever either ink clears 4.5:1 — which is the common case, and
 * the reason this can be applied to a colour somebody chose for reasons that had nothing to do
 * with text.
 */
export function surfaceFor(brand: string): BrandSurface {
  // NORMALISED, not passed through. `#036` and `#003366` are the same colour and must produce the
  // same value — otherwise two records holding one brand in two notations compare unequal, and the
  // "was it left untouched?" question has no reliable answer.
  const parsed = toRgb(brand);
  const base = parsed ? toHex(parsed) : FALLBACK;

  const light = contrast(LIGHT_INK, base);
  const dark = contrast(DARK_INK, base);

  if (light >= MIN_CONTRAST) return { background: base, ink: LIGHT_INK, ratio: light, moved: 0 };
  if (dark >= MIN_CONTRAST) return { background: base, ink: DARK_INK, ratio: dark, moved: 0 };

  // Neither works: a genuine mid-tone. Move toward whichever end it is ALREADY closer to, so the
  // colour stays recognisable as itself — the whole reason the always-deepen variant was dropped.
  const goDarker = light > dark;
  const target = goDarker ? "#000000" : "#FFFFFF";
  const ink = goDarker ? LIGHT_INK : DARK_INK;

  for (let t = 0.02; t <= 0.9; t += 0.02) {
    const background = mix(base, target, t);
    const ratio = contrast(ink, background);
    if (ratio >= MIN_CONTRAST) return { background, ink, ratio, moved: t };
  }

  // Unreachable for any real colour — every hue clears 4.5:1 against one end well before 90%.
  // Kept so the function has no path that returns something illegible.
  const background = mix(base, target, 0.9);
  return { background, ink, ratio: contrast(ink, background), moved: 0.9 };
}

/**
 * A quieter version of the ink, for the small line above the unit name.
 *
 * Mixed toward the background rather than given its own colour, so it reads as second without
 * becoming a third colour to reason about — and it is checked, because "quieter" that drops below
 * 4.5:1 is just unreadable. Falls back to the full ink if the softened one does not clear.
 */
export function kickerInk(surface: BrandSurface): string {
  const softened = mix(surface.ink, surface.background, 0.22);
  return contrast(softened, surface.background) >= MIN_CONTRAST ? softened : surface.ink;
}
