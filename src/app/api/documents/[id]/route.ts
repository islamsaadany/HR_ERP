import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";

/**
 * Authorized download: only the owner or HR/Super User may follow the link.
 * We never expose the raw blob URL in the UI — links point here.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/signin", process.env.NEXTAUTH_URL ?? "http://localhost:3000"));
  }
  const { id } = await params;
  const doc = await prisma.personalDocument.findUnique({ where: { id } });
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const isOwner = doc.ownerId === session.user.id;
  if (!isOwner && !isAdmin(session.user.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return NextResponse.redirect(doc.blobUrl);
}
