import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { streamPrivateBlob } from "@/lib/blob-serve";

/**
 * Public serving route for the company logo.
 *
 * The logo lives in a PRIVATE Blob store (the app's only store), but the logo
 * itself is not sensitive and must be visible before sign-in (it appears on the
 * /signin page). So this route is intentionally unauthenticated and serves the
 * bytes through the server with a short public cache. `getBrand()` points every
 * <img> at this stable path; a `?v=` cache-buster changes when the logo does.
 */
export async function GET() {
  let logoUrl: string | null = null;
  try {
    const row = await prisma.brandSettings.findFirst();
    logoUrl = row?.logoUrl ?? null;
  } catch {
    /* table not migrated yet */
  }
  if (!logoUrl) return new NextResponse("Not found", { status: 404 });

  return streamPrivateBlob(logoUrl, { cacheControl: "public, max-age=300, must-revalidate" });
}
