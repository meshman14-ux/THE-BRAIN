import { redirect } from "next/navigation";

/** Body became Health on 2026-08-18. Redirect, never delete. */
export default function FoodPage() {
  redirect("/life/health/food");
}
