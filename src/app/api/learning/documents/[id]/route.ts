import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { streamPrivateBlob } from "@/lib/blob-serve";
import { courseAccessFor } from "@/lib/learning/access";
import { isEmployeeVisibleSlot } from "@/lib/learning/materials";

/**
 * Serve a course document.
 *
 * THIS is where "employees only ever get the slides" actually holds. The Materials tab labels the
 * slots and the course page shows only one of them, but neither is a control — a URL is a URL, and
 * somebody who has seen a slides link can guess an outline one. So the rule is re-decided here,
 * from `isEmployeeVisibleSlot`, on every request:
 *
 *   • an admin may fetch any slot;
 *   • anybody else may fetch ONLY an employee-visible slot, and only for a course they can reach.
 *
 * Streamed through the server (the store is private) with an INLINE disposition, which is what
 * lets a PDF preview in the page instead of downloading.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(
      new URL("/signin", process.env.NEXTAUTH_URL ?? "http://localhost:3000")
    );
  }

  const { id } = await params;
  const doc = await prisma.courseDocument.findUnique({
    where: { id },
    select: { blobUrl: true, fileName: true, slot: true, courseId: true },
  });
  if (!doc) return new NextResponse("Not found", { status: 404 });

  if (!isAdmin(session.user.role)) {
    // 404 rather than 403 for the HR-only slots: a "forbidden" confirms the document exists,
    // which is exactly what the employee side is not supposed to reveal.
    if (!isEmployeeVisibleSlot(doc.slot)) return new NextResponse("Not found", { status: 404 });
    const access = await courseAccessFor(session.user.id, doc.courseId);
    if (!access.allowed) return new NextResponse("Not found", { status: 404 });
  }

  return streamPrivateBlob(doc.blobUrl, { fileName: doc.fileName });
}
