import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConfirmCapture from "@/components/ConfirmCapture";
import { SIGNED_URL_SECONDS } from "@/lib/capture";
import type { CaptureRow, ProposalRow } from "@/lib/proposals";

export const dynamic = "force-dynamic";

export default async function ConfirmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: capture } = await supabase
    .from("captures")
    .select(
      "id, storage_path, mime_type, status, doc_type, title, confidence, error, captured_at, extraction, drive_url, drive_folder_key, drive_filename"
    )
    .eq("id", id)
    .maybeSingle();

  // RLS makes someone else's capture indistinguishable from a missing one,
  // which is the correct answer to both.
  if (!capture) notFound();

  const [{ data: proposals }, { data: folders }] = await Promise.all([
    supabase
      .from("capture_proposals")
      .select("id, target_table, target_id, action, label, rationale, confidence, status, error")
      .eq("capture_id", id)
      .order("created_at"),
    supabase.from("drive_folders").select("key, label").order("sort_order"),
  ]);

  // Signed server-side, five minutes, so the bucket stays private.
  const { data: signed } = await supabase.storage
    .from("captures")
    .createSignedUrl(capture.storage_path, SIGNED_URL_SECONDS);

  return (
    <div className="max-w-[620px] mx-auto">
      <header className="mb-5">
        <p className="label">Capture</p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">Does this look right?</h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">
          Nothing here has been saved yet. Accept the lines that are right and
          reject the ones that are not — each one on its own, so a single misread
          number costs you that number and nothing else.
        </p>
      </header>

      <ConfirmCapture
        capture={capture as CaptureRow}
        proposals={(proposals ?? []) as ProposalRow[]}
        fileUrl={signed?.signedUrl ?? null}
        folders={(folders ?? []) as { key: string; label: string }[]}
      />
    </div>
  );
}
