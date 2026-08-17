import Capture from "@/components/Capture";
import PhoneRelay from "@/components/PhoneRelay";
import { readDoor } from "@/lib/push";

export const dynamic = "force-dynamic";

export default async function CapturePage({
  searchParams,
}: {
  searchParams: Promise<{ door?: string }>;
}) {
  // A QR scan or a notification tap lands here with ?door=photo — the page
  // highlights that door. It cannot press it: the camera needs a tap on the
  // device itself, by the browser's own rules.
  const door = readDoor((await searchParams).door);

  return (
    <div className="max-w-[620px] mx-auto">
      <header className="mb-5">
        <p className="label">Inbox</p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">Capture</h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">
          Four doors, one queue. Type it, photograph it, upload it, or answer the
          setup questions — everything lands in the inbox with no pillar, no
          project, no decision. Triage happens later at a desk.
        </p>
      </header>
      <Capture door={door} />
      <div className="mt-5">
        <PhoneRelay />
      </div>
    </div>
  );
}
