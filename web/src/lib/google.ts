import "server-only";

import { decryptWith, encryptWith, keyFrom } from "./token-crypto";
import { buildAuthUrl, GOOGLE_SCOPES, redirectUriFor } from "./google-oauth";
import {
  assertWritable,
  BRAIN_CALENDAR_DESCRIPTION,
  BRAIN_CALENDAR_NAME,
  TIME_ZONE,
  type EventDraft,
  type RemoteEvent,
} from "./calendar";

/**
 * The Google half of the calendar sync.
 *
 * `server-only` at the top is load-bearing: this module handles refresh
 * tokens and a client secret, and importing it from a Client Component
 * would ship both to the browser. The import makes that a build error
 * rather than a discovery.
 *
 * No SDK. The three calls we need are three fetches, and `googleapis` is
 * ~50MB of dependency to avoid writing them.
 */

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

export { GOOGLE_SCOPES };

export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  tokenSecret: Buffer;
};

/**
 * Whether the server has what it needs to offer a connection at all.
 *
 * Missing configuration is a first-class state, not a crash. The page says
 * exactly which variables are absent, because "it doesn't work" is not a
 * thing anyone can act on.
 */
export function missingConfig(): string[] {
  const missing: string[] = [];
  if (!process.env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (!process.env.CALENDAR_TOKEN_SECRET) missing.push("CALENDAR_TOKEN_SECRET");
  return missing;
}

export function isConfigured(): boolean {
  return missingConfig().length === 0;
}

function config(): GoogleConfig {
  const missing = missingConfig();
  if (missing.length > 0) {
    throw new Error(`Calendar is not configured. Missing: ${missing.join(", ")}`);
  }
  return {
    clientId: process.env.GOOGLE_CLIENT_ID as string,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    tokenSecret: keyFrom(process.env.CALENDAR_TOKEN_SECRET as string),
  };
}

/** Where Google sends him back to. Must match the client's authorised URI. */
export function redirectUri(origin: string): string {
  return redirectUriFor(origin);
}

/* ------------------------------------------------------------------ *
 * Token storage — encrypted, always
 * ------------------------------------------------------------------ */

/** See `token-crypto.ts` — kept separate so the round trip can be tested. */
export function encryptToken(plain: string): string {
  return encryptWith(config().tokenSecret, plain);
}

export function decryptToken(payload: string | null | undefined): string | null {
  return decryptWith(config().tokenSecret, payload);
}

/* ------------------------------------------------------------------ *
 * OAuth
 * ------------------------------------------------------------------ */

export function authUrl(origin: string, state: string): string {
  return buildAuthUrl({ clientId: config().clientId, origin, state });
}

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scope: string | null;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      `Google rejected the token request: ${json.error_description ?? json.error ?? res.status}`
    );
  }
  const expiresIn = Number(json.expires_in ?? 3600);
  return {
    accessToken: String(json.access_token),
    refreshToken: json.refresh_token ? String(json.refresh_token) : null,
    // A minute of margin, so a token that expires mid-sync does not.
    expiresAt: new Date(Date.now() + (expiresIn - 60) * 1000).toISOString(),
    scope: json.scope ? String(json.scope) : null,
  };
}

export async function exchangeCode(
  code: string,
  origin: string
): Promise<TokenSet> {
  const { clientId, clientSecret } = config();
  return tokenRequest({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri(origin),
    grant_type: "authorization_code",
  });
}

export async function refreshAccess(refreshToken: string): Promise<TokenSet> {
  const { clientId, clientSecret } = config();
  const set = await tokenRequest({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  // A refresh response usually omits the refresh token; the old one stands.
  return { ...set, refreshToken: set.refreshToken ?? refreshToken };
}

/* ------------------------------------------------------------------ *
 * The Calendar API
 * ------------------------------------------------------------------ */

const API = "https://www.googleapis.com/calendar/v3";

async function call<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = new Error(
      `Google Calendar ${res.status}: ${json?.error?.message ?? text.slice(0, 200)}`
    ) as Error & { status?: number; googleReason?: string };
    err.status = res.status;
    err.googleReason = json?.error?.errors?.[0]?.reason;
    throw err;
  }
  return json as T;
}

export type CalendarListEntry = {
  id: string;
  summary?: string;
  primary?: boolean;
  accessRole?: string;
};

export async function listCalendars(
  accessToken: string
): Promise<CalendarListEntry[]> {
  const json = await call<{ items?: CalendarListEntry[] }>(
    accessToken,
    "/users/me/calendarList?maxResults=250&minAccessRole=owner"
  );
  return json.items ?? [];
}

/** The account's primary calendar id — the one we must never write to. */
export function primaryIdOf(list: CalendarListEntry[]): string | null {
  return list.find((c) => c.primary)?.id ?? null;
}

