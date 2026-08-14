import { redirect } from "next/navigation";

/**
 * Debts is no longer a sibling of Money — it is a part of it.
 *
 * A creditor list filed NEXT TO a money page rather than inside it is how
 * you end up with two answers to "what do I owe", and the compression
 * into parent areas exists to stop exactly that.
 *
 * The route survives as a redirect rather than being deleted, because a
 * deleted route breaks every bookmark and reference-shelf entry pointing
 * at it. That is house rule 12, and it is here specifically because
 * LIFE_OS v2 step 1 broke it four times and had to be corrected.
 *
 * Accounts is a page under Money since 2026-08-14 — editing a balance is doing, and doing needs a place.
 */
export default function DebtsPage() {
  redirect("/life/money/accounts");
}
