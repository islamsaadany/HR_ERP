import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/roles";
import { dataRequestSummaryFor } from "@/lib/profile/campaigns";

export const dynamic = "force-dynamic";

/**
 * The signed-in user's own data-request summary (spec 033). The popup layer polls this —
 * on mount, on tab focus, and on an interval — because a campaign launched while a session
 * is already open never reaches the client through layout props (layouts do not re-render
 * on client-side navigation; the dead-badge bug, 2026-08-17).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  // requireUser resolves impersonation the same way every page does; with a session present
  // it never redirects.
  const user = await requireUser();
  const summary = await dataRequestSummaryFor(user.id);
  return NextResponse.json(summary ?? { pendingCount: 0, groups: [] });
}
