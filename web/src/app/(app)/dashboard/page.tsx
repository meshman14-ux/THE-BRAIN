import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  type Pillar,
  type SystemKey,
  SYSTEM_LABEL,
  SYSTEM_BLURB,
} from "@/lib/types";
import SeedPillars from "@/components/SeedPillars";
import { countsByPillar, isUntouched, areasFor } from "@/lib/logic";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = await createClient();

  const [{ data: pillars }, { data: goals }, { data: projects }, { data: tasks }] =
    await Promise.all([
      supabase
        .from("pillars")
        .select("id, system, name, emoji, standard, sort_order, active")
        .eq("active", true)
        .order("sort_order"),
      supabase.from("goals").select("pillar_id").eq("status", "active"),
      supabase.from("projects").select("pillar_id").eq("status", "active"),
      supabase.from("tasks").select("pillar_id").eq("status", "open"),
    ]);

  const all = (pillars ?? []) as Pillar[];

  // Nothing seeded yet — offer the one-tap initialise.
  if (all.length === 0) return <SeedPillars />;

  const counts = countsByPillar(goals ?? [], projects ?? [], tasks ?? []);
  const bySystem = (s: SystemKey) => areasFor(all, s);

  return (
    <div className="grid gap-9">
      <header>
        <p className="label">Command centre</p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">
          The thirteen pillars
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-[62ch] leading-relaxed">
          A pillar is a domain with a standard to maintain — it never gets ticked
          off. These are what the weekly review walks, and what tells you which
          part of your life has quietly gone unattended.
        </p>
      </header>

      {(["life", "empire"] as SystemKey[]).map((sys) => {
        const items = bySystem(sys);
        if (!items.length) return null;
        return (
          <section key={sys} className={sys === "life" ? "sys-life" : "sys-empire"}>
            <div className="flex items-baseline gap-3 mb-4">
              <h2
                className="text-sm font-bold tracking-[0.12em] uppercase"
                style={{ color: "var(--accent)" }}
              >
                {SYSTEM_LABEL[sys]}
              </h2>
              <span className="text-xs text-[var(--faint)]">
                {SYSTEM_BLURB[sys]}
              </span>
              <span className="ml-auto text-xs text-[var(--faint)]">
                {items.length} pillars
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((p) => {
                const c = counts[p.id] ?? { goals: 0, projects: 0, tasks: 0 };
                const untouched =
                  c.goals === 0 && c.projects === 0 && c.tasks === 0;
                return (
                  <Link
                    key={p.id}
                    href={`/pillar/${p.id}`}
                    className="card card-hover p-5 no-underline text-[var(--text)] block transition-colors relative overflow-hidden"
                  >
                    <span
                      aria-hidden
                      className="absolute left-0 top-0 bottom-0 w-[3px]"
                      style={{ background: "var(--accent)" }}
                    />
                    <div className="flex items-start gap-3">
                      <span className="text-2xl leading-none select-none">
                        {p.emoji ?? "◆"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-[0.98rem] leading-snug">
                          {p.name}
                        </h3>
                        {p.standard && (
                          <p className="text-[0.8rem] text-[var(--muted)] mt-1.5 leading-relaxed">
                            {p.standard}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mt-4 pt-3.5 border-t border-[var(--border)] text-[0.72rem]">
                      <Stat n={c.goals} label="goals" />
                      <Stat n={c.projects} label="projects" />
                      <Stat n={c.tasks} label="open" />
                      {untouched && (
                        <span className="ml-auto text-[var(--faint)]">
                          untouched
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}

      <footer className="card p-5 flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">Next: feed it something</p>
          <p className="text-[0.82rem] text-[var(--muted)] mt-1 leading-relaxed">
            The pillars are the frame. Capture is what makes them real — one box,
            no decisions, triage later.
          </p>
        </div>
        <Link href="/capture" className="btn no-underline">
          Capture a thought
        </Link>
      </footer>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <span className={n > 0 ? "text-[var(--text)]" : "text-[var(--faint)]"}>
      <b className="font-bold">{n}</b>{" "}
      <span className="text-[var(--faint)]">{label}</span>
    </span>
  );
}
