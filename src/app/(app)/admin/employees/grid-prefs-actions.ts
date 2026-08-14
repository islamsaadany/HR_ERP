"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { EMPLOYEES_COLUMNS_PREF, type ColumnPref } from "./grid-prefs";

// Guardrails so a malformed/oversized client payload can never bloat the row.
const MAX_COLUMNS = 60;
const MAX_KEY_LEN = 64;

/** Keep only well-shaped {key, visible} entries; drop junk, dedupe, cap length. */
function sanitize(cfg: unknown): ColumnPref[] {
  if (!Array.isArray(cfg)) return [];
  const seen = new Set<string>();
  const out: ColumnPref[] = [];
  for (const raw of cfg) {
    if (out.length >= MAX_COLUMNS) break;
    if (!raw || typeof raw !== "object") continue;
    const key = (raw as { key?: unknown }).key;
    const visible = (raw as { visible?: unknown }).visible;
    if (typeof key !== "string" || !key || key.length > MAX_KEY_LEN) continue;
    if (typeof visible !== "boolean") continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, visible });
  }
  return out;
}

/**
 * Persist the Employees grid column layout (order + visibility) for the acting
 * admin, so it follows them across browsers/devices. Fire-and-forget from the
 * client — cosmetic only, never touches data access or money rules.
 */
export async function saveEmployeeColumns(cfg: ColumnPref[]): Promise<void> {
  const actor = await requireAdmin();
  const clean = sanitize(cfg);

  const current = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { uiPrefs: true },
  });
  const base =
    current?.uiPrefs && typeof current.uiPrefs === "object" && !Array.isArray(current.uiPrefs)
      ? { ...(current.uiPrefs as Record<string, unknown>) }
      : {};
  base[EMPLOYEES_COLUMNS_PREF] = clean;

  await prisma.user.update({
    where: { id: actor.id },
    data: { uiPrefs: base as Prisma.InputJsonValue },
  });
}
