import { redirect } from "next/navigation";

/** People became Family on 2026-08-18. Redirect, never delete. */
export default function PeoplePage() {
  redirect("/life/family");
}
