import { createClient } from "@/lib/supabase/server";
import { toIso } from "@/lib/logic";
import HudPanel from "@/components/hud/HudPanel";
import TrendChart from "@/components/hud/TrendChart";
import MeasurementEntry, { type Measurement } from "@/components/MeasurementEntry";

export const dynamic = "force-dynamic";

/**
 * Body — the tape measure and the mass trend.
 *
 * `body_measurements` is a brand-new table (migration 20260818), so it is
 * empty on first load, exactly like `metric_readings` and `assets` were
 * before their own first writers landed. This page IS that writer, and it
 * follows the same rule those did: the entry form is on the same page as
 * the numbers it fills, never a separate "go here to add data" detour.
 *
 * Trend-based only. `TrendChart` already refuses to draw a line through
 * fewer than two points, so a single tape measurement reads as a value,
 * not a direction — the honesty rule every trend in this app already
 * holds. No recomp-target panel: `athlete_profile` carries no protein or
 * calorie target, and inventing one here would be exactly the failure
 * `debts.apr` and the pipeline's "no probability weighting" both refuse —
 * a plausible-looking number nobody actually set.
 */
export default async function MeasurementsPage() {
  const supabase = await createClient();
  const today = toIso(new Date());

  const [{ data: measurementRows }, { data: healthDays }] = await Promise.all([
    supabase
      .from("body_measurements")
      .select("on_date, chest_cm, waist_cm, arm_cm, thigh_cm, body_fat_pct")
      .order("on_date", { ascending: false })
      .limit(90),
    supabase
      .from("health_days")
      .select("on_date, weight_kg")
      .order("on_date", { ascending: true })
      .limit(90),
  ]);

  const measurements = (measurementRows ?? []) as Measurement[];
  const latest = measurements[0] ?? null;
  const todayRow = measurements.find((m) => m.on_date === today) ?? null;

  const massSeries = (healthDays ?? [])
    .map((d) => (d.weight_kg == null ? null : Number(d.weight_kg)))
    .filter((v): v is number => v != null);

  const bfSeries = [...measurements]
    .reverse()
    .map((m) => m.body_fat_pct)
    .filter((v): v is number => v != null);

  return (
    <div className="grid gap-5 max-w-[820px]">
      <header>
        <p className="label">Body · measurements</p>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: 6 }}>The tape</h1>
        <p style={{ fontSize: 13, color: "rgba(214,239,255,.6)", marginTop: 6, maxWidth: "62ch", lineHeight: 1.6 }}>
          Every field is independently optional — a waist-only day is a complete entry. Nothing here is guessed: a
          measurement not yet taken reads as &ldquo;not recorded&rdquo;, never as zero.
        </p>
      </header>

      <HudPanel serial="LOG.TPE" title="TODAY'S TAPE">
        <MeasurementEntry today={today} initial={todayRow} />
      </HudPanel>

      <HudPanel serial="SCN.LST" title="LATEST READING">
        {latest == null ? (
          <p style={{ fontSize: 13, color: "rgba(214,239,255,.5)" }}>Nothing recorded yet — log above.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12 }}>
            <Callout label="Chest" value={latest.chest_cm} unit="cm" />
            <Callout label="Waist" value={latest.waist_cm} unit="cm" />
            <Callout label="Arm" value={latest.arm_cm} unit="cm" />
            <Callout label="Thigh" value={latest.thigh_cm} unit="cm" />
            <Callout label="Body fat" value={latest.body_fat_pct} unit="%" />
          </div>
        )}
        <p className="mono" style={{ fontSize: 10, color: "rgba(79,195,247,.4)", marginTop: 10 }}>
          {latest ? `AS OF ${latest.on_date.toUpperCase()}` : ""}
        </p>
      </HudPanel>

      <HudPanel serial="CHT.MASS" title="MASS TREND" hint={massSeries.length > 0 ? `${massSeries[massSeries.length - 1]} KG` : undefined}>
        <TrendChart values={massSeries} axisLeft="-90D" axisRight="NOW" />
      </HudPanel>

      <HudPanel serial="CHT.BF" title="BODY-FAT TREND" hint={bfSeries.length > 0 ? `${bfSeries[bfSeries.length - 1]}%` : undefined}>
        <TrendChart values={bfSeries} axisLeft="EARLIEST" axisRight="NOW" />
      </HudPanel>
    </div>
  );
}

function Callout({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div style={{ border: "1px solid var(--hud-hair2)", padding: 10, textAlign: "center" }}>
      <span className="lbl">{label}</span>
      <div className="mono" style={{ fontSize: 16, color: value == null ? "rgba(214,239,255,.35)" : "var(--hud-core)", marginTop: 4 }}>
        {value == null ? "not recorded" : `${value} ${unit}`}
      </div>
    </div>
  );
}
