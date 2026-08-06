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
 * Read-write on calendars this app created, and a read of the calendar
 * list so the primary can be identified and then avoided. Notably NOT
 * `calendar` or `calendar.readonly` on the whole account: THE BRAIN has no
 * business reading his real diary, and asking for less is the version of
 * "blast radius contained" that happens at the consent screen.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.app.created",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
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
