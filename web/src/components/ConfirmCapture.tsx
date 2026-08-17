"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { invokeFunction } from "@/lib/invoke";
import {
  actionWord,
  confidenceWord,
  confirmLine,
  isOpen,
  rankProposals,
  readSheetCode,
  readUnclear,
  tally,
  targetWord,
  type CaptureRow,
  type ProposalRow,
} from "@/lib/proposals";

type Props = {
  capture: CaptureRow;
  proposals: ProposalRow[];
  fileUrl: string | null;
  folders: { key: string; label: string }[];
};

/**
 * The confirmation screen — the step the whole engine exists to protect.
 *
 * Nothing on this page has touched a real table. Each line is one proposed
 * fact with its own Accept and its own Reject, because a document that reads
 * a balance correctly and an APR wrongly should cost you the APR and no more.
 */
export default function ConfirmCapture({ capture, proposals, fileUrl, folders }: Props) {
  const [rows, setRows] = useState<ProposalRow[]>(proposals);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [filing, setFiling] = useState(false);
  const [driveMsg, setDriveMsg] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const t = tally(rows);
  const unclear = readUnclear(capture.extraction);
  const sheet = readSheetCode(capture.extraction);
  const conf = confidenceWord(capture.confidence);

  async function accept(p: ProposalRow) {
    setBusy(p.id);
    setErr("");
    const { error } = await supabase.rpc("apply_capture_proposal", { p_proposal_id: p.id });
    if (error) {
      setErr(`Could not apply that one — ${error.message}`);
      setRows((r) => r.map((x) => (x.id === p.id ? { ...x, status: "failed", error: error.message } : x)));
      setBusy(null);
      return;
    }
    setRows((r) => r.map((x) => (x.id === p.id ? { ...x, status: "applied", error: null } : x)));
    setBusy(null);
    router.refresh();
  }

  async function reject(p: ProposalRow) {
    setBusy(p.id);
    setErr("");
    const { error } = await supabase
      .from("capture_proposals")
      .update({ status: "rejected" })
      .eq("id", p.id);
    if (error) {
      setErr(`Could not reject that one — ${error.message}`);
      setBusy(null);
      return;
    }
    setRows((r) => r.map((x) => (x.id === p.id ? { ...x, status: "rejected" } : x)));
    setBusy(null);
  }

  async function acceptAll() {
    for (const p of rows.filter(isOpen)) await accept(p);
  }

  async function fileToDrive(folderKey?: string) {
    setFiling(true);
    setDriveMsg("");
    setErr("");
    const { error } = await invokeFunction(supabase, "capture-file-drive", {
      capture_id: capture.id,
      ...(folderKey ? { folder_key: folderKey } : {}),
    });
    if (error) {
      setErr(
        `Filing to Drive failed — ${error}. The document is still stored here; only the Drive copy is missing.`
      );
    } else {
      setDriveMsg(folderKey ? "Moved." : "Filed to Drive.");
      router.refresh();
    }
    setFiling(false);
  }

  return (
    <div className="grid gap-5">
      <section className="card p-4">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="label">{capture.doc_type?.replace(/_/g, " ") ?? "document"}</p>
            <h2 className="text-lg font-semibold mt-1">{capture.title ?? "Untitled"}</h2>
            <p className="text-sm text-[var(--muted)] mt-1">
              {confirmLine(t)}
              {conf && <span className="text-[var(--faint)]"> · {conf}</span>}
              {sheet && <span className="text-[var(--faint)]"> · sheet {sheet}</span>}
            </p>
          </div>
          {fileUrl && (
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost tap text-sm py-2 px-3 shrink-0"
            >
              See the photo ↗
            </a>
          )}
        </div>

        {unclear.length > 0 && (
          <div className="mt-3 border border-[var(--warn)] rounded-[var(--radius)] p-3">
            <p className="label text-[var(--warn)]">Could not read — check these yourself</p>
            <ul className="text-sm text-[var(--muted)] mt-1.5 grid gap-1 list-disc pl-4">
              {unclear.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {err && <p className="text-sm text-[var(--bad)]">⚠ {err}</p>}

      {rows.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="font-semibold">Nothing proposed</p>
          <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">
            It was read, but nothing in it mapped onto anything THE BRAIN tracks.
            The text is still stored against this capture.
          </p>
        </div>
      ) : (
        <section className="grid gap-2">
          {t.open > 1 && (
            <button className="btn tap text-sm py-2.5" onClick={acceptAll} disabled={busy !== null}>
              Accept all {t.open}
            </button>
          )}

          {rankProposals(rows).map((p) => {
            const open = isOpen(p);
            return (
              <div
                key={p.id}
                className={`card p-4 ${open ? "" : "opacity-60"}`}
              >
                <div className="flex items-start gap-2 flex-wrap">
                  <p className="min-w-0 flex-1 text-[0.94rem] leading-relaxed font-medium">
                    {p.label}
                  </p>
                  <span className="chip shrink-0 text-xs">
                    {targetWord(p.target_table)} · {actionWord(p.action)}
                  </span>
                </div>

                {p.rationale && (
                  <p className="text-xs text-[var(--faint)] mt-1.5 leading-relaxed">{p.rationale}</p>
                )}

                {p.status === "failed" && p.error && (
                  <p className="text-xs text-[var(--bad)] mt-1.5">Failed: {p.error}</p>
                )}

                {open ? (
                  <div className="flex gap-2 mt-3">
                    <button
                      className="btn tap text-sm py-2 px-3.5"
                      onClick={() => accept(p)}
                      disabled={busy !== null}
                    >
                      {busy === p.id ? "Saving…" : "Accept"}
                    </button>
                    <button
                      className="btn btn-ghost tap text-sm py-2 px-3.5"
                      onClick={() => reject(p)}
                      disabled={busy !== null}
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--muted)] mt-2 font-semibold uppercase tracking-wide">
                    {p.status === "applied"
                      ? "✓ saved"
                      : p.status === "rejected"
                        ? "rejected"
                        : p.status}
                  </p>
                )}
              </div>
            );
          })}
        </section>
      )}

      <section className="card p-4">
        <p className="label">The document itself</p>
        {capture.drive_url ? (
          <p className="text-sm text-[var(--muted)] mt-1.5 leading-relaxed">
            Filed in Drive as <span className="mono">{capture.drive_filename}</span>.{" "}
            <a href={capture.drive_url} target="_blank" rel="noreferrer" className="underline">
              Open it ↗
            </a>
          </p>
        ) : (
          <p className="text-sm text-[var(--muted)] mt-1.5 leading-relaxed">
            Not filed to Drive yet. Filing renames it properly and puts it in the
            right folder; skipping it changes nothing else.
          </p>
        )}

        <div className="flex flex-wrap gap-2 mt-3 items-center">
          <button
            className="btn btn-ghost tap text-sm py-2 px-3.5"
            onClick={() => fileToDrive()}
            disabled={filing}
          >
            {filing ? "Filing…" : capture.drive_url ? "Re-file" : "File it to Drive"}
          </button>
          <select
            className="input text-sm py-2 max-w-[15rem]"
            defaultValue=""
            onChange={(e) => e.target.value && fileToDrive(e.target.value)}
            disabled={filing}
            aria-label="Move to a different folder"
          >
            <option value="">Move to another folder…</option>
            {folders.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          {driveMsg && <span className="text-sm text-[var(--good)] font-semibold">✓ {driveMsg}</span>}
        </div>
      </section>

      <Link href="/capture" className="btn btn-ghost tap text-sm py-2.5 text-center">
        Capture something else
      </Link>
    </div>
  );
}
