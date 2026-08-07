import { requireSuperUser } from "@/lib/roles";
import { getBrand } from "@/lib/brand";
import { updateBrand, resetBrand } from "./actions";
import { BackLink } from "@/components/admin/BackLink";

export const dynamic = "force-dynamic";

export default async function AdminBrandPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireSuperUser();
  const { saved, error } = await searchParams;
  const brand = await getBrand();

  const label = "block text-xs font-medium uppercase tracking-wide text-muted mb-1";
  const input =
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

  return (
    <div className="max-w-2xl">
      <BackLink href="/admin" label="Admin" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · Brand</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Branding</h1>
      <p className="mt-1 text-muted">
        Set this deployment&apos;s company name, logo, and brand colors. Changes apply across the app.
      </p>

      {saved ? (
        <p className="mt-4 rounded-lg bg-navy-50 px-4 py-3 text-sm text-navy-700">Brand saved.</p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <form action={updateBrand} className="mt-6 space-y-5 rounded-xl border border-line bg-surface p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Company name</label>
            <input name="companyName" defaultValue={brand.companyName} required className={input} />
          </div>
          <div>
            <label className={label}>Short name (eyebrow / initial)</label>
            <input name="shortName" defaultValue={brand.shortName} required className={input} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Primary color (main surfaces)</label>
            <div className="flex items-center gap-2">
              <input type="color" name="primaryColor" defaultValue={brand.primaryColor} className="h-10 w-14 rounded border border-line bg-surface" />
              <span className="text-sm text-muted tabular-nums">{brand.primaryColor}</span>
            </div>
          </div>
          <div>
            <label className={label}>Accent color (highlights)</label>
            <div className="flex items-center gap-2">
              <input type="color" name="accentColor" defaultValue={brand.accentColor} className="h-10 w-14 rounded border border-line bg-surface" />
              <span className="text-sm text-muted tabular-nums">{brand.accentColor}</span>
            </div>
          </div>
        </div>

        <div>
          <label className={label}>Logo (optional, image ≤ 2MB — replaces the wordmark)</label>
          {brand.logoUrl ? (
            <div className="mb-2 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={brand.logoUrl} alt="Current logo" className="h-10 max-w-[160px] rounded bg-navy-800 object-contain p-1" />
              <label className="flex items-center gap-1.5 text-sm text-muted">
                <input type="checkbox" name="removeLogo" className="h-4 w-4" /> Remove logo
              </label>
            </div>
          ) : null}
          <input type="file" name="logo" accept="image/*" className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-navy-700" />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-700">
            Save brand
          </button>
        </div>
      </form>

      <form action={resetBrand} className="mt-4">
        <button className="text-sm font-medium text-muted underline underline-offset-2 hover:text-red-600">
          Reset to Forefront defaults
        </button>
      </form>

      <p className="mt-4 text-xs text-muted">
        Tip: pick a <strong>primary</strong> (your main brand color — becomes the sidebar/buttons) and an
        <strong> accent</strong> (highlights). Each is expanded into a full tint/shade scale automatically.
        Leaving the Forefront defaults keeps the original navy/gold look.
      </p>
    </div>
  );
}
