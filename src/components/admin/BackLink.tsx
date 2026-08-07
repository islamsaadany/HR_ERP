import Link from "next/link";

/**
 * Shared admin back link (spec 015). Steps up one structural level to an explicit parent
 * path (not browser history). Reuses the existing muted "←" style from /admin/modules so
 * every admin page looks and behaves the same. The Admin home has no back link.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-3 inline-block text-sm text-muted hover:text-ink"
    >
      ← {label}
    </Link>
  );
}
