import { describe, expect, it } from "vitest";
import {
  HIGH_PROTEIN_MIN,
  NO_FILTER,
  QUICK_MAX_MIN,
  filterMeals,
  formatShopQty,
  ingredientLine,
  listAsText,
  mealCategories,
  mealCount,
  readPlan,
  sectionOf,
  shoppingList,
  sortMeals,
  totalMin,
  withPlan,
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

/* ------------------------------------------------------------------ *
 * The week plan — pool, pins, and the jsonb that cannot be trusted
 * ------------------------------------------------------------------ */

describe("readPlan / withPlan", () => {
  const MON = "2026-08-10";

  it("round-trips a plan and clobbers nothing else in meta", () => {
    const meta = withPlan({ other: "kept" }, MON, [
      { day: null, slot: null },
      { day: "wed", slot: "dinner" },
    ]);
    expect((meta as { other: string }).other).toBe("kept");
    expect(readPlan(meta, MON)).toEqual([
      { day: null, slot: null },
      { day: "wed", slot: "dinner" },
    ]);
  });

  it("last week's plan is not this week's", () => {
    const meta = withPlan({}, "2026-08-03", [{ day: null, slot: null }]);
    expect(readPlan(meta, MON)).toEqual([]);
  });

  it("an empty pick list removes the plan key entirely", () => {
    const meta = withPlan({ other: 1, plan: { week: MON, picks: [] } }, MON, []);
    expect("plan" in meta).toBe(false);
    expect((meta as { other: number }).other).toBe(1);
  });

  it("half a pin is no pin, and junk degrades to the pool", () => {
    const meta = {
      plan: {
        week: MON,
        picks: [
          { day: "wed" }, // slot missing
          { day: "someday", slot: "dinner" }, // unknown day
          "junk",
          { day: "fri", slot: "lunch" },
        ],
      },
    };
    expect(readPlan(meta, MON)).toEqual([
      { day: null, slot: null },
      { day: null, slot: null },
      { day: null, slot: null },
      { day: "fri", slot: "lunch" },
    ]);
  });

  it("meta that is not an object reads as no plan", () => {
    expect(readPlan(null, MON)).toEqual([]);
    expect(readPlan("junk", MON)).toEqual([]);
    expect(readPlan({ plan: "junk" }, MON)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * The shopping list — merged, multiplied, never converted by guesswork
 * ------------------------------------------------------------------ */

describe("shoppingList", () => {
  const lamb = {
    name: "Adana Kebab",
    times: 1,
    ingredients: [
      { item: "lamb mince", qty: 700, unit: "g", optional: false },
      { item: "onion", qty: 1, unit: null, optional: false },
    ],
  };
  const kofta = {
    name: "Lamb Kofta Burgers",
    times: 1,
    ingredients: [
      { item: "lamb mince", qty: 600, unit: "g", optional: false },
      { item: "onion", qty: 1, unit: null, optional: false },
    ],
  };

  it("same item and unit merge with quantities summed", () => {
    const lines = shoppingList([lamb, kofta]);
    const mince = lines.find((l) => l.item === "lamb mince")!;
    expect(mince.qty).toBe(1300);
    expect(mince.meals).toEqual(["Adana Kebab", "Lamb Kofta Burgers"]);
    const onion = lines.find((l) => l.item === "onion")!;
    expect(onion.qty).toBe(2);
  });

  it("a meal planned twice wants its ingredients twice", () => {
    const lines = shoppingList([{ ...lamb, times: 2 }]);
    expect(lines.find((l) => l.item === "lamb mince")!.qty).toBe(1400);
  });

  it("different units never merge — no conversion by guesswork", () => {
    const lines = shoppingList([
      {
        name: "a",
        times: 1,
        ingredients: [
          { item: "olive oil", qty: 4, unit: "tbsp", optional: false },
          { item: "olive oil", qty: 100, unit: "ml", optional: false },
        ],
      },
    ]);
    expect(lines.filter((l) => l.item === "olive oil")).toHaveLength(2);
  });

  it("unquantified items carry a count instead of a fake quantity", () => {
    const lines = shoppingList([
      {
        name: "a",
        times: 1,
        ingredients: [{ item: "black pepper", qty: null, unit: null, optional: false }],
      },
      {
        name: "b",
        times: 1,
        ingredients: [{ item: "black pepper", qty: null, unit: null, optional: false }],
      },
    ]);
    const pepper = lines.find((l) => l.item === "black pepper")!;
    expect(pepper.qty).toBeNull();
    expect(pepper.count).toBe(2);
  });

  it("orders by shop section, then alphabetically", () => {
    const lines = shoppingList([
      {
        name: "a",
        times: 1,
        ingredients: [
          { item: "soy sauce", qty: 3, unit: "tbsp", optional: false },
          { item: "salmon fillets", qty: 2, unit: null, optional: false },
          { item: "frozen peas", qty: 100, unit: "g", optional: false },
        ],
      },
    ]);
    expect(lines.map((l) => l.section)).toEqual(["Meat & Fish", "Frozen", "Cupboard"]);
  });
});

describe("sectionOf", () => {
  it("files the seed's staples where the shop keeps them", () => {
    expect(sectionOf("chicken thighs")).toBe("Meat & Fish");
    expect(sectionOf("raw king prawns")).toBe("Meat & Fish");
    expect(sectionOf("frozen peas")).toBe("Frozen"); // not the veg aisle
    expect(sectionOf("natural yoghurt")).toBe("Dairy & Eggs");
    expect(sectionOf("flatbreads")).toBe("Bakery");
    expect(sectionOf("spring onions")).toBe("Fruit & Veg");
    expect(sectionOf("soy sauce")).toBe("Cupboard");
    expect(sectionOf("mystery packet")).toBe("Cupboard"); // the honest default
  });
});

describe("formatShopQty and listAsText", () => {
  it("rolls grams and millilitres up at 1000", () => {
    expect(formatShopQty({ qty: 1300, unit: "g", count: 2 })).toBe("1.3kg");
    expect(formatShopQty({ qty: 700, unit: "g", count: 1 })).toBe("700g");
    expect(formatShopQty({ qty: 1200, unit: "ml", count: 2 })).toBe("1.2l");
    expect(formatShopQty({ qty: 3, unit: "tbsp", count: 1 })).toBe("3tbsp");
    expect(formatShopQty({ qty: 2, unit: null, count: 2 })).toBe("2");
    expect(formatShopQty({ qty: null, unit: null, count: 2 })).toBe("×2");
    expect(formatShopQty({ qty: null, unit: null, count: 1 })).toBe("");
  });

  it("writes a grouped plain-text list for the copy button", () => {
    const text = listAsText(
      shoppingList([
        {
          name: "a",
          times: 1,
          ingredients: [
            { item: "lamb mince", qty: 1300, unit: "g", optional: false },
            { item: "soy sauce", qty: 3, unit: "tbsp", optional: false },
          ],
        },
      ]),
      "2026-08-10"
    );
    expect(text).toContain("week of 2026-08-10");
    expect(text).toContain("MEAT & FISH");
    expect(text).toContain("- 1.3kg lamb mince");
    expect(text).toContain("CUPBOARD");
    expect(text).toContain("- 3tbsp soy sauce");
  });
});
