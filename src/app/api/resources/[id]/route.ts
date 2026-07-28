import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/** Company-internal download: any signed-in employee may fetch a resource. */
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
  const resource = await prisma.resource.findUnique({ where: { id } });
  if (!resource) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(resource.blobUrl);
}
