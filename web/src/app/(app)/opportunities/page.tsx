import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Opportunity } from "@/lib/types";
import { toIso } from "@/lib/logic";
import DealBoard from "@/components/DealBoard";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * The deal board — Phase 5's second half.
 *
 * This route has existed since the mode switch was built, as a nav item
 * and a phone slot in EMPIRE mode pointing at a placeholder page that
 * said the view would exist one day. A placeholder that never delivers
 * is a promise broken on every page load, and the cost is paid by the
 * entries that do work — so the registry row leaves in the same commit
 * this page arrives in.
 *
 * It answers a different question from `/holdings`, which is why it is a
 * different page rather than a third tab: an asset is a thing you own
 * and the question is what it is worth; an opportunity is a thing you
 * are chasing and the question is whose move it is.
 * ------------------------------------------------------------------ */

export default async function Opportunities() {
  const supabase = await createClient();
  const today = toIso(new Date());

  const [{ data: oppRows }, { data: peopleRows }] = await Promise.all([
    supabase
      .from("opportunities")
      .select(
        "id, title, kind, stage, pillar_id, person_id, value_est, next_step, next_step_date, created_at"
      ),
    supabase.from("people").select("id, name").order("name"),
  ]);

  const opportunities = (oppRows ?? []) as Opportunity[];
  const people = (peopleRows ?? []) as { id: string; name: string }[];

  return (
    <div className="sys-empire grid gap-6 max-w-[900px]">
      <header>
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="label">EMPIRE_OS · Pipeline</p>
          <Link href="/empire" className="text-[0.72rem] no-underline text-[var(--muted)]">
            ← Divisions
          </Link>
        </div>
        <h1 className="text-[1.6rem] font-semibold mt-1.5 leading-tight">On the table</h1>
        <p className="text-[0.84rem] text-[var(--muted)] mt-1.5 max-w-[62ch] leading-relaxed">
          What is in play, what it would be worth, and — the part that decides
          whether it happens — what the next move is and when. Sorted by what has
          been waiting longest for one. Nothing here is weighted by a probability
          nobody has measured: the open total is a floor, and it says how many
          deals carry no estimate.
        </p>
      </header>

      <DealBoard opportunities={opportunities} people={people} today={today} />
    </div>
  );
}
