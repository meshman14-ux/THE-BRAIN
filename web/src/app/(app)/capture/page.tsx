import Capture from "@/components/Capture";

export const dynamic = "force-dynamic";

export default function CapturePage() {
  return (
    <div className="max-w-[620px] mx-auto">
      <header className="mb-5">
        <p className="label">Inbox</p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">Capture</h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">
          One box. No pillar, no project, no decision. Get it out of your head and
          carry on — triage happens later at a desk.
        </p>
      </header>
      <Capture />
    </div>
  );
}
