/**
 * Graceful fallback shown when a page's data can't be read yet — typically
 * because a schema migration (prisma/sql/00N_*.sql) hasn't been applied to the
 * database. Prevents a hard 500 and tells admins exactly what to run.
 */
export function SetupNotice({
  module,
  files,
  isAdmin,
}: {
  module: string;
  files: string;
  isAdmin: boolean;
}) {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-10 text-center">
      <div className="text-sm font-medium text-ink">{module} is being set up.</div>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        {isAdmin
          ? "The database hasn't been updated for this section yet."
          : "This section will be available shortly. Please check back soon."}
      </p>
      {isAdmin ? (
        <p className="mx-auto mt-3 max-w-md text-xs text-muted">
          Admin: run <code className="rounded bg-navy-50 px-1 py-0.5 text-navy-800">{files}</code>{" "}
          in the Neon SQL editor to finish setup.
        </p>
      ) : null}
    </div>
  );
}
