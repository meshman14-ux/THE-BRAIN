import { redirect } from "next/navigation";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const MODULES = [
  { emoji: "🔗", name: "Links", blurb: "Your hub links — coming in Campaign 2" },
  { emoji: "🚀", name: "Projects", blurb: "Project cards — coming in Campaign 2" },
  { emoji: "📝", name: "Notes", blurb: "Coming in Campaign 3" },
  { emoji: "✅", name: "Tasks", blurb: "Coming in Campaign 3" },
  { emoji: "🔥", name: "Habits", blurb: "Coming in Campaign 3" },
  { emoji: "🎭", name: "Ledger", blurb: "The AI oracle — Campaign 4" },
];

export default async function Dashboard() {
  if (!supabaseConfigured) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="min-h-dvh px-5 py-10 flex justify-center">
      <div className="w-full max-w-[720px]">
        <header className="flex items-center gap-4 mb-8">
          <div className="avatar-gradient w-12 h-12 rounded-full flex items-center justify-center text-2xl select-none">
            🧠
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold leading-tight">THE BRAIN</h1>
            <p className="text-xs text-[var(--muted)]">
              Signed in as {user.email}
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <button className="brain-btn ghost text-sm" type="submit">
              Sign out
            </button>
          </form>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          {MODULES.map((m) => (
            <div key={m.name} className="brain-card p-5">
              <h2 className="font-semibold mb-1">
                {m.emoji} {m.name}
              </h2>
              <p className="text-sm text-[var(--muted)]">{m.blurb}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-[var(--muted)] mt-10">
          Campaign 1 complete — the foundations stand. ⚒️
        </p>
      </div>
    </main>
  );
}
