import { redirect } from "next/navigation";

/**
 * Vehicles now lives inside Money.
 *
 * A vehicle is a recurring cost and a set of legal deadlines. Filing it as
 * neither of those — filing it as "a vehicle" — is precisely why four MOT
 * dates sat unrecorded for months and the Zafira's lapsed unnoticed on
 * 8 July. The deadlines belong beside the money they cost.
 *
 * Vehicles is a page under Money since 2026-08-14. A vehicle is a recurring cost and a set of legal deadlines, filed beside the money it costs.
 */
export default function VehiclesPage() {
  redirect("/life/money/vehicles");
}
