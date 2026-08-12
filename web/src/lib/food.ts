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

/* ------------------------------------------------------------------ *
 * The week plan — a pool that can be pinned, never a grid that nags
 *
 * Hybrid by design (Jay's spec, 2026-08-12): picking a meal puts it in
 * THIS WEEK'S POOL with one tap; pinning it to a day and slot is
 * optional, always. An unpinned meal is not an unfinished plan — it is
 * a decision to keep the evening flexible, and the shopping list serves
 * the whole pool either way.
 *
 * The plan lives in `meals.meta.plan` keyed by the week's Monday — the
 * decision-5 pattern (`journal.meta.hours` holds day plans the same
 * way), so no migration. A plan from a previous week simply stops
 * counting; picking again overwrites it. Nothing needs a cleanup job —
 * staleness is derived, the dormancy philosophy.
 * ------------------------------------------------------------------ */

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const PLAN_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type PlanDay = (typeof PLAN_DAYS)[number];

/** One planned cooking of a meal: in the pool, or pinned to a slot. */
export type MealPick = { day: PlanDay | null; slot: MealSlot | null };

/**
 * `meta` is jsonb — validate, never trust (§A7). A pick pinned to a day
 * it half-remembers (day without slot, or an unknown token) degrades to
 * the pool rather than crashing or guessing a mealtime.
 */
export function readPlan(meta: unknown, monday: string): MealPick[] {
  if (typeof meta !== "object" || meta == null) return [];
  const plan = (meta as { plan?: unknown }).plan;
  if (typeof plan !== "object" || plan == null) return [];
  const p = plan as { week?: unknown; picks?: unknown };
  if (p.week !== monday) return []; // last week's plan is not this week's
  if (!Array.isArray(p.picks)) return [];
  return p.picks.map((raw): MealPick => {
    if (typeof raw !== "object" || raw == null) return { day: null, slot: null };
    const day = (raw as { day?: unknown }).day;
    const slot = (raw as { slot?: unknown }).slot;
    const validDay = PLAN_DAYS.includes(day as PlanDay) ? (day as PlanDay) : null;
    const validSlot = MEAL_SLOTS.includes(slot as MealSlot) ? (slot as MealSlot) : null;
    // Half a pin is no pin: both or neither.
    return validDay != null && validSlot != null
      ? { day: validDay, slot: validSlot }
      : { day: null, slot: null };
  });
}

/** The meta patch that stores `picks` for `monday`, clobbering nothing else. */
export function withPlan(
  meta: unknown,
  monday: string,
  picks: MealPick[]
): Record<string, unknown> {
  const held =
    typeof meta === "object" && meta != null
      ? (meta as Record<string, unknown>)
      : {};
  if (picks.length === 0) {
    const { plan: _drop, ...rest } = held;
    return rest;
  }
  return { ...held, plan: { week: monday, picks } };
}

/* ------------------------------------------------------------------ *
 * The shopping list — derived from the pool, never typed
 * ------------------------------------------------------------------ */

export const SHOP_SECTIONS = [
  "Meat & Fish",
  "Fruit & Veg",
  "Dairy & Eggs",
  "Bakery",
  "Frozen",
  "Cupboard",
] as const;
export type ShopSection = (typeof SHOP_SECTIONS)[number];

const SECTION_RULES: [ShopSection, RegExp][] = [
  ["Frozen", /\bfrozen\b/],
  [
    "Meat & Fish",
    /\b(chicken|lamb|mince|chorizo|guanciale|pancetta|prawn|salmon|fish|haddock|tuna|sea bass|anchov)\w*/,
  ],
  [
    "Dairy & Eggs",
    /\b(egg|milk|butter|yoghurt|cream|feta|cheddar|paneer|pecorino|cheese|ghee)\w*/,
  ],
  ["Bakery", /\b(flatbread|tortilla|pitta|bun|bread|loaf)\w*/],
  [
    "Fruit & Veg",
    /\b(onion|garlic|pepper|tomato|cucumber|lemon|lime|ginger|fennel|cabbage|carrot|broccoli|potato|avocado|mushroom|leaves|celery|squash|aubergine|pak choi|mangetout|beansprout|spring onion|chilli|chillies|coriander|parsley|mint|thyme|basil|olives?|apricot|pomegranate|sweetcorn|green bean|peas in pod|leek|courgette|kale|spinach)\w*/,
  ],
];

