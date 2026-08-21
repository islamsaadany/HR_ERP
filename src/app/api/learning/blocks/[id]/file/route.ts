import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { courseAccessFor } from "@/lib/learning/access";
import { streamPrivateBlob } from "@/lib/blob-serve";

/**
 * Stream a lesson's FILE attachment from the private blob store.
 *
 * Authorised by the SAME derivation the page uses. A blob URL is never handed to a client that
 * could not open the course it belongs to — otherwise the file becomes the back door around
 * every access rule the module has.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await params;

  const block = await prisma.lessonBlock.findUnique({
    where: { id },
    select: {
      type: true,
      blobUrl: true,
      fileName: true,
      lesson: { select: { deletedAt: true, section: { select: { courseId: true, deletedAt: true } } } },
    },
  });

  if (!block || block.type !== "FILE" || !block.blobUrl) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (block.lesson.deletedAt || block.lesson.section.deletedAt) {
    return new NextResponse("Not found", { status: 404 });
  }

  const access = await courseAccessFor(user.id, block.lesson.section.courseId);
  // 404 rather than 403: whether a course exists is itself something a person without access
  // should not learn from us.
  if (!access.allowed) return new NextResponse("Not found", { status: 404 });

  return streamPrivateBlob(block.blobUrl, { fileName: block.fileName });
}
