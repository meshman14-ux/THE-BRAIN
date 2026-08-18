"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { readMotivationBody, MOTIVATION_MAX_LEN } from "@/lib/cockpit/motivation";

/**
 * The whole floor: one box, one tap. No title, no mood, no tags — the
 * spec's own words are "a thing you wrote, and when," and a second field
 * would be a second reason not to use it.
 */
export default function AddMotivation() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function save() {
    const body = readMotivationBody(text);
    if (!body) return;
    setBusy(true);
    setErr("");
    const { error } = await supabase.from("motivation").insert({ body });
    setBusy(false);
    if (error) {
      setErr("That did not save — try again.");
      return;
    }
    setText("");
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      <textarea
        className="input"
        rows={3}
        maxLength={MOTIVATION_MAX_LEN}
        placeholder="What's keeping you at it?"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <button className="btn" disabled={busy || text.trim().length === 0} onClick={() => void save()}>
          {busy ? "Saving…" : "Write it down"}
        </button>
        {err && <span className="text-[0.74rem]" style={{ color: "var(--bad)" }}>{err}</span>}
      </div>
    </div>
  );
}
