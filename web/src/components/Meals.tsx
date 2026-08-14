"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Meal } from "@/lib/types";
import { mondayOf } from "@/lib/logic";
import {
  HIGH_PROTEIN_MIN,
  MEAL_SLOTS,
  type MealPick,
  PLAN_DAYS,
  QUICK_MAX_MIN,
  SHOP_SECTIONS,
  type MealFilter,
  NO_FILTER,
  filterMeals,
  formatShopQty,
  ingredientLine,
  listAsText,
  mealCategories,
  mealCount,
  readPlan,
  shoppingList,
  sortMeals,
  totalMin,
  withPlan,
} from "@/lib/food";

const DAY_LABEL: Record<(typeof PLAN_DAYS)[number], string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};
const SLOT_LABEL: Record<(typeof MEAL_SLOTS)[number], string> = {
  breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner",
};

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
  // "Placing": a pool pick waiting for a slot tap. {mealId, index into picks}.
  const [placing, setPlacing] = useState<{ mealId: string; i: number } | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const monday = mondayOf(today);
  const categories = useMemo(() => mealCategories(meals), [meals]);
  const shown = useMemo(() => sortMeals(filterMeals(meals, f)), [meals, f]);

  /** This week's plan, derived from every meal's meta. */
  const plan = useMemo(
    () =>
      meals
        .map((m) => ({ meal: m, picks: readPlan(m.meta, monday) }))
        .filter((p) => p.picks.length > 0),
    [meals, monday]
  );
  const pickCount = plan.reduce((n, p) => n + p.picks.length, 0);
  const picksOf = (m: MealCard) => readPlan(m.meta, monday);

  const list = useMemo(
    () =>
      shoppingList(
        plan.map((p) => ({
          name: p.meal.name,
          times: p.picks.length,
          ingredients: p.meal.ingredients,
        }))
      ),
    [plan]
  );

  // Ticks live in localStorage, per week — trolley state, not records. The
  // database never hears about them, and next Monday starts clean.
  const tickKey = `brain-shop-${monday}`;
  useEffect(() => {
    try {
      const held = JSON.parse(localStorage.getItem(tickKey) ?? "[]");
      if (Array.isArray(held)) setTicked(new Set(held.filter((x) => typeof x === "string")));
    } catch {
      /* a corrupt entry is an empty trolley, not a crash */
    }
  }, [tickKey]);
  function toggleTick(key: string) {
    setTicked((old) => {
      const next = new Set(old);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(tickKey, JSON.stringify([...next]));
      } catch {
        /* storage full or blocked — the tick still works for this visit */
      }
      return next;
    });
  }

  async function writePicks(m: MealCard, picks: MealPick[]) {
    setBusy(m.id);
    await supabase
      .from("meals")
      .update({ meta: withPlan(m.meta, monday, picks) })
      .eq("id", m.id);
    setBusy(null);
    setPlacing(null);
    router.refresh();
  }

  /** ＋ on a card: one more planned cooking, into the pool. */
  function addToWeek(m: MealCard) {
    void writePicks(m, [...picksOf(m), { day: null, slot: null }]);
  }

  function removePick(m: MealCard, i: number) {
    const picks = picksOf(m).filter((_, n) => n !== i);
    void writePicks(m, picks);
  }

  function pinPick(m: MealCard, i: number, day: MealPick["day"], slot: MealPick["slot"]) {
    const picks = picksOf(m).map((p, n) => (n === i ? { day, slot } : p));
    void writePicks(m, picks);
  }

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

  async function copyList() {
    try {
      await navigator.clipboard.writeText(listAsText(list, monday));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the list is still on screen */
    }
  }

  /** The pinned picks living in one day+slot cell. */
  const inCell = (day: string, slot: string) =>
    plan.flatMap((p) =>
      p.picks
        .map((pick, i) => ({ meal: p.meal, pick, i }))
        .filter((x) => x.pick.day === day && x.pick.slot === slot)
    );
  const poolPicks = plan.flatMap((p) =>
    p.picks
      .map((pick, i) => ({ meal: p.meal, pick, i }))
      .filter((x) => x.pick.day == null)
  );

  return (
    <div className="grid gap-4">
      {/* -- this week: the pool and the grid ----------------------- */}
      <div className="panel grid gap-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="label">This week · {pickCount} planned</p>
          <span className="mono text-[0.66rem] text-[var(--faint)] ml-auto">
            week of {monday}
          </span>
        </div>

        {pickCount === 0 ? (
          <p className="text-[0.78rem] text-[var(--muted)] leading-relaxed">
            Nothing picked yet. ＋ This week on any meal starts the plan — a
            pick lands in the pool, and pinning it to a day is optional,
            always. The shopping list builds itself from whatever is here.
          </p>
        ) : (
          <>
            {/* The pool: flexible on purpose. */}
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[0.7rem] text-[var(--faint)] mr-1">Pool</span>
              {poolPicks.length === 0 && (
                <span className="text-[0.72rem] text-[var(--faint)]">
                  empty — everything is pinned
                </span>
              )}
              {poolPicks.map((x) => (
                <span
                  key={`${x.meal.id}:${x.i}`}
                  className="chip"
                  data-active={
                    placing?.mealId === x.meal.id && placing.i === x.i
                  }
                  role="button"
                  tabIndex={0}
                  title="Tap, then tap a slot below to pin it. The × removes it from the week."
                  onClick={() =>
                    setPlacing(
                      placing?.mealId === x.meal.id && placing.i === x.i
                        ? null
                        : { mealId: x.meal.id, i: x.i }
                    )
                  }
                >
                  {x.meal.name}
                  <button
                    aria-label={`Remove ${x.meal.name} from this week`}
                    className="ml-1.5 text-[var(--faint)]"
                    disabled={busy != null}
                    onClick={(e) => {
                      e.stopPropagation();
                      removePick(x.meal, x.i);
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            {placing && (
              <p className="text-[0.7rem]" style={{ color: "var(--accent)" }}>
                Now tap a slot below to pin it — or tap the chip again to leave
                it flexible.
              </p>
            )}

            {/* The grid: seven days, three slots, nothing demanded. */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[0.72rem]" style={{ minWidth: "520px" }}>
                <thead>
                  <tr>
                    <th className="text-left font-normal text-[var(--faint)] pb-1 w-[44px]"></th>
                    {MEAL_SLOTS.map((s) => (
                      <th key={s} className="text-left font-normal text-[var(--faint)] pb-1">
                        {SLOT_LABEL[s]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PLAN_DAYS.map((d) => (
                    <tr key={d} className="border-t border-[var(--border)]">
                      <td className="py-1.5 pr-2 mono text-[var(--muted)]">{DAY_LABEL[d]}</td>
                      {MEAL_SLOTS.map((s) => {
                        const here = inCell(d, s);
                        return (
                          <td
                            key={s}
                            className="py-1.5 pr-2 align-top"
                            onClick={() => {
                              if (!placing) return;
                              const m = meals.find((x) => x.id === placing.mealId);
                              if (m) pinPick(m, placing.i, d, s);
                            }}
                            style={placing ? { cursor: "pointer", background: "var(--accent-soft)" } : undefined}
                          >
                            {here.length === 0 ? (
                              <span className="text-[var(--faint)]">—</span>
                            ) : (
                              <span className="flex flex-wrap gap-1">
                                {here.map((x) => (
                                  <button
                                    key={`${x.meal.id}:${x.i}`}
                                    className="chip"
                                    disabled={busy != null}
                                    title="Tap to send it back to the pool"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      pinPick(x.meal, x.i, null, null);
                                    }}
                                  >
                                    {x.meal.name}
                                  </button>
                                ))}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* -- the shopping list, derived ------------------------ */}
            <div className="border-t border-[var(--border)] pt-3 grid gap-2">
              <div className="flex items-baseline gap-2">
                <p className="label">Shopping list · {list.length} items</p>
                <button
                  className="chip ml-auto"
                  onClick={() => void copyList()}
                >
                  {copied ? "Copied ✓" : "Copy list"}
                </button>
              </div>
              {SHOP_SECTIONS.map((section) => {
                const rows = list.filter((l) => l.section === section);
                if (rows.length === 0) return null;
                return (
                  <div key={section}>
                    <p className="text-[0.62rem] uppercase tracking-[0.11em] text-[var(--faint)] mb-1">
                      {section}
                    </p>
                    <ul className="grid gap-0.5">
                      {rows.map((l) => {
                        const key = `${l.item.toLowerCase()}|${l.unit ?? ""}`;
                        const done = ticked.has(key);
                        const q = formatShopQty(l);
                        return (
                          <li key={key}>
                            <button
                              className="text-left text-[0.78rem] leading-relaxed w-full"
                              style={{
                                color: done ? "var(--faint)" : "var(--text)",
                                textDecoration: done ? "line-through" : "none",
                              }}
                              onClick={() => toggleTick(key)}
                              title={`For: ${l.meals.join(" · ")}`}
                            >
                              {done ? "☑" : "☐"} {q ? `${q} ` : ""}
                              {l.item}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
              <p className="text-[0.66rem] text-[var(--faint)] leading-relaxed">
                Same ingredient across meals merges into one line; different
                units stay separate rather than being converted by guesswork.
                Ticks live on this device for this week only.
              </p>
            </div>
          </>
        )}
      </div>

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
                   
                  <div className="relative">
                    {/* Remote images from TheMealDB, whose terms permit storing them.
                        `next/image` would need a remotePatterns entry and an optimiser
                        budget for a private, single-user app that shows fifty of these
                        at thumbnail size. Not worth the cost here. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
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

                  <div className="mt-auto pt-2 flex items-center gap-2 flex-wrap">
                    <button
                      className="chip"
                      data-active={picksOf(m).length > 0}
                      disabled={busy === m.id}
                      onClick={() => addToWeek(m)}
                      title="Into this week's pool — pin it to a day up top if you want to, or don't"
                    >
                      {picksOf(m).length > 0
                        ? `This week ×${picksOf(m).length} ＋`
                        : "＋ This week"}
                    </button>
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
