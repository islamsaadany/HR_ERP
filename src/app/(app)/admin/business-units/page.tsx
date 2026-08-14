import { redirect } from "next/navigation";

// Business units are now managed on the merged Branding screen (spec 024 follow-up).
// Keep this route as a redirect so old links/bookmarks still land in the right place.
export default function AdminBusinessUnitsRedirect() {
  redirect("/admin/brand");
}
