import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { streamPrivateBlob } from "@/lib/blob-serve";

/**
 * Authorized proof-of-payment download: the claim owner or HR/Super User only.
 * Proof files live in a PRIVATE store and are streamed through the server after
 * the permission check — the raw blob URL is never exposed.
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
  const claim = await prisma.benefitClaim.findUnique({ where: { id } });
  if (!claim || !claim.proofUrl) return new NextResponse("Not found", { status: 404 });

  const isOwner = claim.userId === session.user.id;
  if (!isOwner && !isAdmin(session.user.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return streamPrivateBlob(claim.proofUrl, { fileName: claim.proofName });
}
