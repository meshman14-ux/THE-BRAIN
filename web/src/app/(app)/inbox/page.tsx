import { createClient } from "@/lib/supabase/server";
import Triage from "@/components/Triage";
import { readAttachment, SIGNED_URL_SECONDS } from "@/lib/capture";
import type { InboxItem, Pillar } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const supabase = await createClient();

  const [{ data: items }, { data: pillars }] = await Promise.all([
    supabase
      .from("inbox")
      .select("id, raw_text, captured_at, status, meta")
      .eq("status", "open")
      .order("captured_at", { ascending: true }),
    supabase
      .from("pillars")
      .select("id, system, name, emoji, standard, sort_order, active")
      .eq("active", true)
      .order("sort_order"),
  ]);

  // Photo/document captures carry an attachment in the private `captures`
  // bucket. Sign a short-lived URL per row here, server-side, so Triage can
  // show the file without the bucket ever being public. A failed signing
  // simply means no link — the row still triages as text.
  const fileUrls: Record<string, string> = {};
  await Promise.all(
    (items ?? []).map(async (item) => {
      const att = readAttachment(item.meta);
      if (!att) return;
      const { data } = await supabase.storage
        .from("captures")
        .createSignedUrl(att.path, SIGNED_URL_SECONDS);
      if (data?.signedUrl) fileUrls[item.id] = data.signedUrl;
    })
  );

  return (
    <div className="max-w-[760px] mx-auto">
      <header className="mb-5">
        <p className="label">Daily ritual · ~5 minutes</p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">Triage</h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">
          Every item gets a home or gets binned. Empty inbox is the goal — this is
          the one ritual the whole system depends on.
        </p>
      </header>

      <Triage
        items={(items ?? []) as InboxItem[]}
        pillars={(pillars ?? []) as Pillar[]}
        fileUrls={fileUrls}
      />
    </div>
  );
}
