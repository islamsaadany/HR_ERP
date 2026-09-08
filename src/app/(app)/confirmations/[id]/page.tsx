import { redirect } from "next/navigation";

/** Moved under Payments on 2026-09-08 — see ../page.tsx. The id is carried across untouched. */
export default async function ConfirmationMoved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/finance/confirmations/${encodeURIComponent(id)}`);
}
