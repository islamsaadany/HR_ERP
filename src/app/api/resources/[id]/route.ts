import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { streamPrivateBlob } from "@/lib/blob-serve";

/**
 * Company-internal download: any signed-in employee may fetch a resource.
 * Resources live in a PRIVATE store, so we stream the bytes through the server
 * after the sign-in check rather than redirecting to a (non-public) blob URL.
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
  const resource = await prisma.resource.findUnique({ where: { id } });
  if (!resource) return new NextResponse("Not found", { status: 404 });

  return streamPrivateBlob(resource.blobUrl, { fileName: resource.title });
}
