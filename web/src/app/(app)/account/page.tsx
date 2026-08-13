import { createClient } from "@/lib/supabase/server";
import PasswordForm from "@/components/PasswordForm";
import { Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * Account — how you get in
 *
 * Small on purpose. The only thing here is the one that was a single
 * point of failure: sign-in depended entirely on an email arriving, and
 * the mail service behind it is capped at two an hour and carries no
 * delivery guarantee. Setting a password moves email from the daily path
 * to the recovery path, which is where a limit like that belongs.
 * ------------------------------------------------------------------ */

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Read as "who am I", not "do I have a password". Supabase does not
  // expose the latter — an account that has only ever used a magic link
  // still carries an "email" identity — and guessing at it would put a
  // confidently wrong sentence on the page.
  const email = user?.email ?? "";

  return (
    <div className="grid gap-6 max-w-[720px]">
      <header>
        <p className="label">THE BRAIN · Account</p>
        <h1 className="text-[1.6rem] font-semibold mt-1.5 leading-tight">How you get in</h1>
        <p className="text-[0.84rem] text-[var(--muted)] mt-2 max-w-[62ch] leading-relaxed">
          Signed in as <span className="mono">{email || "—"}</span>.
        </p>
      </header>

      <Panel title="Password" hint="so a mail service cannot lock you out of your own system">
        <p className="text-[0.84rem] text-[var(--muted)] leading-relaxed max-w-[62ch] mb-4">
          With a magic link, your email provider is your login — every sign-in depends on a
          message arriving, and the built-in mail service allows two an hour. Set a password
          and email is only needed if you forget it. The sign-in link still works either way.
        </p>
        <PasswordForm email={email} />
      </Panel>

      <Panel title="Sign out" hint="ends the session on this device only">
        {/* A POST, not a link. Sign-out is a state change, and a GET that
            changes state can be fired by a prefetch or a link preview. */}
        <form action="/auth/signout" method="post">
          <button type="submit" className="chip">
            Sign out
          </button>
        </form>
      </Panel>
    </div>
  );
}
