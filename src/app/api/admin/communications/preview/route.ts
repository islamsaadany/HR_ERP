import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { renderMessage } from "@/lib/comms/render";
import { groupName } from "@/lib/comms/settings";

export const dynamic = "force-dynamic";

/**
 * The preview.
 *
 * Renders through `renderMessage` — the SAME function every real send calls. That is the whole
 * point of this route existing rather than a React component that mirrors the email: a preview
 * drawn any other way is a picture of an email nobody will receive, the two drift on the first
 * change, and the drift stays invisible until somebody complains about a real message.
 *
 * Served as a full HTML document for an `<iframe srcdoc>`, so what the operator sees is the actual
 * mail-client markup rather than a web-styled approximation of it.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  // Which unit to preview AS. Absent = preview as somebody with no unit, which is a real case and
  // the one most likely to look wrong if nobody checks it.
  const unitId = url.searchParams.get("unit");

  if (!id) return new NextResponse("Missing id", { status: 400 });

  const message = await prisma.message.findUnique({
    where: { id },
    select: {
      kind: true,
      subject: true,
      body: true,
      ctaLabel: true,
      ctaHref: true,
      sentBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
    },
  });
  if (!message) return new NextResponse("Not found", { status: 404 });

  const [unit, group] = await Promise.all([
    unitId
      ? prisma.businessUnit.findUnique({
          where: { id: unitId },
          select: { name: true, primaryColor: true },
        })
      : Promise.resolve(null),
    groupName(),
  ]);

  const isCongrats = message.kind !== "ANNOUNCEMENT";
  const { html } = renderMessage({
    unit,
    groupName: group,
    fallbackLabel: isCongrats ? "A note for you" : "Announcement",
    subject: message.subject,
    body: message.body,
    cta: message.ctaLabel && message.ctaHref ? { label: message.ctaLabel, href: message.ctaHref } : null,
    // A congratulation is signed. Previewed with whoever WOULD send it, so the operator sees the
    // name that will actually appear rather than a placeholder.
    signedBy: isCongrats ? (message.sentBy?.name ?? message.assignedTo?.name ?? null) : null,
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
