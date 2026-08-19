"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ProposalDraft } from "@/lib/venture/proposals";

/**
 * The proposals queue — the only route by which anything automated reaches
 * Jay, and it reaches him as a sentence he can disagree with.
 *
 * The drafts are DERIVED at read time from data that already exists, the
 * same way task dormancy and venture drift are. That is deliberate: a cron
 * job writing proposal rows would need to act as him with no session, which
 * means a service-role key, and this feature is nowhere near worth that
 * blast radius (§A8 item 12 says the same thing about calendar sync).
 *
 * What IS stored is the DECISION. Accepting writes the one field the
 * proposal is about; dismissing writes a `rejected` row so the same
 * observation does not come back tomorrow — durable, like a dismissed
 * diagnostic suggestion.
 */
export default function VentureProposals({
  drafts,
  hrefFor,
}: {
  drafts: ProposalDraft[];
  hrefFor: Record<string, string>;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  if (!drafts.length) return null;

  async function decide(draft: ProposalDraft, accept: boolean) {
    const key = `${draft.kind}:${draft.venture_id}`;
    setBusy(key);
    setNote("");

    // The record of the decision, either way. `applied` is only claimed
    // when a real field actually changed.
    const applied = accept && draft.kind === "dormancy";
    if (applied) {
      const { error } = await supabase
        .from("ventures")
        .update({ tier: "dormant", dormant_since: new Date().toISOString().slice(0, 10) })
        .eq("id", draft.venture_id);
      if (error) {
        setBusy(null);
        setNote(`Could not apply — ${error.message}`);
        return;
      }
    }

    const { error } = await supabase.from("venture_proposals").insert({
      venture_id: draft.venture_id,
      kind: draft.kind,
      label: draft.label,
      rationale: draft.rationale,
      payload: draft.payload,
      status: accept ? (applied ? "applied" : "accepted") : "rejected",
      decided_at: new Date().toISOString(),
    });
    setBusy(null);
    if (error) setNote(`Could not record the decision — ${error.message}`);
    else router.refresh();
  }

  return (
    <section className="panel min-w-0 flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <h2 className="label">Noticed</h2>
        <span className="text-[0.7rem] text-[var(--faint)]">
          {drafts.length} {drafts.length === 1 ? "observation" : "observations"} · nothing has
          been changed
        </span>
      </div>

      <ul className="flex flex-col gap-2.5">
        {drafts.map((d) => {
          const key = `${d.kind}:${d.venture_id}`;
          const href = hrefFor[d.venture_id];
          return (
            <li key={key} className="min-w-0 border-b border-[var(--line)] pb-2.5 last:border-0">
              <p className="text-[0.85rem] leading-snug">
                {href ? (
                  <Link href={href} style={{ color: "var(--accent)" }}>
                    {d.label}
                  </Link>
                ) : (
                  d.label
                )}
              </p>
              <p className="text-[0.75rem] text-[var(--muted)] leading-snug mt-1">{d.rationale}</p>
              <div className="flex gap-1.5 mt-1.5">
                <button
                  className="chip tap"
                  onClick={() => decide(d, true)}
                  disabled={busy === key}
                >
                  {d.kind === "dormancy" ? "Mark dormant" : "Noted"}
                </button>
                <button
                  className="chip tap"
                  onClick={() => decide(d, false)}
                  disabled={busy === key}
                >
                  Dismiss
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {note && (
        <p className="text-[0.75rem]" style={{ color: "var(--bad)" }}>
          {note}
        </p>
      )}
    </section>
  );
}
