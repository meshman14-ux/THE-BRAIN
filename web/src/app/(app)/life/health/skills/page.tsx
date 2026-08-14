import { redirect } from "next/navigation";

/** Health became Body on 2026-08-14. Redirect, never delete. */
export default function SkillsPage() {
  redirect("/life/body/skills");
}
