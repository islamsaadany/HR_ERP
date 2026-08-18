import { redirect } from "next/navigation";

/**
 * The standalone release page moved into Admin → Benefits → "Exceptional releases"
 * (2026-08-18, user request) — the sheet now lives beside the per-person grants it
 * belongs with. This stub keeps old links working.
 */
export default function BenefitReleasePage() {
  redirect("/admin/benefits");
}