/**
 * Find THE BRAIN's own calendar, or make it.
 *
 * Made rather than chosen, deliberately. Asking him to pick a calendar is
 * asking him to pick his main one by accident once, and there is no undo
 * for an app that starts writing to your real diary.
 */
export async function ensureBrainCalendar(
  accessToken: string
): Promise<{ id: string; name: string; primaryId: string | null; created: boolean }> {
  const list = await listCalendars(accessToken);
  const primaryId = primaryIdOf(list);

  const existing = list.find(
    (c) => (c.summary ?? "").trim() === BRAIN_CALENDAR_NAME && !c.primary
  );
  if (existing) {
    assertWritable({ calendarId: existing.id, primaryId });
    return {
      id: existing.id,
      name: existing.summary ?? BRAIN_CALENDAR_NAME,
      primaryId,
      created: false,
    };
  }

  const made = await call<{ id: string; summary?: string }>(
    accessToken,
    "/calendars",
    {
      method: "POST",
      body: JSON.stringify({
        summary: BRAIN_CALENDAR_NAME,
        description: BRAIN_CALENDAR_DESCRIPTION,
        timeZone: TIME_ZONE,
      }),
    }
  );
  assertWritable({ calendarId: made.id, primaryId });
  return {
    id: made.id,
    name: made.summary ?? BRAIN_CALENDAR_NAME,
    primaryId,
    created: true,
  };
}

/* -- events -------------------------------------------------------- */

export async function insertEvent(
  accessToken: string,
  target: { calendarId: string; primaryId: string | null },
  draft: EventDraft
): Promise<RemoteEvent> {
  const calId = assertWritable(target);
  return call<RemoteEvent>(
    accessToken,
    `/calendars/${encodeURIComponent(calId)}/events`,
    { method: "POST", body: JSON.stringify(draft) }
  );
}

export async function patchEvent(
  accessToken: string,
  target: { calendarId: string; primaryId: string | null },
  eventId: string,
  draft: EventDraft
): Promise<RemoteEvent> {
  const calId = assertWritable(target);
  return call<RemoteEvent>(
    accessToken,
    `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PUT", body: JSON.stringify(draft) }
  );
}

export async function deleteEvent(
  accessToken: string,
  target: { calendarId: string; primaryId: string | null },
  eventId: string
): Promise<void> {
  const calId = assertWritable(target);
  try {
    await call<void>(
      accessToken,
      `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE" }
    );
  } catch (e) {
    // Already gone is the outcome we wanted anyway.
    const status = (e as { status?: number }).status;
    if (status !== 404 && status !== 410) throw e;
  }
}

export async function getEvent(
  accessToken: string,
  target: { calendarId: string; primaryId: string | null },
  eventId: string
): Promise<RemoteEvent | null> {
  const calId = assertWritable(target);
  try {
    return await call<RemoteEvent>(
      accessToken,
      `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`
    );
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 404 || status === 410) return null;
    throw e;
  }
}

export type EventPage = {
  items: RemoteEvent[];
  nextSyncToken: string | null;
};

/**
 * Everything that changed since last time.
 *
 * Uses Google's sync token when there is one, which returns only what moved
 * — including deletions, which a plain date-range list never shows. A 410
 * means the token has expired; the caller starts again without one, which
 * is Google's documented recovery and not an error worth showing him.
 */
export async function listChangedEvents(
  accessToken: string,
  target: { calendarId: string; primaryId: string | null },
  syncToken: string | null,
  windowStart: string
): Promise<EventPage> {
  const calId = assertWritable(target);
  const items: RemoteEvent[] = [];
  let pageToken: string | null = null;
  let nextSyncToken: string | null = null;

  do {
    const p = new URLSearchParams({ maxResults: "250", showDeleted: "true" });
    if (syncToken) p.set("syncToken", syncToken);
    else {
      p.set("timeMin", `${windowStart}T00:00:00Z`);
      p.set("singleEvents", "true");
    }
    if (pageToken) p.set("pageToken", pageToken);

    const page: {
      items?: RemoteEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    } = await call(
      accessToken,
      `/calendars/${encodeURIComponent(calId)}/events?${p}`
    );

    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken ?? null;
    nextSyncToken = page.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  return { items, nextSyncToken };
}

/** True when a sync token has aged out and the pull must start over. */
export function isExpiredSyncToken(e: unknown): boolean {
  return (e as { status?: number })?.status === 410;
}

/** Best-effort revoke, so disconnecting actually disconnects. */
export async function revoke(token: string): Promise<void> {
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  } catch {
    // Revoking is a courtesy to Google; the row is deleted either way.
  }
}
