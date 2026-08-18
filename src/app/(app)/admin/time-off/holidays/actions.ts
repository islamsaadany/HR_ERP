"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";

const PATHS = ["/admin/time-off/holidays", "/admin/time-off", "/time-off"];
const back = (q: string): never => redirect(`/admin/time-off/holidays?${q}`);

/** Normalise any parsed day to UTC midnight — the storage shape (see lib/workdays). */
function utcDay(y: number, m: number, d: number): Date | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  // Reject rollovers like 32/01 → 01/02: the constructed date must read back the same.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/** dd/mm/yyyy (house standard) or yyyy-mm-dd (date inputs); null if neither. */
function parseDay(value: string): Date | null {
  const dmy = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return utcDay(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return utcDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return null;
}

export async function addHoliday(formData: FormData): Promise<void> {
  await requireAdmin();
  const name = ((formData.get("name") as string) ?? "").trim();
  const date = parseDay((formData.get("date") as string) ?? "");
  if (!date) back("error=" + encodeURIComponent("Enter a valid date."));
  if (!name) back("error=" + encodeURIComponent("Give the holiday a name."));
  await prisma.publicHoliday.upsert({
    where: { date: date! },
    update: { name },
    create: { date: date!, name },
  });
  PATHS.forEach((p) => revalidatePath(p));
  back("ok=" + encodeURIComponent("Holiday added."));
}

export async function removeHoliday(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = (formData.get("id") as string) ?? "";
  if (id) await prisma.publicHoliday.delete({ where: { id } }).catch(() => {});
  PATHS.forEach((p) => revalidatePath(p));
  back("ok=" + encodeURIComponent("Holiday removed."));
}

/**
 * Bulk import from the Excel template (spec 035, per request 2026-08-18): first sheet,
 * header row then one holiday per row — Date | Holiday name. Date cells may be real
 * Excel dates or dd/mm/yyyy text (house standard). Existing dates are updated, new ones
 * created; bad rows are counted and reported, never silently dropped.
 */
export async function uploadHolidays(formData: FormData): Promise<void> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    back("error=" + encodeURIComponent("Choose the filled-in Excel file first."));
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await (file as File).arrayBuffer());
  } catch {
    back("error=" + encodeURIComponent("That file isn't a readable Excel workbook (.xlsx)."));
  }
  const ws = wb.worksheets[0];
  if (!ws) back("error=" + encodeURIComponent("The workbook has no sheets."));

  let added = 0;
  let updated = 0;
  const badRows: number[] = [];
  for (let n = 2; n <= ws!.rowCount; n++) {
    const row = ws!.getRow(n);
    const rawDate = row.getCell(1).value;
    const rawName = row.getCell(2).value;
    const name = (typeof rawName === "string" ? rawName : rawName?.toString() ?? "").trim();
    if (rawDate == null && !name) continue; // blank row — fine
    let date: Date | null = null;
    if (rawDate instanceof Date) {
      date = utcDay(rawDate.getUTCFullYear(), rawDate.getUTCMonth() + 1, rawDate.getUTCDate());
    } else if (rawDate != null) {
      date = parseDay(String(rawDate));
    }
    if (!date || !name) {
      badRows.push(n);
      continue;
    }
    const existing = await prisma.publicHoliday.findUnique({ where: { date } });
    if (existing) {
      if (existing.name !== name) await prisma.publicHoliday.update({ where: { date }, data: { name } });
      updated += 1;
    } else {
      await prisma.publicHoliday.create({ data: { date, name } });
      added += 1;
    }
  }

  PATHS.forEach((p) => revalidatePath(p));
  const summary = `Imported ${added} new, ${updated} existing${
    badRows.length ? ` · ${badRows.length} row(s) skipped (bad date or missing name): ${badRows.slice(0, 6).join(", ")}${badRows.length > 6 ? "…" : ""}` : ""
  }`;
  back((badRows.length ? "error=" : "ok=") + encodeURIComponent(summary));
}
