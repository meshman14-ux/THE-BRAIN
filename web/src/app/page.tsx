import { redirect } from "next/navigation";

export default function Root() {
  // Middleware guards auth; signed-in users land on the dashboard.
  redirect("/dashboard");
}
