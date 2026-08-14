import { redirect } from "next/navigation";

/** Health became Body on 2026-08-14. Redirect, never delete. */
export default function TrainPage() {
  redirect("/life/body/train");
}
