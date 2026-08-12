/* ------------------------------------------------------------------ *
 * Food — the meal library's rules
 *
 * Fifty meals, seeded from the food-module pass (migration
 * 20260811222457_meals, already applied). The module's one principle:
 * protein first, because Nutrition & Recovery's standard is "eat and
 * sleep like someone with plans" and Training is the keystone habit.
 * House rule enforced at seed time: no beef in any recipe, verified
 * against the ingredient rows rather than the category label.
 * ------------------------------------------------------------------ */

import type { Meal } from "./types";

/** Prototype thresholds, kept as constants so the chips and the tests
 *  cannot drift apart. */
export const QUICK_MAX_MIN = 25;
export const HIGH_PROTEIN_MIN = 40;

/**
 * Prep plus cook. Null when NEITHER is known — a meal with no timing
 * shows a dash and fails the "quick" filter rather than passing it on a
 * zero that was actually a shrug.
 */
export function totalMin(
  m: Pick<Meal, "prep_min" | "cook_min">
): number | null {
  if (m.prep_min == null && m.cook_min == null) return null;
  return (m.prep_min ?? 0) + (m.cook_min ?? 0);
}

/** Categories by size, biggest shelf first, ties alphabetical. */
export function mealCategories(
  meals: Pick<Meal, "category">[]
): string[] {
  const counts = new Map<string, number>();
  for (const m of meals) counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([c]) => c);
}

export type MealFilter = {
  category: string | null;
  quick: boolean;
  batch: boolean;
  highProtein: boolean;
  /** Lowercased needle; matched against the caller-built haystack. */
  q: string;
};

export const NO_FILTER: MealFilter = {
  category: null,
  quick: false,
  batch: false,
  highProtein: false,
  q: "",
};

/**
 * Every active filter must pass — they compose rather than replace each
 * other (a superset of the prototype, which allowed one at a time).
 * Nullable figures fail the filters that need them: an untimed meal is
 * not "under 25 minutes", it is unmeasured.
 */
export function filterMeals<
  T extends Pick<Meal, "category" | "prep_min" | "cook_min" | "protein_g" | "tags"> & {
    haystack: string;
  }
>(meals: T[], f: MealFilter): T[] {
  const needle = f.q.trim().toLowerCase();
  return meals.filter((m) => {
    if (f.category != null && m.category !== f.category) return false;
    if (f.quick) {
      const t = totalMin(m);
      if (t == null || t > QUICK_MAX_MIN) return false;
    }
    if (f.batch && !m.tags.includes("batch")) return false;
    if (f.highProtein && (m.protein_g == null || m.protein_g < HIGH_PROTEIN_MIN))
      return false;
    if (needle !== "" && !m.haystack.includes(needle)) return false;
    return true;
  });
}

/**
 * The shelf order: favourites first (Jay's own claim outranks the
 * arithmetic), then protein descending because that is the module's
 * principle, then quicker before slower, then the alphabet as a last
 * resort. Null protein sorts below every measured value — unmeasured is
 * not zero, but it has not earned a high shelf either.
 */
export function sortMeals<
  T extends Pick<
    Meal,
    "name" | "favourite" | "protein_g" | "prep_min" | "cook_min"
  >
>(meals: T[]): T[] {
  return [...meals].sort((a, b) => {
    if (a.favourite !== b.favourite) return a.favourite ? -1 : 1;
    const ap = a.protein_g ?? -1;
    const bp = b.protein_g ?? -1;
    if (ap !== bp) return bp - ap;
    const at = totalMin(a) ?? Number.MAX_SAFE_INTEGER;
    const bt = totalMin(b) ?? Number.MAX_SAFE_INTEGER;
    if (at !== bt) return at - bt;
    return a.name.localeCompare(b.name);
  });
}

/**
 * "700g lamb mince" · "2tbsp red pepper paste" · "1 onion" — the
 * prototype's exact spelling: quantity and unit run together, a space
 * before the item, and a bare item when nothing was quantified.
 * PostgREST returns numerics as strings, so qty is normalised first.
 */
export function ingredientLine(i: {
  item: string;
  qty: number | string | null;
  unit: string | null;
}): string {
  const qty =
    i.qty == null
      ? null
      : typeof i.qty === "string"
        ? Number(i.qty)
        : i.qty;
  if (qty == null || Number.isNaN(qty)) return i.item;
  const n = Number.isInteger(qty) ? String(qty) : String(qty);
  return i.unit == null ? `${n} ${i.item}` : `${n}${i.unit} ${i.item}`;
}

/** "50 of 50", honest at every count. */
export function mealCount(shown: number, total: number): string {
  return `${shown} of ${total}`;
}
