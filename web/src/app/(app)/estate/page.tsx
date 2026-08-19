import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  ESTATE_LINE,
  ESTATE_WORD,
  estateLine,
  groupEstate,
  type VentureLike,
} from "@/lib/estate";

export const dynamic = "force-dynamic";

/**
 * The estate — every division by what it is DOING.
 *
 * /empire lists divisions and their stages. This asks the harder question:
 * which are earning, which are being built, which are parked? The answer is
 * usually "more parked than you thought", and the page exists to say so.
 */
export default async function EstatePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ventures")
    .select("id, name, stage, status, progress, external_system")
    .order("name");

  const ventures = (data ?? []) as VentureLike[];
  const groups = groupEstate(ventures);

  return (
    <div className="max-w-[760px] mx-auto">
      <header className="mb-5">
        <p className="label">Empire</p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">The estate</h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">
          {estateLine(ventures)}
        </p>
        <p className="text-[0.78rem] mt-2">
          {/* This page asks what is earning; the portfolio asks which of
              them needs you today. Two questions, two pages. */}
          <Link href="/ventures" className="no-underline" style={{ color: "var(--accent)" }}>
            The portfolio, by tier and by what is slipping →
          </Link>
        </p>
      </header>

      <div className="grid gap-5">
        {groups.map((g) => (
          <section key={g.state}>
            <p className="label">
              {ESTATE_WORD[g.state]} · {g.ventures.length}
            </p>
            <p className="text-xs text-[var(--faint)] mt-1 mb-2.5">{ESTATE_LINE[g.state]}</p>

            {g.ventures.length === 0 ? (
              <div className="card p-4 text-sm text-[var(--muted)]">
                {g.state === "earning"
                  ? "Nothing here yet. That is the number this page exists to move."
                  : "Nothing in this state."}
              </div>
            ) : (
              <ul className="grid gap-2 list-none p-0 m-0">
                {g.ventures.map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/empire/${v.id}`}
                      className="card px-4 py-3 flex items-center gap-3 no-underline"
                    >
                      <span className="min-w-0 flex-1 truncate text-[0.94rem]">{v.name}</span>
                      <span className="chip shrink-0 text-xs">{v.stage}</span>
                      <span className="mono text-xs text-[var(--muted)] shrink-0 w-10 text-right">
                        {v.progress}%
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
