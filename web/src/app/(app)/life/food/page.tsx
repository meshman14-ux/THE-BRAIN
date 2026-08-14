import { redirect } from "next/navigation";

/** Nutrition is an INPUT to readiness, not a neighbour of it — Food is
 *  part of Body. House rule 12: redirect, never delete. */
export default function FoodPage() {
  redirect("/life/body/food");
}
