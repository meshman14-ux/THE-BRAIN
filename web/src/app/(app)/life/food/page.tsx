import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Meal, MealIngredient } from "@/lib/types";
import { toIso } from "@/lib/logic";
import Meals, { type MealCard } from "@/components/Meals";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * The meal library — fifty meals, seeded from the food-module pass,
 * protein first because Nutrition & Recovery serves Training. House
 * rule enforced at seed time: no beef in any recipe, verified against
 * the ingredient rows rather than the category label.
 */
export default async function FoodPage() {
  const supabase = await createClient();

  const [{ data: mealRows }, { data: ingredientRows }] = await Promise.all([
    supabase
      .from("meals")
      .select(
        "id, name, slug, category, cuisine, image_url, servings, prep_min, cook_min, protein_g, kcal, estimates, tags, method, favourite, last_cooked_on, times_cooked"
      )
      .order("protein_g", { ascending: false }),
    supabase
      .from("meal_ingredients")
      .select("meal_id, item, qty, unit, sort_order, optional")
      .order("sort_order"),
  ]);

  const meals = (mealRows ?? []) as Meal[];
  const ingredients = (ingredientRows ?? []) as MealIngredient[];
  const byMeal = new Map<string, MealIngredient[]>();
  for (const i of ingredients) {
    (byMeal.get(i.meal_id) ?? byMeal.set(i.meal_id, []).get(i.meal_id)!).push(i);
  }

  const cards: MealCard[] = meals.map((m) => {
    const ing = byMeal.get(m.id) ?? [];
    return {
      ...m,
      ingredients: ing.map(({ item, qty, unit, optional }) => ({
        item,
        qty,
        unit,
        optional,
      })),
      haystack: [
        m.name,
        m.cuisine ?? "",
        m.category,
        ...m.tags,
        ...ing.map((i) => i.item),
      ]
        .join(" ")
        .toLowerCase(),
    };
  });

  return (
    <div>
      <header className="mb-5">
        <p className="label">Nutrition &amp; Recovery</p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">Food</h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed max-w-[68ch]">
          Fifty meals from your own table, protein first — this shelf serves
          Training. No beef in any recipe, checked against the ingredients
          rather than the label. The star is your claim and outranks the
          sort; &ldquo;Cooked it&rdquo; is one tap and builds the only
          honest answer to &ldquo;what do we actually eat?&rdquo;
        </p>
      </header>

      {cards.length === 0 ? (
        <Empty>
          The meals table is empty. The fifty are seeded by migration
          20260811222457_meals — if this shows on the live project,
          something has gone missing rather than never existed.
        </Empty>
      ) : (
        <Meals meals={cards} today={toIso(new Date())} />
      )}

      <p className="text-[0.7rem] text-[var(--faint)] leading-relaxed mt-8 border-t border-[var(--border)] pt-4 max-w-[75ch]">
        Images and meal titles: TheMealDB, whose terms expressly permit
        copying and storing content from the official endpoints. Method text
        written fresh — recipe steps and ingredient lists are not
        copyrightable, but photographs are, which is why the image source is
        stored per row and the text source is not.{" "}
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
