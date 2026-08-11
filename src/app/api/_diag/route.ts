import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY diagnostic (spec 023 rollout) — admin-only. Reports whether the deployment's database
 * actually has the migration-034 schema, so we can tell a missing-migration 500 from a code bug.
 * Remove once the deployment is confirmed healthy.
 */
async function probe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET() {
  await requireAdmin();
  const out = {
    dependantKind: await probe(() => prisma.dependant.findFirst({ select: { kind: true } })),
    medicalRateBandCount: await probe(() => prisma.medicalRateBand.count()),
    medicalCoveredPerson: await probe(() => prisma.medicalCoveredPerson.count()),
    profileQuery: await probe(() =>
      prisma.user.findFirst({ include: { dependants: true, documents: true, reportsTo: { select: { name: true } } } })
        .then((u) => ({ found: !!u, dependants: u?.dependants.length ?? 0 }))
    ),
    sqlMigrations: await probe(async () => {
      const rows = await prisma.$queryRawUnsafe<{ filename: string }[]>(
        `SELECT filename FROM "_sql_migrations" ORDER BY filename DESC LIMIT 6`
      );
      return rows.map((r) => r.filename);
    }),
  };
  return NextResponse.json(out);
}
