import { redirect } from "next/navigation";

/**
 * Health became BODY on 2026-08-14.
 *
 * Readiness is looking rather than doing, so it is a filter on Body
 * rather than a page of its own — and this address, which was the whole
 * module, now lands on the parent that contains it.
 */
export default function HealthPage() {
  redirect("/life/body");
}
