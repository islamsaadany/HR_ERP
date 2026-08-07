import { requireSuperUser } from "@/lib/roles";
import { getDisabledModules, MODULES } from "@/lib/modules";
import { BackLink } from "@/components/admin/BackLink";
import { setModuleEnabled } from "./actions";

export const dynamic = "force-dynamic";

export default async function ModulesPage() {
  await requireSuperUser();
  const disabled = await getDisabledModules();

  return (
    <div>
      <BackLink href="/admin" label="Admin" />
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Super User</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Modules</h1>
      <p className="mt-1 text-muted">
        Switch modules on or off. A module that&apos;s off disappears from everyone&apos;s navigation and its
        pages redirect home — so you can finish work in the background and release when ready.
      </p>

      <div className="mt-6 divide-y divide-line rounded-xl border border-line bg-surface">
        {MODULES.map((m) => {
          const on = !disabled.has(m.key);
          return (
            <div key={m.key} className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="font-medium text-ink">{m.label}</div>
                <div className="text-xs text-muted">{m.href}</div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold " +
                    (on ? "bg-green-50 text-green-700" : "bg-navy-50 text-muted")
                  }
                >
                  {on ? "On" : "Off"}
                </span>
                <form action={setModuleEnabled}>
                  <input type="hidden" name="key" value={m.key} />
                  <input type="hidden" name="enabled" value={(!on).toString()} />
                  <button
                    className={
                      "rounded-lg px-4 py-2 text-sm font-semibold transition " +
                      (on
                        ? "border border-line text-navy-700 hover:bg-navy-50"
                        : "bg-navy-800 text-white hover:bg-navy-700")
                    }
                  >
                    {on ? "Turn off" : "Turn on"}
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
