"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireIncentiveAccess } from "@/lib/roles";
import { parsePeople, parseAssignments, parseContributions } from "@/lib/incentive/import";
import { validateReview, type ReviewPayload } from "@/lib/incentive/review";
import { writeReviewTables } from "@/lib/incentive/persist";
import { releasedFiguresWouldBreak } from "@/lib/incentive/released-guard";

export async function createCycle(formData: FormData): Promise<void> {
  await requireIncentiveAccess();
  const label = String(formData.get("label") ?? "").trim();
  if (!label) redirect("/incentive?error=Enter+a+cycle+label");
  const clash = await prisma.incentiveCycle.findUnique({ where: { label }, select: { id: true } });
  if (clash) redirect("/incentive?error=A+cycle+with+that+label+already+exists");
  const cycle = await prisma.incentiveCycle.create({ data: { label } });
  revalidatePath("/incentive");
  redirect(`/incentive/${cycle.id}`);
}

export async function deleteCycle(formData: FormData): Promise<void> {
  await requireIncentiveAccess();
  const id = String(formData.get("id") ?? "");
  if (id) {
    await prisma.incentiveCycle.delete({ where: { id } });
    revalidatePath("/incentive");
  }
  redirect("/incentive");
}

export async function saveFirmFigures(cycleId: string, formData: FormData): Promise<void> {
  await requireIncentiveAccess();
  const num = (k: string) => {
    const v = String(formData.get(k) ?? "").replace(/[, ]/g, "").trim();
    if (v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  await prisma.incentiveCycle.update({
    where: { id: cycleId },
    data: { revenue: num("revenue"), deliveryCost: num("deliveryCost"), totalExpenses: num("totalExpenses") },
  });
  revalidatePath(`/incentive/${cycleId}`);
  redirect(`/incentive/${cycleId}`);
}

/**
 * Result of a sheet upload, surfaced inline in the UI (via useActionState) instead of a silent
 * redirect — so a failed upload shows a real, actionable reason rather than doing nothing.
 */
export type UploadState =
  | { ok: true; message: string; warnings: string[] }
  | { ok: false; error: string; warnings?: string[] }
  | null;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Replace one sheet's rows for a cycle from an uploaded CSV. Returns an inline result. */
export async function uploadSheet(
  cycleId: string,
  kind: "people" | "assignments" | "contributions",
  _prev: UploadState,
  formData: FormData
): Promise<UploadState> {
  // Auth check stays outside the try so its redirect (for a non-Super-User) propagates normally
  // rather than being swallowed and shown as an "upload failed" message.
  await requireIncentiveAccess();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file was received. Choose a CSV file, then click Upload." };
  }
  const sizeKb = Math.max(1, Math.round(file.size / 1024));

  let text: string;
  try {
    text = await file.text();
  } catch (e) {
    return { ok: false, error: `Couldn't read "${file.name}": ${errMsg(e)}` };
  }

  // A .xlsx is a zip (starts with the "PK" signature); binary / UTF-16 files carry null bytes.
  // Neither is CSV — say so plainly instead of parsing garbage into zero rows.
  if (text.startsWith("PK") || text.includes("\u0000")) {
    return {
      ok: false,
      error: `"${file.name}" looks like an Excel or binary file, not a CSV. In Excel choose File → Save As → CSV UTF-8, then upload that file.`,
    };
  }
  // Excel's "CSV UTF-8" prepends a byte-order mark (U+FEFF); strip it so the header row still matches.
  text = text.replace(/^\uFEFF/, "");

  try {
    if (kind === "people") {
      const { rows, issues } = parsePeople(text);
      if (rows.length === 0) {
        return { ok: false, error: `Read "${file.name}" (${sizeKb} KB) but found no valid people rows.`, warnings: issues };
      }
      await prisma.$transaction([
        prisma.incentivePerson.deleteMany({ where: { cycleId } }),
        ...rows.map((p) =>
          prisma.incentivePerson.create({
            data: {
              cycleId,
              name: p.name,
              employeeId: p.employeeId,
              role: p.role,
              netMonthlySalary: p.netMonthlySalary,
              startDate: p.startDate,
              eligibleToLead: p.eligibleToLead,
              utilization: p.utilization,
            },
          })
        ),
      ]);
      revalidatePath(`/incentive/${cycleId}`);
      return { ok: true, message: `Imported ${rows.length} people from "${file.name}" (${sizeKb} KB).`, warnings: issues };
    }

    if (kind === "assignments") {
      const { rows, issues } = parseAssignments(text);
      if (rows.length === 0) {
        return { ok: false, error: `Read "${file.name}" (${sizeKb} KB) but found no valid assignment rows.`, warnings: issues };
      }
      await prisma.$transaction([
        prisma.incentiveAssignment.deleteMany({ where: { cycleId } }),
        ...rows.map((a) =>
          prisma.incentiveAssignment.create({
            data: {
              cycleId,
              client: a.client,
              type: a.type,
              lead: a.lead,
              bd: a.bd,
              leadSource: a.leadSource,
              revenue: a.revenue,
              directCost: a.directCost,
              vendorCost: a.vendorCost,
              markupPct: a.markupPct,
              startDate: a.startDate,
              closeDate: a.closeDate,
              status: a.status,
            },
          })
        ),
      ]);
      revalidatePath(`/incentive/${cycleId}`);
      return { ok: true, message: `Imported ${rows.length} assignments from "${file.name}" (${sizeKb} KB).`, warnings: issues };
    }

    const { rows, issues } = parseContributions(text);
    if (rows.length === 0) {
      return { ok: false, error: `Read "${file.name}" (${sizeKb} KB) but found no valid contribution cells.`, warnings: issues };
    }
    await prisma.$transaction([
      prisma.incentiveContribution.deleteMany({ where: { cycleId } }),
      ...rows.map((c) => prisma.incentiveContribution.create({ data: { cycleId, client: c.client, person: c.person, share: c.share } })),
    ]);
    revalidatePath(`/incentive/${cycleId}`);
    return { ok: true, message: `Imported ${rows.length} contribution rows from "${file.name}" (${sizeKb} KB).`, warnings: issues };
  } catch (e) {
    return { ok: false, error: `Upload failed while saving: ${errMsg(e)}` };
  }
}

/** Result of a Recalculate — every fault is returned at once, never just the first. */
export type ReviewSaveState =
  | { ok: true; message: string }
  | { ok: false; errors: string[] }
  | null;

/**
 * Save the three review sheets as edited on screen, then let the page re-render
 * so the whole report is recomputed from the stored rows. Recalculate IS the
 * save — there is no second button — so the tables below can never show figures
 * the database doesn't hold.
 */
export async function saveReviewTables(
  cycleId: string,
  _prev: ReviewSaveState,
  payload: ReviewPayload
): Promise<ReviewSaveState> {
  await requireIncentiveAccess();

  const checked = validateReview(payload);
  if (!checked.ok) return { ok: false, errors: checked.errors };

  // ── Money that has already gone cannot be re-decided ──────────────────────
  // Compute what the report WOULD say with these rows, without writing anything, and
  // refuse if that changes a figure somebody has already been released. The report has
  // to keep agreeing with what the bank actually did.
  const broken = await releasedFiguresWouldBreak(cycleId, checked.clean);
  if (broken.length > 0) return { ok: false, errors: broken };

  try {
    const n = await writeReviewTables(cycleId, checked.clean);
    revalidatePath(`/incentive/${cycleId}`);
    const count = (c: number, one: string, many: string) => `${c} ${c === 1 ? one : many}`;
    return {
      ok: true,
      message: `Saved and recalculated — ${count(n.people, "person", "people")}, ${count(
        n.assignments,
        "assignment",
        "assignments"
      )}, ${count(n.contributions, "contribution", "contributions")}.`,
    };
  } catch (e) {
    return { ok: false, errors: [`Nothing was saved — the write failed: ${errMsg(e)}`] };
  }
}
