import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  toIso,
  cadenceWatchtower,
  occasions,
  rosterProgress,
  nextToSet,
  ROSTER_TARGET,
  type PersonRow,
} from "@/lib/logic";
import People from "@/components/People";
import AddPerson from "@/components/AddPerson";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * Family, friends and network.
 *
 * The three things Jay asked for, stacked: cadence watchtower as the hero,
 * occasions strip, depth notes as an optional ceiling.
 *
 * Cadence defaults follow Dunbar's layers because the layers ARE contact
 * frequencies — roughly 5 people weekly, 15 monthly, 50 quarterly, the rest
 * yearly. That makes the seeding question answerable instantly ("how close
 * is this person") rather than requiring arithmetic ("how often should I
 * ring them"), which is the difference between a roster that gets built in
 * one sitting and one that never does.
 * ------------------------------------------------------------------ */

export default async function PeoplePage() {
  const supabase = await createClient();
  const today = toIso(new Date());

  const { data } = await supabase
    .from("people")
    .select("id, name, relationship, last_contact, cadence_days, birthday")
    .order("name");

  const people = (data ?? []) as PersonRow[];
  const watch = cadenceWatchtower(people, today);
  const upcoming = occasions(people, today);
  const roster = rosterProgress(people);
  const next = nextToSet(people);

  return (
    <div className="grid gap-5 max-w-[820px]">
      <header>
        <h1 className="text-[1.5rem] font-semibold leading-tight">
          Family, friends &amp; network
        </h1>
        <p className="text-[0.84rem] text-[var(--muted)] mt-1.5 leading-relaxed max-w-[62ch]">
          The system can only tell you somebody has drifted if you have told
          it how often you meant to be in touch. That is the one thing worth
          setting up here, and it is a tap per person.
        </p>
      </header>

      {/* -- the seeding session ------------------------------------ *
       *
       * One question at a time, exactly as the division onboarder works.
       * The bar is set on cadences rather than on names because five
       * people with cadences beats fifteen names with none — it is a
       * floor, not a finish line, and the page never says "complete".
       */}
      {!roster.useful && (
        <section className="panel grid gap-3" style={{ borderColor: "var(--accent)" }}>
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="label" style={{ color: "var(--accent)" }}>
              Set up the roster
            </h2>
            <span className="text-[0.7rem] text-[var(--faint)]">
              {roster.withCadence} of {roster.named} named ·{" "}
              {ROSTER_TARGET} is a full roster
            </span>
          </div>
          <p className="text-[0.84rem] text-[var(--muted)] leading-relaxed">
            {next
              ? `Next: how close is ${next.name}? Tap a tier on their row below and the cadence is set — no form, nothing to save.`
              : "Add the people you would actually notice drifting. Fifteen is a relationship practice; a hundred is a database."}
          </p>
          <div className="flex gap-1 mt-0.5" role="presentation">
            {Array.from({ length: ROSTER_TARGET }, (_, i) => (
              <span
                key={i}
                className="h-[5px] flex-1 rounded-full"
                style={{
                  background:
                    i < roster.withCadence
                      ? "var(--accent)"
                      : i < roster.named
                        ? "var(--border-bright)"
                        : "var(--border)",
                }}
              />
            ))}
          </div>
        </section>
      )}

      <AddPerson />

      <People
        people={people}
        watch={watch}
        occasionList={upcoming}
        today={today}
      />

      <p className="text-[0.76rem] text-[var(--faint)] leading-relaxed max-w-[62ch]">
        Cadence defaults come from Dunbar&apos;s layers, which are defined by
        contact frequency in the first place — about weekly for the inner
        five, monthly for the close fifteen, quarterly for the fifty, yearly
        beyond. Every one of them is a starting point you can overrule per
        person.{" "}
        <Link
          href="/life"
          className="font-semibold no-underline"
          style={{ color: "var(--accent)" }}
        >
          Back to LIFE_OS
        </Link>
      </p>
    </div>
  );
}
