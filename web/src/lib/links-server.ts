import "server-only";
import { LINKABLE, type LinkEnd, type LinkableType, type ResolvedEnd } from "./links";

/**
 * Turn link ends into things with names.
 *
 * A link row holds a type and an id and nothing else, so rendering "what
 * links here" means resolving titles across up to seven tables. This batches
 * one query per TYPE rather than one per link — a note with eight neighbours
 * across three tables costs three queries, not eight.
 *
 * A row whose target has since been deleted resolves to null and is DROPPED
 * rather than rendered as a blank chip. `links` carries no foreign keys (it
 * cannot — the target could be any table), so a dangling row is a normal
 * consequence of deleting a task, not a corruption. The vault shows what
 * still exists and stays quiet about the rest.
 */
/**
 * The client, typed loosely on purpose.
 *
 * Supabase's builder infers its result type from the LITERAL select string,
 * and every table here is chosen at runtime from the registry. Pinning the
 * real type makes the compiler try to parse `id, ${column}` as a column list
 * and it gives up ("type instantiation is excessively deep"). `PromiseLike`
 * rather than `Promise` because the builder is a thenable, not a Promise.
 */
type QueryLike = PromiseLike<{ data: unknown[] | null }>;
type LooseClient = {
  from: (table: string) => {
    select: (cols: string) => { in: (col: string, vals: string[]) => QueryLike };
  };
};

export async function resolveEnds(
  supabase: LooseClient,
  ends: LinkEnd[]
): Promise<ResolvedEnd[]> {
  if (ends.length === 0) return [];

  const byType = new Map<LinkableType, string[]>();
  for (const e of ends) {
    const list = byType.get(e.type) ?? [];
    list.push(e.id);
    byType.set(e.type, list);
  }

  const titles = new Map<string, string>();
  await Promise.all(
    [...byType.entries()].map(async ([type, ids]) => {
      const spec = LINKABLE[type];
      const { data } = await supabase
        .from(spec.table)
        .select(`id, ${spec.titleColumn}`)
        .in("id", ids);
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        const id = row.id;
        const name = row[spec.titleColumn];
        if (typeof id === "string" && typeof name === "string") {
          titles.set(`${type}:${id}`, name);
        }
      }
    })
  );

  const out: ResolvedEnd[] = [];
  for (const e of ends) {
    const title = titles.get(`${e.type}:${e.id}`);
    // Deleted target: drop it rather than draw an empty chip.
    if (title === undefined) continue;
    out.push({ ...e, title });
  }
  return out;
}
