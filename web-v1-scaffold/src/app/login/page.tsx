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
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
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
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-6">
          <div className="avatar-gradient w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl select-none">
            🧠
          </div>
          <h1 className="text-xl font-bold">Enter THE BRAIN</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            A magic link will be sent to your email — no password needed.
          </p>
        </div>

        {!supabaseConfigured ? (
          <div className="brain-card p-5 text-sm text-[var(--muted)]">
            Supabase isn&apos;t configured yet — add the environment variables
            first (see the home page).
          </div>
        ) : status === "sent" ? (
          <div className="brain-card p-6 text-center">
            <div className="text-3xl mb-2">📬</div>
            <p className="font-semibold mb-1">Check your email</p>
            <p className="text-sm text-[var(--muted)]">
              A sign-in link is on its way to{" "}
              <span className="text-[var(--accent)]">{email}</span>. Open it on
              this device.
            </p>
          </div>
        ) : (
          <form onSubmit={sendLink} className="brain-card p-6 grid gap-3">
            <input
              className="brain-input"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <button
              className="brain-btn"
              type="submit"
              disabled={status === "sending" || !email.trim()}
            >
              {status === "sending" ? "Sending…" : "Send magic link"}
            </button>
            {status === "error" && (
              <p className="text-sm text-red-400">⚠ {errorMsg}</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
