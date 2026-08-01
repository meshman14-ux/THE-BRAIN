import { createClient } from "@/lib/supabase/server";
import Vehicles from "@/components/Vehicles";
import type { Vehicle } from "@/lib/types";
import { toIso, upcomingDeadlines } from "@/lib/logic";

export const dynamic = "force-dynamic";

export default async function VehiclesPage() {
  const supabase = await createClient();
  const today = toIso(new Date());

  const { data } = await supabase
    .from("vehicles")
    .select(
      "id, name, registration, make_model, tax_due, mot_due, insurance_due, last_service, next_service, status, pillar_id, sort_order, notes"
    )
    .order("sort_order");

  const vehicles = (data ?? []) as Vehicle[];
  const due = upcomingDeadlines(vehicles, today, 30);

  return (
    <div className="sys-life grid gap-7">
      <header>
        <p className="label">LIFE_OS · Vehicles</p>
        <h1 className="text-[1.7rem] font-semibold mt-1.5">
          Tax, MOT and insurance
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-[62ch] leading-relaxed">
          {due.length > 0
            ? `${due.length} thing${due.length === 1 ? "" : "s"} needs attention in the next 30 days.`
            : "Nothing due in the next 30 days. A blank date means not recorded, not clear."}
        </p>
      </header>

      <Vehicles vehicles={vehicles} today={today} />
    </div>
  );
}
