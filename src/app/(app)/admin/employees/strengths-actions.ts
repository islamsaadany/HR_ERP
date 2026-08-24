"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { parseGallupReport, THEME_NAMES, themeCodeFor } from "@/lib/reviews/gallup";

export type ProposedTheme = { rank: number; code: string; name: string };

export type StrengthsProposal =
  | {
      ok: true;
      themes: ProposedTheme[];
      printedName: string | null;
      assessmentDateISO: string | null;
      blobUrl: string | null;
      fileName: string | null;
      warnings: string[];
    }
  | { ok: false; error: string };

export type StrengthsSaveState = { ok: true; message: string } | { ok: false; error: string } | null;

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Read an uploaded Gallup report and PROPOSE its themes.
 *
 * Deliberately writes nothing to the profile: extraction is a suggestion until a
 * human confirms it, the same rule the holiday fetch follows (spec 037) — nothing
 * from an outside source is stored without somebody agreeing to it.
 *
 * The file is uploaded first so a confirmation can attach it without a second
 * upload. A parse failure still returns a refusal, never an exception: manual
 * entry is the required fallback (FR-027), so an unreadable report must land the
 * operator in the form rather than on an error page.
 */
export async function parseStrengthsUpload(
  employeeId: string,
  _prev: StrengthsProposal | null,
  formData: FormData
): Promise<StrengthsProposal> {
  await requireAdmin();

  const file = formData.get("report");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a PDF to upload." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "That file is larger than 10MB." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const parsed = await parseGallupReport(bytes);
  if (!parsed.ok) {
    return { ok: false, error: parsed.reason };
  }

  // Private store: the raw blob URL is never handed to a browser. Reads go
  // through /api/reviews/strengths/[profileId], which re-checks permission.
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "gallup.pdf";
  let blobUrl: string | null = null;
  try {
    const blob = await put(`strengths/${employeeId}/${safeName}`, file, {
      access: "private",
      addRandomSuffix: true,
    });
    blobUrl = blob.url;
  } catch {
    // Storing the file is a convenience; the themes are the point. Losing the
    // upload must not lose a successful parse.
    blobUrl = null;
  }

  return {
    ok: true,
    themes: parsed.themes.map((name, i) => ({
      rank: i + 1,
      code: themeCodeFor(name),
      name,
    })),
    printedName: parsed.printedName,
    assessmentDateISO: parsed.assessmentDate?.toISOString().slice(0, 10) ?? null,
    blobUrl,
    fileName: safeName,
    warnings: [
      ...parsed.warnings,
      ...(blobUrl
        ? []
        : ["The themes were read, but the file itself could not be stored. The profile will still save."]),
    ],
  };
}

const confirmSchema = z.object({
  assessmentDate: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.coerce.date().nullable()
  ),
  printedName: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().max(120).nullable()
  ),
  blobUrl: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().max(2000).nullable()
  ),
  fileName: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().max(200).nullable()
  ),
  source: z.enum(["PARSED", "MANUAL"]),
});

const VALID_CODES = new Set(THEME_NAMES.map(themeCodeFor));

/**
 * The ONLY path that persists a strengths profile.
 *
 * Replacing a profile does not touch answers already recorded on past review
 * sheets: those store the theme NAME as text, precisely so a re-take cannot
 * rewrite what somebody said about a quarter that is already closed.
 */
export async function confirmStrengthsProfile(
  employeeId: string,
  _prev: StrengthsSaveState,
  formData: FormData
): Promise<StrengthsSaveState> {
  const admin = await requireAdmin();

  const parsed = confirmSchema.safeParse({
    assessmentDate: formData.get("assessmentDate"),
    printedName: formData.get("printedName"),
    blobUrl: formData.get("blobUrl"),
    fileName: formData.get("fileName"),
    source: formData.get("source") ?? "PARSED",
  });
  if (!parsed.success) return { ok: false, error: "Those details could not be saved." };

  const codes = formData.getAll("themeCode").map(String).filter(Boolean);
  if (codes.length === 0) return { ok: false, error: "Choose at least one theme." };
  if (codes.length > 34) return { ok: false, error: "A profile holds at most 34 themes." };
  if (new Set(codes).size !== codes.length) {
    return { ok: false, error: "The same theme appears twice — each one can only be ranked once." };
  }
  const unknown = codes.filter((c) => !VALID_CODES.has(c));
  if (unknown.length > 0) {
    return { ok: false, error: "That is not a CliftonStrengths theme." };
  }

  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!employee) return { ok: false, error: "That employee could not be found." };

  await prisma.$transaction(async (tx) => {
    const profile = await tx.strengthsProfile.upsert({
      where: { employeeId },
      create: {
        employeeId,
        source: parsed.data.source,
        assessmentDate: parsed.data.assessmentDate,
        printedName: parsed.data.printedName,
        blobUrl: parsed.data.blobUrl,
        fileName: parsed.data.fileName,
        confirmedById: admin.id,
        confirmedAt: new Date(),
      },
      update: {
        source: parsed.data.source,
        assessmentDate: parsed.data.assessmentDate,
        printedName: parsed.data.printedName,
        // Keep the stored file when a correction is saved without a new upload.
        ...(parsed.data.blobUrl
          ? { blobUrl: parsed.data.blobUrl, fileName: parsed.data.fileName }
          : {}),
        confirmedById: admin.id,
        confirmedAt: new Date(),
      },
    });

    await tx.strengthsProfileTheme.deleteMany({ where: { profileId: profile.id } });
    await tx.strengthsProfileTheme.createMany({
      data: codes.map((themeCode, i) => ({ profileId: profile.id, rank: i + 1, themeCode })),
    });
  });

  revalidatePath(`/admin/employees/${employeeId}`);
  return {
    ok: true,
    message: `Saved ${codes.length} ${codes.length === 1 ? "theme" : "themes"}.`,
  };
}

export async function clearStrengthsProfile(
  employeeId: string,
  _prev: StrengthsSaveState,
  _formData: FormData
): Promise<StrengthsSaveState> {
  await requireAdmin();

  // Past review answers are untouched by design — they hold theme names as text.
  await prisma.strengthsProfile.deleteMany({ where: { employeeId } });

  revalidatePath(`/admin/employees/${employeeId}`);
  return { ok: true, message: "Strengths profile removed. Past reviews are unchanged." };
}
