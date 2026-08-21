import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

/**
 * Toggleable platform modules for the release switch. Home, Profile, Admin, and
 * the Incentive Scheme are intentionally not listed (always available to their
 * audience). A module with no ModuleFlag row is enabled by default.
 */
export const MODULES = [
  { key: "onboarding", label: "Onboarding", href: "/onboarding" },
  { key: "benefits", label: "Benefits", href: "/benefits" },
  { key: "directory", label: "Team Directory", href: "/directory" },
  { key: "handbook", label: "Handbook & Resources", href: "/handbook" },
  { key: "knowledge", label: "Knowledge Base", href: "/knowledge" },
  { key: "timeoff", label: "Time-Off", href: "/time-off" },
  { key: "learning", label: "Learning", href: "/learning" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];

/** Keys of modules that are currently switched OFF (empty if the table is absent). */
export async function getDisabledModules(): Promise<Set<string>> {
  try {
    const rows = await prisma.moduleFlag.findMany({ where: { enabled: false }, select: { key: true } });
    return new Set(rows.map((r) => r.key));
  } catch {
    return new Set(); // table not migrated yet → everything on
  }
}

/** Hrefs of disabled modules, for hiding nav entries. */
export async function getDisabledHrefs(): Promise<string[]> {
  const disabled = await getDisabledModules();
  return MODULES.filter((m) => disabled.has(m.key)).map((m) => m.href);
}

/** Guard a module page: redirect employees away when the module is switched off. */
export async function requireModuleEnabled(key: ModuleKey): Promise<void> {
  const disabled = await getDisabledModules();
  if (disabled.has(key)) redirect("/dashboard");
}
