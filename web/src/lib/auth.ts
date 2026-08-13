/* ------------------------------------------------------------------ *
 * Sign-in policy
 *
 * THE BRAIN was magic-link only, and the reason that changed is worth
 * writing down: with a link, YOUR EMAIL PROVIDER IS YOUR LOGIN. Every
 * sign-in depended on a message arriving, and the built-in mail service
 * is capped at two an hour and explicitly not meant for production. That
 * cap locked the owner out of his own operating system.
 *
 * A password moves email off the daily path and onto the recovery path,
 * where a two-an-hour limit is fine. The link stays as the way back in.
 * ------------------------------------------------------------------ */

/**
 * Minimum password length.
 *
 * Ten rather than Supabase's default six. Six is a number chosen so
 * nobody complains; this is the front door to every debt balance, every
 * venture and every private note in the system, and it is typed once and
 * then held by a keychain forever — so the cost of a longer minimum is
 * close to zero and the benefit is not.
 */
export const MIN_PASSWORD = 10;

export type PasswordProblem = "short" | "mismatch" | null;

/** What is wrong with a password pair, if anything. Empty is not a problem. */
export function passwordProblem(password: string, again: string): PasswordProblem {
  if (password.length > 0 && password.length < MIN_PASSWORD) return "short";
  if (again.length > 0 && again !== password) return "mismatch";
  return null;
}

export function passwordReady(password: string, again: string): boolean {
  return password.length >= MIN_PASSWORD && again === password;
}

/**
 * Turn a Supabase auth error into something a human can act on.
 *
 * Two of them are worth translating and the rest are passed through:
 *
 *   · "Invalid login credentials" is returned BOTH for a wrong password
 *     and for an account that has never had one set. Those are different
 *     problems with different fixes, and silently guessing between them
 *     is how someone concludes the app is broken.
 *   · "email rate limit exceeded" reads like a fault in the account. It
 *     is a cap on the mail service, and saying so turns a dead end into
 *     a two-minute wait.
 */
export function signInMessage(raw: string): string {
  if (/invalid login credentials/i.test(raw)) {
    return "That email and password did not match. If you have never set a password, use the sign-in link below and set one from Account.";
  }
  if (/rate limit/i.test(raw)) {
    return "Too many links requested in the last hour — that is a limit on the email service, not on your account. Wait for the hour to turn, or sign in with your password.";
  }
  return raw;
}
