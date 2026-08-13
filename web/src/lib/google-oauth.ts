/**
 * The OAuth URL, built as a pure function.
 *
 * Separated from `google.ts` (which is `server-only` and therefore
 * untestable) because this is where OAuth silently goes wrong. Drop
 * `access_type=offline` and the connection works for exactly one hour and
 * then dies; mistype a scope and the consent screen asks for the wrong
 * thing; get the redirect URI wrong by a character and Google refuses. None
 * of those throw — they just fail later, confusingly.
 */

/**
 * Read-write on calendars this app created, a read of the calendar list so
 * the primary can be identified and then avoided, and free/busy.
 *
 * Notably NOT `calendar` or `calendar.readonly` on the whole account: THE
 * BRAIN has no business reading his real diary, and asking for less is the
 * version of "blast radius contained" that happens at the consent screen —
 * the one place the limit is visible to the person granting it.
 *
 * `calendar.freebusy` was added when THE COG started reading real
 * commitments for its focus block. It is the SMALLEST scope that answers
 * "is he busy at 10am": it returns intervals and nothing else — no titles,
 * no attendees, no locations, no descriptions. `calendar.readonly` would
 * also have worked and would have handed over the entire diary to do it,
 * which is a different trade and a worse one.
 *
 * Without this, `freeBusy` returns 403, the adapter catches it, and the
 * focus block silently falls back to planner pins forever — a calendar
 * that looks connected and never informs anything.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.app.created",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.freebusy",
].join(" ");

export const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

/** Where Google sends him back to. Must match the client's authorised URI. */
export function redirectUriFor(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/api/calendar/callback`;
}

export function buildAuthUrl(input: {
  clientId: string;
  origin: string;
  state: string;
}): string {
  const p = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: redirectUriFor(input.origin),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    // Both of these, or there is no refresh token — and without one the
    // connection lasts an hour.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: input.state,
  });
  return `${AUTH_ENDPOINT}?${p}`;
}
