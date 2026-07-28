import { requireUser } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const firstName = user.name?.split(" ")[0] ?? "there";

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Dashboard
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Welcome, {firstName}</h1>
      <p className="mt-2 text-muted">Your Forefront HR home.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { title: "Onboarding", body: "Your onboarding journey." },
          { title: "Benefits", body: "Your benefits selection." },
          { title: "Time-Off", body: "Request and track leave." },
        ].map((tile) => (
          <div
            key={tile.title}
            className="rounded-xl border border-line bg-surface p-5"
          >
            <div className="font-medium text-ink">{tile.title}</div>
            <div className="mt-1 text-sm text-muted">{tile.body}</div>
            <div className="mt-3 text-xs text-muted italic">Coming soon</div>
          </div>
        ))}
      </div>
    </div>
  );
}
