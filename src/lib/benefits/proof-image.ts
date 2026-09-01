/**
 * Client-side shrink for photographed receipts (2026-09-01).
 *
 * A proof of payment only has to be LEGIBLE — a phone's 12-megapixel original buys nothing but
 * failed uploads. The upload path has hard ceilings the form cannot change (the server action
 * body limit, and on Vercel the platform's own ~4.5MB request cap), so a large photo is scaled
 * down and re-encoded in the browser BEFORE it is sent, and the employee never has to think
 * about file sizes at all.
 *
 * Deliberately conservative about what it touches:
 *  - Only images. A PDF or anything else passes through untouched (the 10MB cap still applies).
 *  - Only images over `COMPRESS_ABOVE` — an already-small photo is sent as taken.
 *  - Best-effort: if the browser cannot decode the image (e.g. HEIC on a non-Safari browser),
 *    or anything at all throws, the ORIGINAL file is returned and the ordinary size checks and
 *    transport handling answer for it. Shrinking may never be the reason a claim fails.
 *  - If re-encoding somehow produces a BIGGER file, the original is kept.
 *
 * Browser-only (canvas + createImageBitmap) — never import from server code.
 */

/** Leave files at or below this alone (bytes). */
const COMPRESS_ABOVE = 1_500_000;
/** Aim below this (bytes): clears every layer in the path with headroom to spare. */
const TARGET_BYTES = 3_000_000;

/** Progressively smaller/rougher attempts; 2000px at 0.82 is ample for a legible receipt. */
const ATTEMPTS: { maxDim: number; quality: number }[] = [
  { maxDim: 2000, quality: 0.82 },
  { maxDim: 2000, quality: 0.7 },
  { maxDim: 1600, quality: 0.6 },
];

function encode(bitmap: ImageBitmap, maxDim: number, quality: number): Promise<Blob | null> {
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  // A transparent PNG re-encoded as JPEG gets a black backing by default — paint white first.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Shrink a proof image toward `TARGET_BYTES`, or return the file unchanged when it is not an
 * image, already small enough, or cannot be processed in this browser.
 */
export async function shrinkProofImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= COMPRESS_ABOVE) return file;
  try {
    const bitmap = await createImageBitmap(file);
    try {
      let best: Blob | null = null;
      for (const a of ATTEMPTS) {
        const blob = await encode(bitmap, a.maxDim, a.quality);
        if (!blob) continue;
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= TARGET_BYTES) break;
      }
      if (!best || best.size >= file.size) return file;
      const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
      return new File([best], name, { type: "image/jpeg" });
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}
