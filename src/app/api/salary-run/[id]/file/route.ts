import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canSeeSalaryRuns } from "@/lib/finance/access";
import { canConfirmBatches } from "@/lib/finance/confirmers";
import { streamPrivateBlob } from "@/lib/blob-serve";

/**
 * The bank's file attached to a monthly salary run (spec 040).
 *
 * Narrower than the expense-evidence route on purpose: a payroll document is Finance, the
 * appointed confirmer, and top-level access — never HR Admin, and never the people it covers.
 * As everywhere in this module, the answer for anyone else is 404, because "forbidden" would
 * confirm that a payroll file for that month exists.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/signin", process.env.NEXTAUTH_URL ?? "http://localhost:3000"));
  }

  const { id } = await params;
  const notFound = new NextResponse("Not found", { status: 404 });

  const batch = await prisma.paymentBatch.findUnique({
    where: { id },
    select: { type: true, attachmentUrl: true, attachmentName: true },
  });
  if (!batch || batch.type !== "SALARY" || !batch.attachmentUrl) return notFound;

  const isConfirmer = await canConfirmBatches(session.user.id);
  if (!canSeeSalaryRuns(session.user.role, isConfirmer)) return notFound;

  return streamPrivateBlob(batch.attachmentUrl, { fileName: batch.attachmentName });
}
