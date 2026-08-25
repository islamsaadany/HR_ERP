import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { streamPrivateBlob } from "@/lib/blob-serve";

export const runtime = "nodejs";

/**
 * Serve an employee's uploaded Gallup report.
 *
 * WHO: the employee themselves, and HR Admin / Super User. The HR exclusion that
 * covers this module's reviews, 1:1s and journals does NOT cover this file — a
 * strengths profile is employee-record data that HR administers and uploads.
 *
 * WHY 404 AND NOT 403: a "forbidden" confirms the file exists, which is itself
 * something the person asking is not entitled to know. Same rule as the Learning
 * materials route.
 *
 * The permission question is asked HERE, on every request. A URL is a URL: that a
 * link was only ever rendered for someone entitled to it is not a control.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Not found", { status: 404 });

  const { profileId } = await params;
  const profile = await prisma.strengthsProfile.findUnique({
    where: { id: profileId },
    select: { employeeId: true, blobUrl: true, fileName: true },
  });
  if (!profile?.blobUrl) return new NextResponse("Not found", { status: 404 });

  const isOwner = profile.employeeId === session.user.id;
  if (!isOwner && !isAdmin(session.user.role)) {
    return new NextResponse("Not found", { status: 404 });
  }

  return streamPrivateBlob(profile.blobUrl, { fileName: profile.fileName });
}
