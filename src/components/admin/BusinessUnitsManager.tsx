"use client";

import { BrandColorField } from "@/components/admin/BrandColorField";
import {
  addBusinessUnit,
  updateBusinessUnit,
  removeBusinessUnit,
} from "@/app/(app)/admin/business-units/actions";

export type ManagedUnit = {
  id: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  inUse: number;
};

const L = "block text-xs font-medium uppercase tracking-wide text-muted mb-1";
const I =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

export function BusinessUnitsManager({ units }: { units: ManagedUnit[] }) {
  return (
    <div className="mt-6 space-y-4">
      {units.map((u) => (
        <div key={u.id} className="rounded-xl border border-line bg-surface p-5">
          <div className="mb-4 flex items-center gap-3">
            {u.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/business-units/${u.id}/logo?v=${encodeURIComponent(u.logoUrl.split("/").pop() ?? "1")}`}
                alt={u.name}
                className="h-10 w-10 rounded-md bg-navy-800 object-contain p-1"
              />
            ) : (
              <div
                className="grid h-10 w-10 place-items-center rounded-md font-serif text-lg text-white"
                style={{ background: u.primaryColor }}
              >
                {u.shortName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate font-serif text-lg text-ink">{u.name}</div>
              <div className="text-xs text-muted">
                {u.inUse} employee{u.inUse === 1 ? "" : "s"}
              </div>
            </div>
          </div>

          <form action={updateBusinessUnit} encType="multipart/form-data" className="space-y-4">
            <input type="hidden" name="id" value={u.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={L}>Company / app name</label>
                <input name="name" defaultValue={u.name} required className={I} />
              </div>
              <div>
                <label className={L}>Short name</label>
                <input name="shortName" defaultValue={u.shortName} required className={I} />
              </div>
              <BrandColorField name="primaryColor" label="Primary color" defaultValue={u.primaryColor} />
              <BrandColorField name="accentColor" label="Accent color" defaultValue={u.accentColor} />
            </div>

            <div>
              <label className={L}>Logo (optional, image ≤ 2MB — replaces the wordmark)</label>
              {u.logoUrl ? (
                <label className="mb-2 flex items-center gap-1.5 text-sm text-muted">
                  <input type="checkbox" name="removeLogo" className="h-4 w-4" /> Remove logo
                </label>
              ) : null}
              <input
                type="file"
                name="logo"
                accept="image/*"
                className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-navy-700"
              />
            </div>

            <button className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-700">
              Save
            </button>
          </form>

          <form action={removeBusinessUnit} className="mt-3">
            <input type="hidden" name="id" value={u.id} />
            <button
              disabled={u.inUse > 0}
              title={u.inUse > 0 ? "Employees are assigned to this unit" : undefined}
              className="text-sm font-medium text-muted underline underline-offset-2 hover:text-red-600 disabled:cursor-not-allowed disabled:text-line disabled:no-underline"
            >
              Remove unit
            </button>
            {u.inUse > 0 ? (
              <span className="ml-2 text-xs text-muted">(blocked while employees are assigned)</span>
            ) : null}
          </form>
        </div>
      ))}

      <form
        action={addBusinessUnit}
        className="flex items-center gap-2 rounded-xl border border-dashed border-navy-200 bg-surface p-4"
      >
        <input name="name" placeholder="New business unit name…" required className={I + " flex-1"} />
        <button className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-700">
          Add unit
        </button>
      </form>
    </div>
  );
}
