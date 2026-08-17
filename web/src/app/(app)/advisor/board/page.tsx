import { createClient } from "@/lib/supabase/server";
import SurfaceTabs from "@/components/SurfaceTabs";
import AdvisorBoard from "@/components/AdvisorBoard";
import { ASK_VIEWS } from "@/lib/surfaces";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const supabase = await createClient();
  const { data: seats } = await supabase
    .from("advisor_seats")
    .select("key, name, brief, bias")
    .eq("active", true)
    .order("key");

  return (
    <div className="max-w-[760px] mx-auto">
      <SurfaceTabs label="Ask" views={ASK_VIEWS} active="board" />
      <header className="mb-5">
        <p className="label">Ask</p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">The board</h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">
          Three to five seats, cast for the question and told to disagree. They
          argue from your real numbers, the Sceptic always sits, and the dissent
          is kept beside the verdict — because the useful question later is
          whether whoever objected was right.
        </p>
      </header>

      <AdvisorBoard seats={(seats ?? []) as { key: string; name: string; brief: string; bias: string }[]} />
    </div>
  );
}
