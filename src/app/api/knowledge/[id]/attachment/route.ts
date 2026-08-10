import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { streamPrivateBlob } from "@/lib/blob-serve";

/**
 * Company-internal deck download/embed: any signed-in employee may fetch an
 * article's attachment. Decks live in a PRIVATE store, so we stream the bytes
 * through the server after the sign-in check (served inline so the PDF renders
 * in the reader's <object> embed).
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
  const article = await prisma.knowledgeArticle.findUnique({ where: { id } });
  if (!article || !article.attachmentUrl) return new NextResponse("Not found", { status: 404 });

  return streamPrivateBlob(article.attachmentUrl, { fileName: article.attachmentName });
}
