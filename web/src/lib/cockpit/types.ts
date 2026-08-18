/**
 * THE BRAIN cockpit — contracts for the /dashboard HUD rebuild.
 *
 * This is deliberately NOT a full re-derivation of everything `/dashboard`
 * already computes. `page.tsx` already assembles the command centre's real
 * data correctly, from `logic.ts`/`lifeos.ts`/`oneline.ts`/`boardserver.ts`
 * — the same pure functions `/life` and `/empire` themselves call — and the
 * cockpit-dashboard spec's own rule is "the advisor reads the SAME contract
 * the page reads, never a second query." Rebuilding that derivation a
 * second time under `lib/cockpit/` would be exactly the drift risk §A2
 * exists to prevent: two copies of the same figure that disagree within a
 * month.
 *
 * So the boundary here is narrower than the spec's own file list implies:
 * `lib/cockpit/` owns what is genuinely NEW to the cockpit (Motivation,
 * the widget manifest, the motion-level contract) and takes everything
 * else as props, exactly as `NowTab.tsx` already does. `queries.ts` is
 * still the only file that touches the database for the NEW pieces.
 */

export type MotivationEntry = {
  id: string;
  body: string;
  createdAt: string;
};

/** A widget's place in the manifest — identity only, never derived data. */
export type CockpitWidget = {
  id: string;
  title: string;
  /** Which half of the split it renders in. */
  column: "today" | "system";
  /** At most one widget per manifest may emit — see `assertSingleEmitter`. */
  emits?: boolean;
};

export type CockpitManifest = {
  name: string;
  widgets: CockpitWidget[];
};

/**
 * Constraint 1 from the spec: "One CockpitShell primitive, three
 * manifests. `assertSingleEmitter()` throws in dev if a manifest declares
 * two emitting panels." Only the `/brain` manifest exists yet — `/life`
 * and `/empire` are phases 2 and 3 — but the guard is written once, here,
 * so every future manifest is checked the same way.
 *
 * "Emits" means the one widget allowed to carry ambient motion/glow as a
 * SIGNAL (constraint 4: "glow is a signal, not a texture... emission on
 * exactly one"). Two emitting widgets on one screen would mean two things
 * are shouting at once, which is the same failure as no signal at all.
 */
export function assertSingleEmitter(manifest: CockpitManifest): void {
  if (process.env.NODE_ENV === "production") return;
  const emitters = manifest.widgets.filter((w) => w.emits);
  if (emitters.length > 1) {
    throw new Error(
      `cockpit manifest "${manifest.name}" declares ${emitters.length} emitting widgets ` +
        `(${emitters.map((w) => w.id).join(", ")}) — exactly one is allowed.`
    );
  }
}
