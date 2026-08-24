import { put } from "@vercel/blob";

/**
 * Evidence upload for petty cash lines and payback requests (spec 040).
 *
 * The limits are deliberately the SAME as the benefit-claim proof upload: 10 MB, images and
 * PDF. A receipt proving a payment is the same kind of artefact whichever feature it arrives
 * through, and a second different limit for the same thing is a rule nobody can remember.
 *
 * Files go to the PRIVATE blob store. They are only ever reachable through
 * `/api/expense-evidence/[id]`, which re-decides access on every request and answers 404 —
 * never 403, which would confirm the file exists.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_RECORD = 10;

/** Images and PDF. Anything else is refused before a byte is stored. */
export const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

/** For the file input's `accept` attribute, so the picker matches the server rule. */
export const ACCEPT_ATTRIBUTE = "image/*,application/pdf";

/** The sentence shown in the UI, so the limit is stated where the person is choosing files. */
export const LIMITS_HINT = "Photos or PDF, up to 10MB each — attach as many as the purchase produced.";

export type StoredEvidence = {
  blobUrl: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
};

export type EvidenceResult =
  | { ok: true; files: StoredEvidence[] }
  | { ok: false; error: string };

/** Strip anything that would make a blob path or a Content-Disposition header awkward. */
function safeName(name: string): string {
  return (name || "receipt")
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

/**
 * Validate and store a set of uploaded files.
 *
 * `required` makes the "at least one" rule explicit at the call site rather than hidden in a
 * flag: a payback request cannot be reviewed without evidence (FR-018), while a petty cash line
 * may be logged now and its receipt attached later — it is simply flagged until then.
 *
 * Validation happens for EVERY file before ANY file is stored, so a rejected batch never leaves
 * half its files orphaned in the blob store.
 */
export async function storeEvidenceFiles(
  files: File[],
  opts: { pathPrefix: string; required?: boolean },
): Promise<EvidenceResult> {
  const real = files.filter((f): f is File => f instanceof File && f.size > 0);

  if (real.length === 0) {
    return opts.required
      ? {
          ok: false,
          error: "Attach the receipt or invoice — a payback request can't be reviewed without it.",
        }
      : { ok: true, files: [] };
  }

  if (real.length > MAX_FILES_PER_RECORD) {
    return {
      ok: false,
      error: `That's ${real.length} files — the limit is ${MAX_FILES_PER_RECORD} per entry.`,
    };
  }

  for (const f of real) {
    if (f.size > MAX_FILE_BYTES) {
      return { ok: false, error: `"${f.name}" is larger than 10MB. Attach a smaller copy.` };
    }
    const type = (f.type || "").toLowerCase();
    if (!ACCEPTED_TYPES.includes(type as (typeof ACCEPTED_TYPES)[number])) {
      return {
        ok: false,
        error: `"${f.name}" isn't a photo or a PDF. Receipts must be an image or a PDF.`,
      };
    }
  }

  const stored: StoredEvidence[] = [];
  for (const f of real) {
    const blob = await put(`${opts.pathPrefix}/${safeName(f.name)}`, f, {
      access: "private",
      addRandomSuffix: true,
    });
    stored.push({
      blobUrl: blob.url,
      fileName: f.name.slice(0, 200),
      contentType: f.type || "application/octet-stream",
      sizeBytes: f.size,
    });
  }

  return { ok: true, files: stored };
}

/** Pull the repeated file field off a FormData, ignoring the empty input browsers always send. */
export function evidenceFilesFrom(formData: FormData, field = "files"): File[] {
  return formData
    .getAll(field)
    .filter((v): v is File => v instanceof File && v.size > 0);
}
