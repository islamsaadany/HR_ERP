import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/Avatar";

export const dynamic = "force-dynamic";

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  // Public fields only; Left employees are not shown (spec 003 · FR-002/006/008).
  const person = await prisma.user.findFirst({
    where: { id, status: "ACTIVE" },
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

  if (!person) notFound();

  return (
    <div className="max-w-xl">
      <Link href="/directory" className="text-sm text-muted hover:text-ink">
        ← Directory
      </Link>

      <div className="mt-4 rounded-2xl border border-line bg-surface p-8">
        <div className="flex items-center gap-4">
          <Avatar name={person.name} photoUrl={person.photoUrl} size={72} />
          <div>
            <h1 className="font-serif text-2xl text-ink">{person.name}</h1>
            <p className="text-muted">{person.title ?? "—"}</p>
            <p className="text-sm text-muted">{person.department ?? ""}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={`mailto:${person.email}`}
            className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700"
          >
            Email
          </a>
          {person.phone ? (
            <a
              href={`tel:${person.phone}`}
              className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-navy-700 hover:border-navy-300"
            >
              Call
            </a>
          ) : null}
        </div>

        <dl className="mt-6 divide-y divide-line text-sm">
          <div className="flex justify-between py-2">
            <dt className="text-muted">Email</dt>
            <dd className="text-ink">{person.email}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-muted">Phone</dt>
            <dd className="text-ink">{person.phone ?? "—"}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-muted">Department</dt>
            <dd className="text-ink">{person.department ?? "—"}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
