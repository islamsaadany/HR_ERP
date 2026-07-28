import { requireAdmin } from "@/lib/roles";
import { ComingSoon } from "@/components/ComingSoon";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireAdmin();
  return (
    <ComingSoon
      eyebrow="Admin"
      title="HR Admin"
      body="Manage the employee registry, onboarding content, benefits configuration, and more."
    />
  );
}
