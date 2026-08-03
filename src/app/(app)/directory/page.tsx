import { requireUser } from "@/lib/roles";
import { requireModuleEnabled } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { DirectoryBrowser } from "@/components/DirectoryBrowser";

export const dynamic = "force-dynamic";

export default async function DirectoryPage() {
  await requireUser();
  await requireModuleEnabled("directory");
  const people = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    // Public fields only — no HR-private data leaves the server (spec 003 · FR-008).
    select: {
      id: true,
      name: true,
      title: true,
      department: true,
      email: true,
      phone: true,
      photoUrl: true,
    },
  });

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Team Directory
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">The team</h1>
      <p className="mt-1 text-muted">Find and reach your colleagues.</p>
      <DirectoryBrowser people={people} />
    </div>
  );
}