/**
 * Where an item lives in the shop. Keyword rules over the seed's ~190
 * distinct items; anything unrecognised lands in Cupboard, which is
 * where an unclassified packet ends up in real shops too. Frozen wins
 * before Veg so "frozen peas" is not sent to the vegetable aisle;
 * fresh chillies and herbs beat Cupboard by the same ordering.
 */
export function sectionOf(item: string): ShopSection {
  const s = item.toLowerCase();
  for (const [section, re] of SECTION_RULES) if (re.test(s)) return section;
  return "Cupboard";
}

export type ShopLine = {
  section: ShopSection;
  item: string;
  unit: string | null;
  /** Summed quantity across every planned cooking; null when unquantified. */
  qty: number | null;
  /** How many planned cookings want it — shown when qty is null. */
  count: number;
  /** Which meals it serves, for the "why is this here" glance. */
  meals: string[];
};

type PlannedMeal = {
  name: string;
  /** How many times this meal is planned this week. */
  times: number;
  ingredients: { item: string; qty: number | string | null; unit: string | null; optional: boolean }[];
};

/**
 * The pool's ingredients, merged. Same item + same unit = one line with
 * the quantities summed — 700g and 600g of lamb mince is 1.3kg, once. A
 * meal planned twice wants its ingredients twice. Different units never
 * merge (4 tbsp olive oil and 100ml olive oil stay two lines — pretending
 * to convert them would be a guess wearing a calculator). Optional
 * ingredients are kept and marked by the caller if wanted; a shopping
 * list that silently drops the tahini is how the falafel goes undressed.
 */
export function shoppingList(planned: PlannedMeal[]): ShopLine[] {
  const lines = new Map<string, ShopLine>();
  for (const m of planned) {
    if (m.times <= 0) continue;
    for (const i of m.ingredients) {
      const qty =
        i.qty == null ? null : typeof i.qty === "string" ? Number(i.qty) : i.qty;
      const cleanQty = qty != null && !Number.isNaN(qty) ? qty : null;
      const key = `${i.item.trim().toLowerCase()}|${i.unit ?? ""}`;
      const held = lines.get(key);
      if (held) {
        held.count += m.times;
        held.qty =
          held.qty == null || cleanQty == null
            ? null
            : held.qty + cleanQty * m.times;
        if (!held.meals.includes(m.name)) held.meals.push(m.name);
      } else {
        lines.set(key, {
          section: sectionOf(i.item),
          item: i.item,
          unit: i.unit,
          qty: cleanQty == null ? null : cleanQty * m.times,
          count: m.times,
          meals: [m.name],
        });
      }
    }
  }
  return [...lines.values()].sort((a, b) => {
    const s =
      SHOP_SECTIONS.indexOf(a.section) - SHOP_SECTIONS.indexOf(b.section);
    if (s !== 0) return s;
    return a.item.localeCompare(b.item);
  });
}

/** "1.3kg" · "700g" · "3tbsp" · "×2" — grams and millilitres roll up at 1000. */
export function formatShopQty(line: Pick<ShopLine, "qty" | "unit" | "count">): string {
  if (line.qty == null) return line.count > 1 ? `×${line.count}` : "";
  const rounded = Math.round(line.qty * 100) / 100;
  if (line.unit === "g" && rounded >= 1000)
    return `${Math.round((rounded / 1000) * 100) / 100}kg`;
  if (line.unit === "ml" && rounded >= 1000)
    return `${Math.round((rounded / 1000) * 100) / 100}l`;
  return line.unit == null ? `${rounded}` : `${rounded}${line.unit}`;
}

/** The list as plain text, grouped — for the copy button. */
export function listAsText(lines: ShopLine[], weekLabel: string): string {
  const out: string[] = [`Shopping list · week of ${weekLabel}`];
  for (const section of SHOP_SECTIONS) {
    const rows = lines.filter((l) => l.section === section);
    if (rows.length === 0) continue;
    out.push("", section.toUpperCase());
    for (const l of rows) {
      const q = formatShopQty(l);
      out.push(`- ${q ? `${q} ` : ""}${l.item}`);
    }
  }
  return out.join("\n");
}
