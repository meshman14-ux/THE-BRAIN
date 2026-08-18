import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { motivationFrom } from "./motivation";
import type { MotivationEntry } from "./types";

/**
 * The only file that touches the database for anything genuinely new to
 * the cockpit (constraint 2). Everything else `/dashboard` renders is
 * fetched by `page.tsx` itself, exactly as it was before this rebuild —
 * see the header comment in `types.ts` for why that boundary is drawn
 * here rather than around the whole page.
 */
export async function loadMotivation(
  supabase: SupabaseClient,
  limit = 5
): Promise<MotivationEntry[]> {
  const { data } = await supabase
    .from("motivation")
    .select("id, body, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return motivationFrom(
    (data ?? []) as { id: string; body: string; created_at: string }[]
  );
}
