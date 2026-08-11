package com.meshman.thebrain.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

/**
 * The aggregation rules, proven on the JVM. These mirror
 * web/tests/samsung.test.ts — the two halves of the ingest path must
 * agree about what a day means.
 */
class DayAggregatorTest {

    private val cardiff: ZoneId = ZoneId.of("Europe/London")
    private fun at(iso: String): Long = java.time.Instant.parse(iso).toEpochMilli()

    @Test
    fun `a late-evening instant lands on the LOCAL day`() {
        val agg = DayAggregator(cardiff)
        // 23:30 UTC on the 1st is 00:30 BST on the 2nd.
        assertEquals(
            LocalDate.of(2026, 8, 2),
            agg.localDateOf(at("2026-08-01T23:30:00Z"))
        )
    }

    @Test
    fun `a night belongs to its wake date and fragments sum`() {
        val agg = DayAggregator(cardiff)
        agg.addSleepSession(at("2026-08-01T22:30:00Z"), at("2026-08-02T05:30:00Z")) // 7h
        agg.addSleepSession(at("2026-08-02T06:00:00Z"), at("2026-08-02T07:00:00Z")) // +1h
        val days = agg.build()
        assertEquals(8.0, days[LocalDate.of(2026, 8, 2)]!!["sleep_hours"])
    }

    @Test
    fun `a backwards sleep session is refused, not negated`() {
        val agg = DayAggregator(cardiff)
        agg.addSleepSession(at("2026-08-03T08:00:00Z"), at("2026-08-03T07:00:00Z"))
        assertNull(agg.build()[LocalDate.of(2026, 8, 3)])
    }

    @Test
    fun `the last weight of the day wins`() {
        val agg = DayAggregator(cardiff)
        agg.addWeight(at("2026-08-01T06:10:00Z"), 86.4)
        agg.addWeight(at("2026-08-01T18:40:00Z"), 86.1)
        agg.addWeight(at("2026-08-01T12:00:00Z"), 99.0) // earlier — must not win
        assertEquals(86.1, agg.build()[LocalDate.of(2026, 8, 1)]!!["weight_kg"])
    }

    @Test
    fun `rmssd averages the day's samples to one decimal`() {
        val agg = DayAggregator(cardiff)
        agg.addRmssd(at("2026-08-01T02:00:00Z"), 41.0)
        agg.addRmssd(at("2026-08-01T03:00:00Z"), 44.5)
        assertEquals(42.8, agg.build()[LocalDate.of(2026, 8, 1)]!!["rmssd"])
    }

    @Test
    fun `resting heart rate takes the last explicit reading, never a derivation`() {
        val agg = DayAggregator(cardiff)
        agg.addRestingHr(at("2026-08-01T07:00:00Z"), 58)
        agg.addRestingHr(at("2026-08-01T21:00:00Z"), 56)
        assertEquals(56L, agg.build()[LocalDate.of(2026, 8, 1)]!!["resting_hr"])
    }

    @Test
    fun `meals sum into the day`() {
        val agg = DayAggregator(cardiff)
        agg.addNutrition(at("2026-08-01T08:00:00Z"), 520.0, 32.5)
        agg.addNutrition(at("2026-08-01T13:00:00Z"), 740.0, 41.2)
        val d = agg.build()[LocalDate.of(2026, 8, 1)]!!
        assertEquals(1260L, d["calories"])
        assertEquals(73.7, d["protein_g"])
    }

    @Test
    fun `a day with nothing observed is absent, not zero`() {
        val agg = DayAggregator(cardiff)
        agg.addSteps(LocalDate.of(2026, 8, 1), 8410)
        val days = agg.build()
        assertFalse(days.containsKey(LocalDate.of(2026, 8, 2)))
        assertEquals(8410L, days[LocalDate.of(2026, 8, 1)]!!["steps"])
    }
}
