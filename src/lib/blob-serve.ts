import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

/**
 * Stream a blob from a PRIVATE Vercel Blob store through the server.
 *
 * Private stores never expose a directly-fetchable URL — every read must go
 * through a Function that authenticates the request and fetches the bytes with
 * the store token (see `src/app/api/**` serving routes). Callers do their own
 * authorization first, then hand the stored blob URL here to stream it back.
 *
 * @param blobUrl   The `url` returned by `put()` and saved in the DB.
 * @param fileName  Optional human filename for the `Content-Disposition` header.
 * @param cacheControl  Defaults to `private, no-cache` (browser-only, revalidated).
 *                      Pass a public policy for non-sensitive assets (e.g. the logo).
 */
export async function streamPrivateBlob(
  blobUrl: string,
  {
    fileName,
    cacheControl = "private, no-cache",
  }: { fileName?: string | null; cacheControl?: string } = {},
): Promise<NextResponse> {
  const result = await get(blobUrl, { access: "private" });
  if (!result || result.statusCode !== 200) {
    return new NextResponse("Not found", { status: 404 });
  }

  const headers: Record<string, string> = {
    "Content-Type": result.blob.contentType || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": cacheControl,
  };
  if (fileName) {
    // Strip characters that would break the header (quotes, CR/LF, backslash).
    const safe = fileName.replace(/["\\\r\n]/g, "_");
    headers["Content-Disposition"] = `inline; filename="${safe}"`;
  }

  return new NextResponse(result.stream, { headers });
}
