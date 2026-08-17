/**
 * Reads over data request campaigns (spec 033). Kept out of the "use server" action files
 * for the same reason as change-requests.ts: a query taking a userId must not be a callable
 * endpoint.
 */

import { prisma } from "@/lib/prisma";
import {
  campaignFieldDescriptors,
  CAMPAIGN_USER_SELECT,
  type CampaignFieldDescriptor,
} from "@/lib/profile/campaign-fields";

/** One campaign's ask for the popup: its title and the fields still pending for this user. */
export type DataRequestGroup = {
  campaignId: string;
  title: string;
  descriptors: CampaignFieldDescriptor[];
};

export type DataRequestSummary = {
  /** Total pending fields across campaigns AFTER dedup — the sidebar count. */
  pendingCount: number;
  groups: DataRequestGroup[];
};

/**
 * What the popup shows a user right now, or null when nothing is pending.
 *
 * Campaigns are ordered oldest-first; a field requested by several campaigns appears only
 * under the FIRST one (FR-012 — one answer satisfies all, so showing it twice would just be
 * the same question twice). Current values are read HERE, at render time, so the employee
 * always verifies what the record actually holds.
 */
export async function dataRequestSummaryFor(userId: string): Promise<DataRequestSummary | null> {
  const [targets, user] = await Promise.all([
    prisma.dataRequestTarget.findMany({
      where: {
        userId,
        campaign: { closedAt: null },
        fields: { some: { status: "PENDING" } },
        user: { status: "ACTIVE" }, // FR-013: leavers stop being asked
      },
      include: {
        campaign: { select: { id: true, title: true, createdAt: true } },
        fields: { where: { status: "PENDING" }, select: { field: true } },
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: CAMPAIGN_USER_SELECT }),
  ]);
  if (!user || targets.length === 0) return null;

  targets.sort((a, b) => a.campaign.createdAt.getTime() - b.campaign.createdAt.getTime());

  const seen = new Set<string>();
  const groups: DataRequestGroup[] = [];
  for (const t of targets) {
    const keys = t.fields.map((f) => f.field).filter((k) => !seen.has(k));
    const descriptors = campaignFieldDescriptors(user, keys);
    if (descriptors.length === 0) continue;
    descriptors.forEach((d) => seen.add(d.key));
    groups.push({ campaignId: t.campaign.id, title: t.campaign.title, descriptors });
  }
  if (groups.length === 0) return null;

  return {
    pendingCount: groups.reduce((n, g) => n + g.descriptors.length, 0),
    groups,
  };
}

/** All campaigns for the admin list, newest first, with completion counts. */
export async function listCampaigns() {
  const campaigns = await prisma.dataRequestCampaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { name: true } },
      targets: {
        select: {
          user: { select: { status: true } },
          fields: { select: { status: true } },
        },
      },
    },
  });
  return campaigns.map((c) => {
    // FR-013: leavers drop out of the denominator rather than reading as eternally pending.
    const active = c.targets.filter((t) => t.user.status === "ACTIVE");
    return {
      id: c.id,
      title: c.title,
      fields: c.fields,
      audience: c.audience,
      createdAt: c.createdAt,
      closedAt: c.closedAt,
      createdBy: c.createdBy?.name ?? "—",
      targeted: active.length,
      completed: active.filter((t) => t.fields.every((f) => f.status !== "PENDING")).length,
    };
  });
}

/** One campaign with every target's per-field outcome — the tracker. */
export async function campaignTracker(id: string) {
  return prisma.dataRequestCampaign.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      targets: {
        include: {
          user: { select: { name: true, email: true, status: true } },
          fields: true,
        },
        orderBy: { user: { name: "asc" } },
      },
    },
  });
}
