/**
 * Calling an edge function without supabase-js building the headers.
 *
 * WHY THIS EXISTS. `supabase.functions.invoke` failed in the browser with
 * "Failed to construct 'Request': 'headers' of 'RequestInit' is not a valid
 * ByteString" — thrown by fetch BEFORE the request leaves, because some header
 * value contained a character outside Latin-1. HTTP header values are
 * ByteStrings; a smart quote, an em dash or a non-breaking space pasted into
 * an environment variable is enough to make every function call impossible.
 *
 * Building the three headers ourselves means we know exactly what is in them,
 * and — the part that matters — we can say WHICH one is wrong instead of
 * failing with a message about ByteStrings that names nothing.
 */

import { supabaseUrl, supabaseAnonKey } from "./supabase/env";

/**
 * A header value is legal only if every character is Latin-1 (0–255).
 * Returns the first offending character and its position, or null.
 */
export function badHeaderChar(value: string): { char: string; index: number } | null {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 255) return { char: value[i], index: i };
  }
  return null;
}

/** Names a character in a way a person can act on. */
export function describeChar(c: string): string {
  const map: Record<string, string> = {
    "‘": "a curly opening quote",
    "’": "a curly apostrophe",
    "“": "a curly opening double quote",
    "”": "a curly closing double quote",
    "–": "an en dash",
    "—": "an em dash",
    "…": "an ellipsis character",
  };
  return map[c] ?? `the character “${c}” (U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")})`;
}

export type InvokeResult<T> = { data: T | null; error: string | null };

type MinimalClient = {
  auth: { getSession: () => Promise<{ data: { session: { access_token: string } | null } }> };
};

/**
 * POST to an edge function as the signed-in user.
 *
 * Returns the function's OWN error text when it fails, because every function
 * in this project answers `{ error: "…" }` with something actionable and the
 * generic "non-2xx status code" is worthless to whoever is reading it.
 */
export async function invokeFunction<T = unknown>(
  supabase: MinimalClient,
  name: string,
  body: unknown
): Promise<InvokeResult<T>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? "";
  if (!token) {
    return { data: null, error: "You are not signed in — sign in again and retry." };
  }

  // Check before constructing, so the failure names the cause rather than
  // being thrown by fetch as an unreadable ByteString error.
  for (const [what, value] of [
    ["your sign-in token", token],
    ["the Supabase key (NEXT_PUBLIC_SUPABASE_ANON_KEY)", supabaseAnonKey],
    ["the Supabase URL (NEXT_PUBLIC_SUPABASE_URL)", supabaseUrl],
  ] as const) {
    const bad = badHeaderChar(value);
    if (bad) {
      return {
        data: null,
        error: `${what} contains ${describeChar(bad.char)} at position ${bad.index}, which cannot be sent in a request. If that is an environment variable, it was almost certainly pasted with a smart quote or a stray space — re-paste it as plain text.`,
      };
    }
  }

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return {
      data: null,
      error: `The request could not be sent — ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON — the raw text is still the most useful thing we have */
  }

  if (!res.ok) {
    const fromBody =
      parsed && typeof parsed === "object" && typeof (parsed as { error?: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : text.trim().slice(0, 400);
    return { data: null, error: fromBody || `The function returned ${res.status}.` };
  }

  return { data: (parsed as T) ?? null, error: null };
}
