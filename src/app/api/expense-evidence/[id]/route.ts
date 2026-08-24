import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManagePettyCash, canReviewPayback } from "@/lib/finance/access";
import { streamPrivateBlob } from "@/lib/blob-serve";

/**
 * Serve one evidence file — a petty cash receipt or a payback request's proof (spec 040).
 *
 * A URL is not a permission. The decision is re-made HERE, on every request, from the same
 * derivation the pages use, because somebody who has seen one receipt link can guess at others.
 *
 * The answer for anyone not entitled is **404, never 403**: "forbidden" confirms the file
 * exists, and the existence of a receipt is itself information — that this person spent this
 * amount on this day. (The older `/api/claims/[id]/proof` route still answers 403; it predates
 * the rule and is out of scope for this feature. Do not "fix" this one to match it.)
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/signin", process.env.NEXTAUTH_URL ?? "http://localhost:3000"));
  }

  const { id } = await params;
  const evidence = await prisma.expenseEvidence.findUnique({
    where: { id },
    select: {
      blobUrl: true,
      fileName: true,
      uploadedById: true,
      paybackRequest: { select: { userId: true } },
      pettyCashLine: {
        select: {
          period: { select: { account: { select: { custodianId: true } } } },
        },
      },
    },
  });

  const notFound = new NextResponse("Not found", { status: 404 });
  if (!evidence) return notFound;

  const viewerId = session.user.id;
  const role = session.user.role;

  const entitled =
    // Finance and Super Users pay these and reconcile them.
    canManagePettyCash(role) ||
    canReviewPayback(role) ||
    // Whoever uploaded it.
    evidence.uploadedById === viewerId ||
    // The person whose payback request it is.
    evidence.paybackRequest?.userId === viewerId ||
    // The custodian of the float the line belongs to.
    evidence.pettyCashLine?.period.account.custodianId === viewerId;

  if (!entitled) return notFound;

  return streamPrivateBlob(evidence.blobUrl, { fileName: evidence.fileName });
}
