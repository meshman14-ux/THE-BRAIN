"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Meal } from "@/lib/types";
import {
  HIGH_PROTEIN_MIN,
  QUICK_MAX_MIN,
  type MealFilter,
  NO_FILTER,
  filterMeals,
  ingredientLine,
  mealCategories,
  mealCount,
  sortMeals,
  totalMin,
} from "@/lib/food";

export type MealCard = Meal & {
  /** name+cuisine+category+tags+ingredients, lowercased, built server-side. */
  haystack: string;
  ingredients: { item: string; qty: number | string | null; unit: string | null; optional: boolean }[];
};

/**
 * The meal library. Fifty meals from Jay's own table, protein first —
 * Nutrition & Recovery serves Training. Filters compose; search covers
 * ingredients, so "chickpea" finds the fajitas.
 *
 * Two writes, both one tap: the star (his claim, and it outranks the
 * protein sort), and "Cooked it" — which stamps `last_cooked_on` and
 * counts `times_cooked`, idempotent per day so a double tap cannot
 * inflate the count. That figure is the read-back: the shelf can say
 * "you cook the same six meals" only because the taps were cheap.
 */
export default function Meals({ meals, today }: { meals: MealCard[]; today: string }) {
  const [f, setF] = useState<MealFilter>(NO_FILTER);
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const categories = useMemo(() => mealCategories(meals), [meals]);
  const shown = useMemo(() => sortMeals(filterMeals(meals, f)), [meals, f]);

  async function toggleFavourite(m: MealCard) {
    setBusy(m.id);
    await supabase.from("meals").update({ favourite: !m.favourite }).eq("id", m.id);
    setBusy(null);
    router.refresh();
  }

  async function cooked(m: MealCard) {
    if (m.last_cooked_on === today) return; // once per day — a double tap is one dinner
    setBusy(m.id);
    await supabase
      .from("meals")
      .update({ last_cooked_on: today, times_cooked: m.times_cooked + 1 })
      .eq("id", m.id);
    setBusy(null);
    router.refresh();
  }

  const chip = (
    label: string,
    active: boolean,
    onTap: () => void,
    title?: string
  ) => (
    <button
      key={label}
      className="chip"
      data-active={active}
      onClick={onTap}
      title={title}
    >
      {label}
    </button>
  );

  return (
    <div className="grid gap-4">
      {/* -- the bar ------------------------------------------------ */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {chip("All", f.category == null, () => setF({ ...f, category: null }))}
        {categories.map((c) =>
          chip(c, f.category === c, () =>
            setF({ ...f, category: f.category === c ? null : c })
          )
        )}
        <span className="w-px h-4 bg-[var(--border-bright)] mx-1" aria-hidden />
        {chip(
          `under ${QUICK_MAX_MIN} min`,
          f.quick,
          () => setF({ ...f, quick: !f.quick }),
          "Prep plus cook. An untimed meal never passes — unmeasured is not quick."
        )}
        {chip("batchable", f.batch, () => setF({ ...f, batch: !f.batch }))}
        {chip(
          `${HIGH_PROTEIN_MIN}g+ protein`,
          f.highProtein,
          () => setF({ ...f, highProtein: !f.highProtein })
        )}
        <input
          className="input ml-auto"
          style={{ maxWidth: "200px", width: "auto" }}
          placeholder="Search…"
          value={f.q}
          onChange={(e) => setF({ ...f, q: e.target.value })}
          aria-label="Search meals, including ingredients"
        />
        <span className="mono text-[0.72rem] text-[var(--faint)]">
          {mealCount(shown.length, meals.length)}
        </span>
      </div>

      {/* -- the shelf ---------------------------------------------- */}
      {shown.length === 0 ? (
        <p className="text-[0.82rem] text-[var(--muted)] leading-relaxed">
          Nothing passes those filters together. Loosen one — the fifty are
          all still here.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((m) => {
            const t = totalMin(m);
            return (
              <article key={m.id} className="card overflow-hidden flex flex-col">
                {m.image_url && (
                  // Plain img on purpose: the images live on TheMealDB and
                  // next/image would need a remote-domain allowlist for a
                  // cosmetic gain. Lazy so fifty photos do not load at once.
                  // eslint-disable-next-line @next/next/no-img-element
                  <div className="relative">
                    <img
                      src={m.image_url}
                      alt={m.name}
                      loading="lazy"
                      className="w-full h-[150px] object-cover"
                    />
                    <span className="absolute left-2 top-2 text-[0.6rem] font-bold uppercase tracking-[0.07em] text-white bg-black/55 px-2 py-0.5 rounded-[6px]">
                      {m.category}
                    </span>
                    <button
                      aria-label={m.favourite ? `Unstar ${m.name}` : `Star ${m.name}`}
                      disabled={busy === m.id}
                      onClick={() => void toggleFavourite(m)}
                      className="absolute right-2 top-2 text-[1rem] leading-none bg-black/55 rounded-[6px] px-1.5 py-0.5"
                      style={{ color: m.favourite ? "var(--warn)" : "#fff" }}
                    >
                      {m.favourite ? "★" : "☆"}
                    </button>
                  </div>
                )}
                <div className="p-3.5 flex-1 flex flex-col gap-2">
                  <h3 className="serif text-[0.98rem] leading-snug">{m.name}</h3>
                  <p className="text-[0.74rem] text-[var(--muted)]">
                    <span className="mono text-[var(--text)]">
                      {m.protein_g != null ? `${m.protein_g}g` : "—"}
                    </span>{" "}
                    protein · {t != null ? `${t} min` : "— min"} · serves {m.servings}
                    {m.cuisine ? ` · ${m.cuisine}` : ""}
                  </p>
                  {m.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {m.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[0.6rem] font-bold px-2 py-0.5 rounded-full bg-[var(--bg-2)] text-[var(--muted)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <details className="mt-1 border-t border-[var(--border)] pt-2">
                    <summary className="text-[0.76rem] font-bold cursor-pointer" style={{ color: "var(--accent)" }}>
                      Recipe
                    </summary>
                    <p className="label mt-2 mb-1">Ingredients</p>
                    <ul className="pl-4 list-disc text-[0.78rem] leading-relaxed text-[var(--muted)]">
                      {m.ingredients.map((i, n) => (
                        <li key={n}>
                          {ingredientLine(i)}
                          {i.optional ? " (optional)" : ""}
                        </li>
                      ))}
                    </ul>
                    <p className="label mt-3 mb-1">Method</p>
                    <ol className="pl-4 list-decimal text-[0.78rem] leading-relaxed text-[var(--muted)] grid gap-1">
                      {m.method.map((step, n) => (
                        <li key={n}>{step}</li>
                      ))}
                    </ol>
                    {m.estimates && (
                      <p className="text-[0.66rem] text-[var(--faint)] italic mt-2">
                        Protein and calories are estimates per serving, not
                        measured.
                      </p>
                    )}
                  </details>

                  <div className="mt-auto pt-2 flex items-center gap-2">
                    <button
                      className="chip"
                      disabled={busy === m.id || m.last_cooked_on === today}
                      onClick={() => void cooked(m)}
                    >
                      {m.last_cooked_on === today ? "Cooked today ✓" : "Cooked it"}
                    </button>
                    {m.times_cooked > 0 && (
                      <span className="mono text-[0.66rem] text-[var(--faint)] ml-auto">
                        ×{m.times_cooked}
                        {m.last_cooked_on && m.last_cooked_on !== today
                          ? ` · last ${m.last_cooked_on}`
                          : ""}
                      </span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
