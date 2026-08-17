"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { invokeFunction } from "@/lib/invoke";
import {
  ENERGY_WORDS,
  energyWord,
  isRecorded,
  type ReflectionKind,
} from "@/lib/reflect";

type Existing = {
  transcript: string | null;
  one_thing: string | null;
  it_happened: boolean | null;
  energy: number | null;
} | null;

type SpeechLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

/**
 * The daily reflection.
 *
 * TWO TAPS ARE THE WHOLE FLOOR — did the thing happen, and how was the energy.
 * Voice is the ceiling and is never required: Jay works with his hands, so at
 * 9pm talking costs less than typing, but a bad day or a browser without
 * speech must never break the run. Every control writes on its own, so a
 * half-finished reflection is still a reflection.
 */
export default function Reflect({
  kind,
  date,
  existing,
}: {
  kind: ReflectionKind;
  date: string;
  existing: Existing;
}) {
  const [happened, setHappened] = useState<boolean | null>(existing?.it_happened ?? null);
  const [energy, setEnergy] = useState<number | null>(existing?.energy ?? null);
  const [text, setText] = useState(existing?.transcript ?? "");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const recRef = useRef<SpeechLike | null>(null);
  const router = useRouter();
  const supabase = createClient();

  // Checked, never assumed — an unsupported browser falls through to the taps
  // rather than showing a button that does nothing.
  const speechSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  async function save(patch: Record<string, unknown>) {
    setErr("");
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) {
      setErr("No signed-in session — sign in again.");
      return false;
    }
    // Unique on (user, date, kind), so a second attempt UPDATES rather than
    // duplicating: reflecting twice in an evening is one reflection.
    const { error } = await supabase.from("reflections").upsert(
      {
        user_id: uid,
        on_date: date,
        kind,
        source: patch.transcript ? "voice" : "tap",
        ...patch,
      },
      { onConflict: "user_id,on_date,kind" }
    );
    if (error) {
      setErr(`That did not save — ${error.message}`);
      return false;
    }
    return true;
  }

  async function tapHappened(v: boolean) {
    setHappened(v);
    if (await save({ it_happened: v })) {
      setMsg("Saved");
      router.refresh();
    }
  }

  async function tapEnergy(n: number) {
    setEnergy(n);
    if (await save({ energy: n })) {
      setMsg("Saved");
      router.refresh();
    }
  }

  function toggleVoice() {
    setErr("");
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => SpeechLike })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechLike })
        .webkitSpeechRecognition;
    if (!Ctor) {
      setErr("This browser cannot listen. Type it, or use the taps above.");
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-GB";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let heard = "";
      for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
      setText(heard.trim());
    };
    rec.onerror = () => {
      setErr("The microphone stopped. What was heard is kept — the taps still work.");
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  /**
   * Send the words to be read. The Advisor writes the reflection row itself in
   * `parse` mode, so this saves nothing first — two writers for one row is how
   * a transcript gets half-overwritten.
   */
  async function sendToAdvisor() {
    const transcript = text.trim();
    if (!transcript) return;
    setBusy(true);
    setErr("");
    setMsg("");
    const { error } = await invokeFunction(supabase, "advisor", {
      mode: "parse",
      transcript,
      kind,
      on_date: date,
    });
    if (error) {
      // Never lose the words because the reader was unavailable.
      const why = error;
      const kept = await save({ transcript });
      setErr(
        kept
          ? `Saved your words, but the Advisor could not read them — ${why}`
          : `The Advisor failed — ${why} — and so did saving.`
      );
    } else {
      setMsg("Read and filed.");
      router.refresh();
    }
    setBusy(false);
  }

  const recorded = isRecorded({
    transcript: text,
    it_happened: happened,
    energy,
    one_thing: existing?.one_thing ?? null,
  });

  return (
    <div className="grid gap-5">
      <section className="card p-4">
        <p className="label mb-3">
          {kind === "evening" ? "Did the one thing happen?" : "Is the one thing set?"}
        </p>
        <div className="flex gap-2">
          <button
            className={`btn tap text-sm py-2.5 flex-1 ${happened === true ? "" : "btn-ghost"}`}
            onClick={() => tapHappened(true)}
          >
            Yes
          </button>
          <button
            className={`btn tap text-sm py-2.5 flex-1 ${happened === false ? "" : "btn-ghost"}`}
            onClick={() => tapHappened(false)}
          >
            No
          </button>
        </div>

        <p className="label mt-4 mb-3">How was the energy?</p>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className={`chip tap ${energy === n ? "border-[var(--accent)] text-[var(--text)]" : ""}`}
              onClick={() => tapEnergy(n)}
            >
              {ENERGY_WORDS[n]}
            </button>
          ))}
        </div>

        <p className="text-xs text-[var(--faint)] mt-3 leading-relaxed">
          That is the whole floor — two taps and you are done.
          {energy !== null && ` Today reads ${energyWord(energy)}.`}
        </p>
      </section>

      <section className="card p-4">
        <p className="label mb-2">Say more, if you want to</p>
        <textarea
          className="input min-h-[120px] resize-y leading-relaxed w-full"
          placeholder={
            kind === "evening"
              ? "What actually happened today?"
              : "What is today for?"
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap gap-2 mt-3">
          {speechSupported && (
            <button
              className={`btn tap text-sm py-2.5 ${listening ? "" : "btn-ghost"}`}
              onClick={toggleVoice}
              disabled={busy}
            >
              {listening ? "◼ Stop" : "🎙 Talk instead"}
            </button>
          )}
          <button
            className="btn tap text-sm py-2.5"
            onClick={sendToAdvisor}
            disabled={busy || !text.trim()}
          >
            {busy ? "Reading…" : "Done — read it"}
          </button>
        </div>
        {!speechSupported && (
          <p className="text-xs text-[var(--faint)] mt-2">
            This browser cannot listen, so typing it is. The taps above are still
            the whole floor.
          </p>
        )}
      </section>

      {msg && <p className="text-sm text-[var(--good)] font-semibold">✓ {msg}</p>}
      {err && <p className="text-sm text-[var(--bad)]">⚠ {err}</p>}

      {recorded && (
        <p className="text-sm text-[var(--muted)]">
          {date} is recorded. Anything else you add updates it rather than
          starting a second one.
        </p>
      )}
    </div>
  );
}
