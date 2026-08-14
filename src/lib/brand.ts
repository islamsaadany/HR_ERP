import { cache } from "react";
import { prisma } from "@/lib/prisma";

export type Brand = {
  companyName: string;
  shortName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
};

export const BRAND_DEFAULTS: Brand = {
  companyName: "Forefront People",
  shortName: "Forefront",
  logoUrl: null,
  primaryColor: "#0f2444", // navy-800
  accentColor: "#c9a227", // gold-500
};

// The original Forefront ramps — their tonal structure (per-step saturation +
// lightness) is reused when generating a custom brand ramp, so a company's colors
// inherit the same tasteful contrast profile, only re-hued.
const NAVY = ["#eceff5", "#d6deea", "#aebfd6", "#7d97ba", "#4f6d97", "#2f4d78", "#1f3a63", "#163055", "#0f2444", "#0a1a30", "#061021"];
const NAVY_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const NAVY_ANCHOR = 8; // 800 == the default primary base
const GOLD = ["#fbf7ea", "#f6ecca", "#ecd894", "#e0c05a", "#d4ac39", "#c9a227", "#a8821e", "#85641b", "#6f521c", "#5f461c"];
const GOLD_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
const GOLD_ANCHOR = 5; // 500 == the default accent base

type HSL = { h: number; s: number; l: number };

function hexToHsl(hex: string): HSL {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const int = m ? parseInt(m[1], 16) : 0;
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Per-step (saturation, lightness) profile of an original ramp. */
function profile(ramp: string[]) {
  return ramp.map(hexToHsl);
}
const NAVY_PROFILE = profile(NAVY);
const GOLD_PROFILE = profile(GOLD);

/**
 * Generate CSS-variable overrides for a ramp from one base color, reusing the
 * original ramp's saturation/lightness structure but with the base's hue+saturation.
 */
function rampVars(name: string, base: string, steps: number[], prof: HSL[], anchor: number): string {
  const { h, s } = hexToHsl(base);
  const anchorS = prof[anchor].s || 1;
  return steps
    .map((step, i) => {
      const stepS = Math.max(0, Math.min(100, (s * prof[i].s) / anchorS));
      const hex = hslToHex(h, stepS, prof[i].l);
      return `--color-${name}-${step}:${hex};`;
    })
    .join("");
}

/** Fetch the singleton brand row, falling back to Forefront defaults. Request-cached. */
export const getBrand = cache(async (): Promise<Brand> => {
  try {
    const row = await prisma.brandSettings.findFirst();
    if (row) {
      return {
        companyName: row.companyName,
        shortName: row.shortName,
        // The logo lives in a PRIVATE blob store, so it can't be an <img src>
        // directly — point every consumer at the public serving route instead.
        // The `?v=` (last segment of the stored URL, which carries the random
        // upload suffix) busts the browser cache when the logo is replaced.
        logoUrl: row.logoUrl
          ? `/api/brand/logo?v=${encodeURIComponent(row.logoUrl.split("/").pop() ?? "1")}`
          : null,
        primaryColor: row.primaryColor,
        accentColor: row.accentColor,
      };
    }
  } catch {
    /* table not migrated yet → defaults */
  }
  return { ...BRAND_DEFAULTS };
});

/**
 * Build the `:root{…}` CSS that re-themes the app for a brand. Returns "" when the
 * colors match the Forefront defaults (so the default look is byte-for-byte unchanged).
 */
export function brandThemeCss(primary: string, accent: string): string {
  const parts: string[] = [];
  if (primary.toLowerCase() !== BRAND_DEFAULTS.primaryColor) {
    parts.push(rampVars("navy", primary, NAVY_STEPS, NAVY_PROFILE, NAVY_ANCHOR));
  }
  if (accent.toLowerCase() !== BRAND_DEFAULTS.accentColor) {
    parts.push(rampVars("gold", accent, GOLD_STEPS, GOLD_PROFILE, GOLD_ANCHOR));
  }
  return parts.length ? `:root{${parts.join("")}}` : "";
}
