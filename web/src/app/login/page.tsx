"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState("");

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!supabaseConfigured) return;
    setStatus("sending");
    setErrorMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("sent");
    }
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
              <span className="text-[var(--life)]">{email}</span>. Open it on
              this device.
            </p>
          </div>
        ) : (
          <form onSubmit={sendLink} className="card p-7 grid gap-3">
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
            <button
              className="btn mt-1"
              type="submit"
              disabled={status === "sending" || !email.trim()}
            >
              {status === "sending" ? "Sending…" : "Send magic link"}
            </button>
            {status === "error" && (
              <p className="text-sm text-[var(--bad)]">⚠ {errorMsg}</p>
            )}
            <p className="text-xs text-[var(--faint)] text-center mt-1">
              No password. The link signs you in.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
