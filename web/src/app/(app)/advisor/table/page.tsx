import SurfaceTabs from "@/components/SurfaceTabs";
import Council from "@/components/Council";
import { ASK_VIEWS } from "@/lib/surfaces";
import { QUOTES } from "@/lib/council";
import { isConfigured, missingConfig } from "@/lib/claude";

export const dynamic = "force-dynamic";

/**
 * The table — the Peaky Blinders council, the fourth Ask surface.
 *
 * The advisor reads your own notes back with citations; the board casts a
 * panel for a decision; the table is two fixed voices in deliberate
 * friction — Tommy Shelby's strategic read against Alfie Solomons' account
 * of what the plan is pretending not to know. The value is the friction:
 * they speak in turn, they are allowed to disagree, and every plan leaves
 * with its price attached.
 *
 * No database query on this page at all. The council advises on what Jay
 * puts to it, the conversation lives in his browser, and the route it calls
 * writes nothing — decision 6 with nothing to enforce because there is
 * nothing to slip.
 */
export default function TablePage() {
  return (
    <div className="max-w-[760px] mx-auto">
      <SurfaceTabs label="Ask" views={ASK_VIEWS} active="table" />
      <header className="mb-5">
        <p className="label">Ask</p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">The table</h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed max-w-[68ch]">
          A two-man council. Tommy reads the position and names the move;
          Alfie names the lie underneath the plan. They speak in turn, they do
          not always agree, and nothing leaves the table without its price.
          Every line they quote is one of the {QUOTES.length} in the bank —
          the council never invents one. Advisory, never autonomous: it
          answers back, it cannot touch a single row.
        </p>
      </header>

      <Council configured={isConfigured()} missing={missingConfig()} />
    </div>
  );
}
