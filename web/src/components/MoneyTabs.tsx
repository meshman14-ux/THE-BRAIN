"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Money from "./Money";
import type { PayoffDebt, Strategy } from "@/lib/logic";

/**
 * The strategy lives in the URL, exactly as the dashboard tab does.
 *
 * It could have been React state, but then "show me the snowball ordering"
 * would not be a thing he could bookmark, link to, or come back to — and
 * the whole point of pricing the choice is that he gets to sit with it.
 */
export default function MoneyTabs({
  debts,
  strategy,
  confirmedOn,
  today,
}: {
  debts: PayoffDebt[];
  strategy: Strategy;
  confirmedOn: Record<string, string | null>;
  today: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <Money
      debts={debts}
      strategy={strategy}
      confirmedOn={confirmedOn}
      today={today}
      onStrategy={(s) => {
        const next = new URLSearchParams(params.toString());
        if (s === "avalanche") next.delete("strategy");
        else next.set("strategy", s);
        const q = next.toString();
        router.push(`/life/money${q ? `?${q}` : ""}`);
      }}
    />
  );
}
