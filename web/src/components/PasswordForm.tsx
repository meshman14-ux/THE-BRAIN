"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MIN_PASSWORD, passwordProblem, passwordReady } from "@/lib/auth";

/**
 * Setting a password, once.
 *
 * `updateUser` works whether or not one exists already, so this is both
 * "set" and "change" — one form rather than two, because the difference
 * matters to the database and not to the person using it. The rules live
 * in lib/auth.ts, where they can be tested.
 */

export default function PasswordForm({ email }: { email: string }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [err, setErr] = useState("");

  const problem = passwordProblem(password, again);
  const tooShort = problem === "short";
  const mismatch = problem === "mismatch";
  const ready = passwordReady(password, again);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    setErr("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setState("error");
      setErr(error.message);
      return;
    }
    setState("done");
    setPassword("");
    setAgain("");
  }

  if (state === "done") {
    return (
      <div className="card p-5">
        <p className="font-semibold text-[0.95rem] m-0">Password set</p>
        <p className="text-[0.84rem] text-[var(--muted)] mt-2 leading-relaxed m-0 max-w-[60ch]">
          You can sign in with it from now on. Email is now only needed if you forget it —
          which means a two-an-hour limit on the mail service can no longer lock you out of
          your own system.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="card p-5 grid gap-3 max-w-[420px]">
      {/* Hidden but present: password managers need the account it belongs
          to in the same form, or they save the password against nothing. */}
      <input type="email" value={email} readOnly hidden autoComplete="username" />

      <div>
        <label className="label block" htmlFor="new-password">
          New password
        </label>
        <input
          id="new-password"
          className="input mt-1.5"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <p
          className="text-[0.72rem] mt-1.5 m-0"
          style={{ color: tooShort ? "var(--warn)" : "var(--faint)" }}
        >
          {tooShort
            ? `${MIN_PASSWORD - password.length} more character${
                MIN_PASSWORD - password.length === 1 ? "" : "s"
              } needed.`
            : `At least ${MIN_PASSWORD} characters. Let the phone generate and remember it — you will type it once.`}
        </p>
      </div>

      <div>
        <label className="label block" htmlFor="again">
          Again
        </label>
        <input
          id="again"
          className="input mt-1.5"
          type="password"
          autoComplete="new-password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          required
        />
        {mismatch && (
          <p className="text-[0.72rem] mt-1.5 m-0" style={{ color: "var(--warn)" }}>
            These do not match.
          </p>
        )}
      </div>

      <button className="btn" type="submit" disabled={!ready || state === "saving"}>
        {state === "saving" ? "Saving…" : "Set password"}
      </button>

      {state === "error" && (
        <p className="text-[0.82rem] m-0" style={{ color: "var(--bad)" }}>
          ⚠ {err}
        </p>
      )}
    </form>
  );
}
