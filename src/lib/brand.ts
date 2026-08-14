import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { readImpersonationCookie } from "@/lib/impersonation";
import { getBusinessUnitBrand } from "@/lib/business-units";

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

// How much the ramp may be LIGHTENED (in lightness %) to honor a light base color.
// Lets the picked color actually drive the surfaces, while keeping the darkest step
// dark enough that white text on the sidebar/buttons stays readable. Darkening
// (a darker pick) is unbounded.
const MAX_RAMP_LIFT = 22;

/**
 * Generate CSS-variable overrides for a ramp from one base color. The ramp reuses
 * the original ramp's per-step saturation/lightness STRUCTURE but is re-anchored on
 * the base color's own hue, saturation, AND lightness — so the anchor step becomes
 * ~ the picked color and the whole scale (incl. the sidebar) visibly reflects it,
 * instead of only shifting hue while keeping every shade's original darkness.
 */
function rampVars(name: string, base: string, steps: number[], prof: HSL[], anchor: number): string {
  const { h, s, l } = hexToHsl(base);
  const anchorS = prof[anchor].s || 1;
  // Shift every step's lightness by the gap between the base and the anchor, so the
  // anchor step lands on the base's lightness. Capped on the lightening side only.
  const rawOffset = l - prof[anchor].l;
  const offset = rawOffset > MAX_RAMP_LIFT ? MAX_RAMP_LIFT : rawOffset;
  return steps
    .map((step, i) => {
      const stepS = Math.max(0, Math.min(100, (s * prof[i].s) / anchorS));
      const stepL = Math.max(0, Math.min(100, prof[i].l + offset));
      const hex = hslToHex(h, stepS, stepL);
      return `--color-${name}-${step}:${hex};`;
    })
    .join("");
}

/** The deployment default brand (singleton row → Forefront defaults). Request-cached. */
const getDefaultBrand = cache(async (): Promise<Brand> => {
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
 * The business unit id of the effective (viewing) user, honoring impersonation —
 * a Super User "viewing as" a non-Super employee resolves to that employee's unit
 * (spec 024 · FR-008). Returns null when signed out (no query → pre-auth safe) or
 * when the user has no business unit.
 */
async function effectiveBusinessUnitId(): Promise<string | null> {
  const session = await auth();
  const real = session?.user;
  if (!real?.id) return null;

  if (real.role === "SUPER_USER") {
    const targetId = await readImpersonationCookie();
    if (targetId && targetId !== real.id) {
      const target = await prisma.user.findUnique({
        where: { id: targetId },
        select: { role: true, businessUnitId: true },
      });
      if (target && target.role !== "SUPER_USER") return target.businessUnitId ?? null;
    }
  }
  const me = await prisma.user.findUnique({
    where: { id: real.id },
    select: { businessUnitId: true },
  });
  return me?.businessUnitId ?? null;
}

/**
 * The brand to show for THIS request — the effective (viewing/impersonated) user's
 * business-unit brand (spec 024), falling back to the deployment default when the
 * user has no business unit, is signed out, or on any error. Request-cached, so the
 * root layout (theme CSS + metadata) and the app shell resolve it once.
 *
 * A business unit supplies name / short name / colors; its logo is its own (added in
 * a later increment) and, when unset, the unit shows its wordmark — never the default
 * company's logo. All other attributes fall back per-attribute to the default.
 */
export const getBrand = cache(async (): Promise<Brand> => {
  const fallback = await getDefaultBrand();
  try {
    const buId = await effectiveBusinessUnitId();
    if (buId) {
      const bu = await getBusinessUnitBrand(buId);
      if (bu) {
        return {
          companyName: bu.name || fallback.companyName,
          shortName: bu.shortName || fallback.shortName,
          // A business unit uses its OWN logo (wordmark when unset) — never the
          // default company's logo. Served through the authorized BU logo route.
          logoUrl: bu.logoUrl
            ? `/api/business-units/${bu.id}/logo?v=${encodeURIComponent(bu.logoUrl.split("/").pop() ?? "1")}`
            : null,
          primaryColor: bu.primaryColor || fallback.primaryColor,
          accentColor: bu.accentColor || fallback.accentColor,
        };
      }
    }
  } catch {
    /* not migrated / no session / error → default brand */
  }
  return fallback;
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
