import { redirect } from "next/navigation";

export default function Home() {
  // The app lives behind auth; the (app) layout handles the redirect to /signin.
  redirect("/dashboard");
}
