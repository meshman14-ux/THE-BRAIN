import { describe, expect, it } from "vitest";
import {
  HIGH_PROTEIN_MIN,
  NO_FILTER,
  QUICK_MAX_MIN,
  filterMeals,
  ingredientLine,
  mealCategories,
  mealCount,
  sortMeals,
  totalMin,
} from "../src/lib/food";

const meal = (o: Record<string, unknown> = {}) => ({
  name: String(o.name ?? "m"),
  category: String(o.category ?? "chicken"),
  prep_min: ("prep_min" in o ? o.prep_min : 10) as number | null,
  cook_min: ("cook_min" in o ? o.cook_min : 10) as number | null,
  protein_g: ("protein_g" in o ? o.protein_g : 30) as number | null,
  favourite: Boolean(o.favourite ?? false),
  tags: (o.tags ?? []) as string[],
  haystack: String(o.haystack ?? String(o.name ?? "m")).toLowerCase(),
});

describe("totalMin", () => {
  it("sums prep and cook, tolerating one missing half", () => {
    expect(totalMin({ prep_min: 20, cook_min: 15 })).toBe(35);
    expect(totalMin({ prep_min: null, cook_min: 15 })).toBe(15);
  });

  it("both missing is null — unmeasured, never zero", () => {
    expect(totalMin({ prep_min: null, cook_min: null })).toBeNull();
  });
});

describe("filterMeals", () => {
  it("an untimed meal never passes the quick filter", () => {
    const rows = [
      meal({ name: "timed", prep_min: 10, cook_min: 10 }),
      meal({ name: "untimed", prep_min: null, cook_min: null }),
    ];
    const out = filterMeals(rows, { ...NO_FILTER, quick: true });
    expect(out.map((m) => m.name)).toEqual(["timed"]);
  });

  it("quick means the threshold, inclusive", () => {
    const rows = [
      meal({ name: "at", prep_min: QUICK_MAX_MIN, cook_min: 0 }),
      meal({ name: "over", prep_min: QUICK_MAX_MIN, cook_min: 1 }),
    ];
    expect(
      filterMeals(rows, { ...NO_FILTER, quick: true }).map((m) => m.name)
    ).toEqual(["at"]);
  });

  it("null protein never counts as high-protein", () => {
    const rows = [
      meal({ name: "big", protein_g: HIGH_PROTEIN_MIN }),
      meal({ name: "unknown", protein_g: null }),
    ];
    expect(
      filterMeals(rows, { ...NO_FILTER, highProtein: true }).map((m) => m.name)
    ).toEqual(["big"]);
  });

  it("filters compose — all must pass", () => {
    const rows = [
      meal({ name: "both", protein_g: 45, prep_min: 5, cook_min: 10, category: "chicken" }),
      meal({ name: "slow", protein_g: 45, prep_min: 60, cook_min: 30, category: "chicken" }),
      meal({ name: "light", protein_g: 12, prep_min: 5, cook_min: 10, category: "chicken" }),
    ];
    const out = filterMeals(rows, {
      ...NO_FILTER,
      category: "chicken",
      quick: true,
      highProtein: true,
    });
    expect(out.map((m) => m.name)).toEqual(["both"]);
  });

  it("search reaches the ingredients through the haystack", () => {
    const rows = [
      meal({ name: "Chickpea Fajitas", haystack: "chickpea fajitas mexican chickpeas peppers" }),
      meal({ name: "Carbonara", haystack: "carbonara italian spaghetti guanciale" }),
    ];
    expect(
      filterMeals(rows, { ...NO_FILTER, q: "chickpea" }).map((m) => m.name)
    ).toEqual(["Chickpea Fajitas"]);
  });
});

describe("sortMeals", () => {
  it("favourite outranks protein; protein outranks time; null protein sinks", () => {
    const rows = [
      meal({ name: "big", protein_g: 47 }),
      meal({ name: "starred", protein_g: 15, favourite: true }),
      meal({ name: "unknown", protein_g: null }),
      meal({ name: "quick40", protein_g: 40, prep_min: 5, cook_min: 5 }),
      meal({ name: "slow40", protein_g: 40, prep_min: 60, cook_min: 30 }),
    ];
    expect(sortMeals(rows).map((m) => m.name)).toEqual([
      "starred",
      "big",
      "quick40",
      "slow40",
      "unknown",
    ]);
  });
});

describe("ingredientLine", () => {
  it("spells the prototype's grammar exactly", () => {
    expect(ingredientLine({ item: "lamb mince", qty: 700, unit: "g" })).toBe("700g lamb mince");
    expect(ingredientLine({ item: "red pepper paste", qty: 2, unit: "tbsp" })).toBe("2tbsp red pepper paste");
    expect(ingredientLine({ item: "onion", qty: 1, unit: null })).toBe("1 onion");
    expect(ingredientLine({ item: "black pepper", qty: null, unit: null })).toBe("black pepper");
  });

  it("normalises PostgREST's stringly numerics", () => {
    expect(ingredientLine({ item: "olive oil", qty: "4", unit: "tbsp" })).toBe("4tbsp olive oil");
    expect(ingredientLine({ item: "parsley", qty: "not-a-number", unit: null })).toBe("parsley");
  });
});

describe("mealCategories", () => {
  it("biggest shelf first, ties alphabetical", () => {
    const rows = [
      meal({ category: "chicken" }),
      meal({ category: "chicken" }),
      meal({ category: "lamb" }),
      meal({ category: "seafood" }),
    ];
    expect(mealCategories(rows)).toEqual(["chicken", "lamb", "seafood"]);
  });
});

describe("mealCount", () => {
  it("says what is shown of what exists", () => {
    expect(mealCount(12, 50)).toBe("12 of 50");
  });
});
