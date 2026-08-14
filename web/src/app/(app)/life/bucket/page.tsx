import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Goal } from "@/lib/types";
import BucketList from "@/components/BucketList";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * THE BUCKET LIST — a horizon of its own
 *
 * Its own route since 2026-08-14: adding a wish and promoting one are
 * both DOING, and doing needs a place.
 *
 * It is not a table. A bucket-list item is a goal with no date and no
 * plan, carried as `goals.status = 'someday'`, and that is the whole
 * design — promoting one into a real goal is a single field change, so
 * the thing written down years ago becomes the thing being done without
 * being retyped. Same row, same id, same area, same anything already
 * hung off it.
 * ------------------------------------------------------------------ */

export default async function BucketPage() {
  const supabase = await createClient();

  const { data: goals } = await supabase
    .from("goals")
    .select("id, title, description, pillar_id, vision_id, target_date, progress, status")
    .order("created_at", { ascending: false });

  return (
    <div className="sys-life grid gap-5 max-w-[820px]">
      <header>
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="label">LIFE_OS · Standing</p>
          <Link href="/life" className="text-[0.72rem] no-underline text-[var(--muted)]">
            ← Standing
          </Link>
        </div>
        <h1 className="text-[1.6rem] font-semibold mt-1.5 leading-tight">Bucket list</h1>
        <p className="text-[0.84rem] text-[var(--muted)] mt-1.5 max-w-[62ch] leading-relaxed">
          Things worth doing once, with no date and no plan attached. Nothing
          here is late, because nothing here was promised — and any one of them
          becomes a real goal in a single tap when it is time.
        </p>
      </header>

      <BucketList goals={(goals ?? []) as Goal[]} />
    </div>
  );
}
