import { createClient } from "@/lib/supabase/server";
import { motivationFrom } from "@/lib/cockpit/motivation";
import AddMotivation from "@/components/AddMotivation";
import { Panel, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Motivation — the sheet's own words: "a thing you wrote, and when."
 * The cockpit widget on /dashboard shows the latest one line; this is
 * the whole log and the write box. Deliberately thin (no title, no
 * mood, no tags) — a second field is a second reason not to use it.
 */
export default async function MotivationPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("motivation")
    .select("id, body, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const entries = motivationFrom(
    (data ?? []) as { id: string; body: string; created_at: string }[]
  );

  return (
    <div className="grid gap-5 max-w-[640px]">
      <header>
        <p className="label">Life Plan · Motivation</p>
        <h1 className="text-[1.5rem] font-semibold mt-1.5">
          What&rsquo;s keeping you at it
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">
          One box, one tap. No title, no score — write it when it&rsquo;s true
          and it&rsquo;s here whenever it isn&rsquo;t.
        </p>
      </header>

      <Panel title="Write one">
        <AddMotivation />
      </Panel>

      <Panel title={`Everything written (${entries.length})`}>
        {entries.length === 0 ? (
          <Empty>Nothing yet. The box above is the whole floor.</Empty>
        ) : (
          <div className="grid gap-3">
            {entries.map((e) => (
              <div key={e.id} className="border-b border-[var(--border)] pb-3 last:border-none last:pb-0">
                <p className="text-[0.86rem] italic leading-relaxed">&ldquo;{e.body}&rdquo;</p>
                <p className="mono text-[0.62rem] text-[var(--faint)] mt-1">
                  {new Date(e.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
