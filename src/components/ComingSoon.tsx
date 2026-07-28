export function ComingSoon({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        {eyebrow}
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">{title}</h1>
      <p className="mt-2 max-w-2xl text-muted">{body}</p>
      <div className="mt-8 rounded-xl border border-dashed border-line bg-surface p-10 text-center">
        <p className="text-sm font-medium text-ink">Coming soon</p>
        <p className="mt-1 text-sm text-muted">
          This module is specified and next in the build queue.
        </p>
      </div>
    </div>
  );
}
