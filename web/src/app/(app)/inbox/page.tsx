import { createClient } from "@/lib/supabase/server";
import Triage from "@/components/Triage";
import type { InboxItem, Pillar } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const supabase = await createClient();

  const [{ data: items }, { data: pillars }] = await Promise.all([
    supabase
      .from("inbox")
      .select("id, raw_text, captured_at, status")
      .eq("status", "open")
      .order("captured_at", { ascending: true }),
    supabase
      .from("pillars")
      .select("id, system, name, emoji, standard, sort_order, active")
      .eq("active", true)
      .order("sort_order"),
  ]);

  return (
    <div className="max-w-[760px] mx-auto">
      <header className="mb-5">
        <p className="label">Daily ritual · ~5 minutes</p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">Triage</h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">
          Every item gets a home or gets binned. Empty inbox is the goal — this is
          the one ritual the whole system depends on.
        </p>
      </header>

      <Triage
        items={(items ?? []) as InboxItem[]}
        pillars={(pillars ?? []) as Pillar[]}
      />
    </div>
  );
}
