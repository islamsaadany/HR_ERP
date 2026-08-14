import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { streamPrivateBlob } from "@/lib/blob-serve";

/**
 * Public serving route for a business unit's logo (spec 024). Mirrors
 * `/api/brand/logo`: the logo lives in the PRIVATE Blob store but is not
 * sensitive, so it is served through the server with a short public cache.
 * `getBrand()` points a unit member's <img> here; a `?v=` busts the cache when
 * the logo changes.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let logoUrl: string | null = null;
  try {
    const row = await prisma.businessUnit.findUnique({ where: { id }, select: { logoUrl: true } });
    logoUrl = row?.logoUrl ?? null;
  } catch {
    /* table not migrated yet */
  }
  if (!logoUrl) return new NextResponse("Not found", { status: 404 });

  return streamPrivateBlob(logoUrl, { cacheControl: "public, max-age=300, must-revalidate" });
}
