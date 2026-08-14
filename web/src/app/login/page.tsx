"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { signInMessage } from "@/lib/auth";

/* ------------------------------------------------------------------ *
 * Sign in — password first, link second
 *
 * This was magic-link only, and the reason it changed is worth writing
 * down: with a link, YOUR EMAIL PROVIDER IS YOUR LOGIN. Every single
 * sign-in depended on a message arriving, and Supabase's built-in mail
 * service is capped at two an hour and explicitly not meant for
 * production. That cap locked the owner out of his own operating system,
 * which is the sort of failure that ends a habit — and no amount of good
 * design downstream survives not being able to get in.
 *
 * A password moves email off the daily path and onto the recovery path,
 * where a two-an-hour limit is fine. It is the difference between "I open
 * THE BRAIN every morning" and "I open THE BRAIN when the email arrives".
 *
 * The magic link STAYS. It is the way back in when the password is
 * forgotten, and removing it would move the single point of failure
 * rather than remove it.
 * ------------------------------------------------------------------ */

type Mode = "password" | "link";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!supabaseConfigured) return;
    setStatus("working");
    setErrorMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setStatus("error");
      setErrorMsg(signInMessage(error.message));
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!supabaseConfigured) return;
    setStatus("working");
    setErrorMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    if (error) {
      setStatus("error");
      setErrorMsg(signInMessage(error.message));
      return;
    }
    setStatus("sent");
  }

  return (
    <main className="min-h-dvh flex items-center justify-center px-5">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4 select-none">🧠</div>
          <h1 className="text-[1.7rem] font-semibold">THE BRAIN</h1>
          <p className="label mt-2">LIFE_OS · EMPIRE_OS</p>
        </div>

        {status === "sent" ? (
          <div className="card p-7 text-center">
            <div className="text-3xl mb-3">📬</div>
            <p className="font-semibold mb-2">Check your email</p>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              A sign-in link is on its way to{" "}
              <span className="text-[var(--life)]">{email}</span>. Open it on this device.
            </p>
            <button
              className="chip mt-4"
              onClick={() => {
                setStatus("idle");
                setMode("password");
              }}
            >
              Use a password instead
            </button>
          </div>
        ) : (
          <form
            onSubmit={mode === "password" ? signIn : sendLink}
            className="card p-7 grid gap-3"
          >
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />

            {mode === "password" && (
              <>
                <label className="label mt-1" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  // Tells the browser and the phone keychain this is a
                  // sign-in field, so it offers to fill and to save.
                  autoComplete="current-password"
                />
              </>
            )}

            <button
              className="btn mt-1"
              type="submit"
              disabled={
                status === "working" || !email.trim() || (mode === "password" && !password)
              }
            >
              {status === "working"
                ? mode === "password"
                  ? "Signing in…"
                  : "Sending…"
                : mode === "password"
                  ? "Sign in"
                  : "Send sign-in link"}
            </button>

            {status === "error" && (
              <p className="text-sm text-[var(--bad)] leading-relaxed">⚠ {errorMsg}</p>
            )}

            <button
              type="button"
              onClick={() => {
                setMode(mode === "password" ? "link" : "password");
                setStatus("idle");
                setErrorMsg("");
              }}
              // `.tap` + a 38px floor. This sits OUTSIDE the (app) layout, so no
              // earlier tap-target sweep covered it — it measured 16px, the
              // smallest control in the product, and it is the only way back
              // in when the password is the thing you have forgotten.
              className="tap min-h-[38px] text-xs text-[var(--faint)] text-center mt-1 bg-transparent border-0 cursor-pointer underline"
            >
              {mode === "password"
                ? "Forgotten it? Email me a sign-in link"
                : "Sign in with a password instead"}
            </button>

            <p className="text-xs text-[var(--faint)] text-center leading-relaxed">
              {mode === "password"
                ? "A password keeps email off the daily path."
                : "Links are limited to a couple an hour by the mail service."}
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
