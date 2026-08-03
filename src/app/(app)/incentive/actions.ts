"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSuperUser } from "@/lib/roles";
import { parsePeople, parseAssignments, parseContributions } from "@/lib/incentive/import";

export async function createCycle(formData: FormData): Promise<void> {
  await requireSuperUser();
  const label = String(formData.get("label") ?? "").trim();
  if (!label) redirect("/incentive?error=Enter+a+cycle+label");
  const clash = await prisma.incentiveCycle.findUnique({ where: { label }, select: { id: true } });
  if (clash) redirect("/incentive?error=A+cycle+with+that+label+already+exists");
  const cycle = await prisma.incentiveCycle.create({ data: { label } });
  revalidatePath("/incentive");
  redirect(`/incentive/${cycle.id}`);
}

export async function deleteCycle(formData: FormData): Promise<void> {
  await requireSuperUser();
  const id = String(formData.get("id") ?? "");
  if (id) {
    await prisma.incentiveCycle.delete({ where: { id } });
    revalidatePath("/incentive");
  }
  redirect("/incentive");
}

export async function saveFirmFigures(cycleId: string, formData: FormData): Promise<void> {
  await requireSuperUser();
  const num = (k: string) => {
    const v = String(formData.get(k) ?? "").replace(/[, ]/g, "").trim();
    if (v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  await prisma.incentiveCycle.update({
    where: { id: cycleId },
    data: { revenue: num("revenue"), deliveryCost: num("deliveryCost"), totalExpenses: num("totalExpenses") },
  });
  revalidatePath(`/incentive/${cycleId}`);
  redirect(`/incentive/${cycleId}`);
}

/** Replace one sheet's rows for a cycle from an uploaded CSV. */
export async function uploadSheet(
  cycleId: string,
  kind: "people" | "assignments" | "contributions",
  formData: FormData
): Promise<void> {
  await requireSuperUser();
  const file = formData.get("file");
  const back = `/incentive/${cycleId}`;
  if (!(file instanceof File) || file.size === 0) redirect(`${back}?error=Choose+a+CSV+file`);
  const text = await (file as File).text();

  if (kind === "people") {
    const { rows, issues } = parsePeople(text);
    await prisma.$transaction([
      prisma.incentivePerson.deleteMany({ where: { cycleId } }),
      ...rows.map((p) =>
        prisma.incentivePerson.create({
          data: {
            cycleId,
            name: p.name,
            role: p.role,
            netMonthlySalary: p.netMonthlySalary,
            startDate: p.startDate,
            eligibleToLead: p.eligibleToLead,
            utilization: p.utilization,
          },
        })
      ),
    ]);
    redirect(issues.length ? `${back}?warn=${encodeURIComponent(issues.join(" · "))}` : back);
  }

  if (kind === "assignments") {
    const { rows, issues } = parseAssignments(text);
    await prisma.$transaction([
      prisma.incentiveAssignment.deleteMany({ where: { cycleId } }),
      ...rows.map((a) =>
        prisma.incentiveAssignment.create({
          data: {
            cycleId,
            client: a.client,
            type: a.type,
            lead: a.lead,
            bd: a.bd,
            leadSource: a.leadSource,
            revenue: a.revenue,
            directCost: a.directCost,
            vendorCost: a.vendorCost,
            markupPct: a.markupPct,
            startDate: a.startDate,
            closeDate: a.closeDate,
            status: a.status,
          },
        })
      ),
    ]);
    redirect(issues.length ? `${back}?warn=${encodeURIComponent(issues.join(" · "))}` : back);
  }

  const { rows, issues } = parseContributions(text);
  await prisma.$transaction([
    prisma.incentiveContribution.deleteMany({ where: { cycleId } }),
    ...rows.map((c) => prisma.incentiveContribution.create({ data: { cycleId, client: c.client, person: c.person, share: c.share } })),
  ]);
  redirect(issues.length ? `${back}?warn=${encodeURIComponent(issues.join(" · "))}` : back);
}
