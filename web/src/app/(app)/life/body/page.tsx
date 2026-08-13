import HealthPage from "../health/page";
import FoodPage from "../food/page";
import { ParentHeader, ParentSection } from "@/components/ParentShell";
import { normaliseView, parentById } from "@/lib/parents";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * BODY — Health and Food, which were always one question
 *
 * Nutrition is an INPUT to readiness, not a neighbour of it. Filing them
 * as sibling routes is why fifty meals sat in a library that the
 * readiness score could not see, and it took a deliberate pass to wire
 * the kitchen into the engine that needed it.
 *
 * The two existing pages are COMPOSED rather than rewritten. Each is
 * already a self-contained async server component that fetches its own
 * data, so nesting them costs nothing and — more to the point — means the
 * compression cannot break what currently works. Both old routes still
 * answer at their own addresses.
 *
 * Training is deliberately not a third section. It is the keystone habit,
 * it lives on Standing with the other seven areas, and it fills itself
 * from the watch rather than from a tap. Giving it a second home is how
 * the nightly reflection ended up with three and happened in none.
 * ------------------------------------------------------------------ */

export default async function BodyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const parent = parentById("body")!;
  const view = normaliseView(parent, sp.tab);

  return (
    <div className="sys-life grid gap-7 max-w-[900px]">
      <ParentHeader
        parent={parent}
        view={view}
        line="Readiness and fuel, in one place."
        working="Both halves fill themselves — readiness from the watch, fuel from the meals you mark cooked. Nothing on this page needs typing, which is why it will still be true in December."
      />

      <ParentSection id="readiness" title="Readiness" view={view}>
        <HealthPage />
      </ParentSection>

      <ParentSection id="food" title="Food" view={view}>
        <FoodPage />
      </ParentSection>
    </div>
  );
}
