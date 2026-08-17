/**
 * Reading what an edge function actually said.
 *
 * supabase-js throws `FunctionsHttpError` with a generic message — "Edge
 * Function returned a non-2xx status code" — and puts the real body on
 * `error.context`, which is the Response. Every one of our functions returns
 * `{ error: "…" }` with a precise reason ("ANTHROPIC_API_KEY is not set",
 * "extraction API 404: model not found"), and all of that was being thrown
 * away at the exact moment somebody needed it.
 *
 * A failure message that does not name the failure is the same defect as a
 * silent write: the user is told something went wrong and given no way to act.
 */
export async function functionErrorMessage(error: unknown): Promise<string> {
  const fallback =
    error instanceof Error && error.message ? error.message : "Unknown error";

  const context = (error as { context?: unknown })?.context;
  if (!context || typeof context !== "object") return fallback;

  // A Response, in practice. Read it defensively — it may already be consumed,
  // may not be JSON, and must never throw out of an error handler.
  const res = context as { json?: () => Promise<unknown>; text?: () => Promise<string> };
  try {
    if (typeof res.json === "function") {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body?.error === "string" && body.error.trim() !== "") return body.error;
    }
  } catch {
    /* not JSON, or already read — fall through to text */
  }
  try {
    if (typeof res.text === "function") {
      const text = (await res.text()).trim();
      if (text) return text.slice(0, 400);
    }
  } catch {
    /* nothing readable */
  }
  return fallback;
}
