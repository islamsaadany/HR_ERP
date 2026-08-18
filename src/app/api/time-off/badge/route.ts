import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/roles";
import { timeOffBadgeCount } from "@/lib/leave-queries";

export const dynamic = "force-dynamic";

/**
 * The signed-in user's Time-Off badge total (spec 035, FR-006): unseen decisions on their
 * own requests + pending requests awaiting them as the current manager (or as Super User
 * fallback). Polled by TimeOffBadgeSync — a request submitted while the manager's session
 * is already open never reaches them through layout props (layouts do not re-render on
 * client-side navigation; same family as the data-request dead-badge bug).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const user = await requireUser();
  const count = await timeOffBadgeCount(user);
  return NextResponse.json({ count });
}
