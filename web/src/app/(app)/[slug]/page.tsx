import Link from "next/link";
import { notFound } from "next/navigation";
import { placeholderFor } from "@/lib/placeholders";

export const dynamic = "force-dynamic";

/**
 * The honest placeholder. Every view on the JAY_OS sidebar resolves to a
 * page, so the shape of the system is visible before the flesh is on it.
 * Slugs not in the registry are genuinely unknown and 404 as they should.
 */
export default async function PlaceholderPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = placeholderFor(slug);
  if (!p) notFound();

  return (
    <div className="max-w-[560px] mx-auto pt-10 text-center">
      <p className="label">Not built yet</p>
      <h1 className="text-[1.7rem] font-semibold mt-2">{p.name}</h1>
      <p className="text-sm text-[var(--muted)] mt-3 leading-relaxed">
        {p.what}
      </p>
      <p className="mono text-[0.72rem] text-[var(--faint)] mt-4">{p.phase}</p>
      <div className="flex gap-2 justify-center mt-7">
        <Link href="/dashboard" className="btn btn-ghost no-underline">
          ← Dashboard
        </Link>
        <Link href="/capture" className="btn no-underline">
          Capture a thought
        </Link>
      </div>
      <p className="text-[0.74rem] text-[var(--faint)] mt-6 leading-relaxed">
        This page exists so the system's shape is visible before every part of
        it is built. What you capture now will already be here when it is.
      </p>
    </div>
  );
}
