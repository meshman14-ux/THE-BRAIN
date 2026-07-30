import Link from "next/link";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  let signedIn = false;
  if (supabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = !!user;
  }

  return (
    <main className="min-h-dvh flex items-center justify-center px-5">
      <div className="w-full max-w-[620px] text-center py-16">
        <div className="avatar-gradient w-[88px] h-[88px] rounded-full mx-auto mb-5 flex items-center justify-center text-4xl select-none">
          🧠
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">THE BRAIN</h1>
        <p className="text-[var(--muted)] mb-8">
          v2.0 — now a living system. Links, projects, notes, tasks, and habits,
          synced in realtime.
        </p>

        {!supabaseConfigured ? (
          <div className="brain-card p-6 text-left">
            <h2 className="font-semibold mb-2">⚙️ Almost alive</h2>
            <p className="text-[var(--muted)] text-sm leading-relaxed">
              The app is deployed, but Supabase isn&apos;t connected yet. Add{" "}
              <code className="text-[var(--accent)]">
                NEXT_PUBLIC_SUPABASE_URL
              </code>{" "}
              and{" "}
              <code className="text-[var(--accent)]">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>{" "}
              in Vercel → Settings → Environment Variables, then redeploy.
            </p>
          </div>
        ) : (
          <div className="flex gap-3 justify-center">
            <Link
              href={signedIn ? "/dashboard" : "/login"}
              className="brain-btn inline-block no-underline"
            >
              {signedIn ? "Enter the Brain →" : "Sign in →"}
            </Link>
          </div>
        )}

        <p className="text-xs text-[var(--muted)] mt-10">
          Built on Next.js · Supabase · Vercel ·{" "}
          <a
            className="hover:text-[var(--accent)]"
            href="https://github.com/meshman14-ux/THE-BRAIN"
          >
            source
          </a>
        </p>
      </div>
    </main>
  );
}
