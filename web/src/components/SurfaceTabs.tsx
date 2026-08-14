import Link from "next/link";
import type { SurfaceView } from "@/lib/surfaces";

/**
 * The strip that turns sibling routes into one surface.
 *
 * PlanTabs' idiom without PlanTabs' extras: a label, the views as chips,
 * the current one marked. Each view stays its own route and fetches only
 * what it shows — the strip is navigation, not composition.
 */
export default function SurfaceTabs({
  label,
  views,
  active,
}: {
  label: string;
  views: SurfaceView[];
  active: string;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap items-center mb-4">
      <span className="label mr-1">{label}</span>
      {views.map((v) => (
        <Link
          key={v.key}
          href={v.href}
          className="chip no-underline"
          data-active={v.key === active}
        >
          {v.label}
        </Link>
      ))}
    </div>
  );
}
