package com.meshman.thebrain.companion

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Health Connect records → one row per local day.
 *
 * Pure on purpose: everything here takes epoch millis and numbers, never a
 * Health Connect type, so the rules are testable on the JVM without a
 * device. The rules themselves mirror `web/src/lib/samsung.ts` — the two
 * halves of the ingest path must agree about what a day means:
 *
 *   - A date is the LOCAL date of the instant, in the zone the sync runs
 *     in. A step at 00:30 belongs to the day the person was living.
 *   - A night belongs to the morning it ends in; fragments on the same
 *     wake date sum. Backwards sessions are refused, not negated.
 *   - The last weight of the day wins.
 *   - Meals sum.
 *   - rMSSD readings average across the day (they are point measurements,
 *     usually overnight) and round to one decimal.
 *   - Resting heart rate takes the day's LAST explicit reading. It is
 *     never derived from raw heart-rate samples — a day's minimum is not
 *     a resting rate, the same refusal the CSV importer makes.
 *
 * Steps and active minutes arrive pre-aggregated per day from Health
 * Connect's own aggregate API (which de-duplicates multiple source apps
 * natively — better than the CSV path can do), so this class only files
 * them under the right date.
 */
class DayAggregator(private val zone: ZoneId) {

    /** date → the fields observed for that day. Absent = never mention it. */
    val days = sortedMapOf<LocalDate, MutableMap<String, Any>>()

    private fun day(d: LocalDate) = days.getOrPut(d) { mutableMapOf() }

    fun localDateOf(epochMs: Long): LocalDate =
        Instant.ofEpochMilli(epochMs).atZone(zone).toLocalDate()

    fun addSteps(date: LocalDate, steps: Long) {
        if (steps < 0) return
        day(date)["steps"] = steps
    }

    fun addActiveMinutes(date: LocalDate, minutes: Long) {
        if (minutes < 0) return
        day(date)["active_minutes"] = minutes
    }

    fun addSleepSession(startMs: Long, endMs: Long) {
        if (endMs <= startMs) return // backwards is refused, not negated
        val hours = (endMs - startMs) / 3_600_000.0
        if (hours > 24) return
        val wake = localDateOf(endMs)
        val held = day(wake)["sleep_hours"] as? Double ?: 0.0
        day(wake)["sleep_hours"] = Math.round((held + hours) * 10.0) / 10.0
    }

    private val lastWeightAt = mutableMapOf<LocalDate, Long>()
    fun addWeight(atMs: Long, kg: Double) {
        if (kg <= 0) return
        val d = localDateOf(atMs)
        val prev = lastWeightAt[d]
        if (prev == null || atMs > prev) {
            lastWeightAt[d] = atMs
            day(d)["weight_kg"] = Math.round(kg * 10.0) / 10.0
        }
    }

    private val rmssdSamples = mutableMapOf<LocalDate, MutableList<Double>>()
    fun addRmssd(atMs: Long, rmssd: Double) {
        if (rmssd <= 0) return
        rmssdSamples.getOrPut(localDateOf(atMs)) { mutableListOf() }.add(rmssd)
    }

    private val lastRestingAt = mutableMapOf<LocalDate, Long>()
    fun addRestingHr(atMs: Long, bpm: Long) {
        if (bpm <= 0) return
        val d = localDateOf(atMs)
        val prev = lastRestingAt[d]
        if (prev == null || atMs > prev) {
            lastRestingAt[d] = atMs
            day(d)["resting_hr"] = bpm
        }
    }

    fun addNutrition(atMs: Long, kcal: Double?, proteinG: Double?) {
        if (kcal == null && proteinG == null) return
        val d = localDateOf(atMs)
        if (kcal != null && kcal > 0) {
            val held = (day(d)["calories"] as? Long) ?: 0L
            day(d)["calories"] = held + Math.round(kcal)
        }
        if (proteinG != null && proteinG > 0) {
            val held = day(d)["protein_g"] as? Double ?: 0.0
            day(d)["protein_g"] = Math.round((held + proteinG) * 10.0) / 10.0
        }
    }

    /** Settle the averages, then hand the days over. */
    fun build(): Map<LocalDate, Map<String, Any>> {
        for ((d, samples) in rmssdSamples) {
            if (samples.isEmpty()) continue
            val avg = samples.sum() / samples.size
            day(d)["rmssd"] = Math.round(avg * 10.0) / 10.0
        }
        return days
    }
}
