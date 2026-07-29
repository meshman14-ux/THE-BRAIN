package com.meshman.thebrain.feature.habits.domain

import com.meshman.thebrain.feature.habits.domain.HabitStreak.DAY_MS
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pure-logic tests — no Android, no database, no clock. We pass "today" in, so
 * every case is deterministic. This is the payoff of keeping streak math in a
 * pure object.
 */
class HabitStreakTest {

    private val today = 1_000_000L * DAY_MS // an arbitrary but fixed "today"

    @Test
    fun `empty history has no streak`() {
        assertEquals(0, HabitStreak.current(emptySet(), today))
        assertEquals(0, HabitStreak.longest(emptySet()))
    }

    @Test
    fun `three consecutive days ending today is a streak of 3`() {
        val days = setOf(today, today - DAY_MS, today - 2 * DAY_MS)
        assertEquals(3, HabitStreak.current(days, today))
    }

    @Test
    fun `streak counts from yesterday when today not yet done`() {
        val days = setOf(today - DAY_MS, today - 2 * DAY_MS)
        assertEquals(2, HabitStreak.current(days, today))
    }

    @Test
    fun `a gap breaks the current streak`() {
        // done today, but a gap two days ago
        val days = setOf(today, today - 3 * DAY_MS, today - 4 * DAY_MS)
        assertEquals(1, HabitStreak.current(days, today))
    }

    @Test
    fun `longest finds the best run anywhere in history`() {
        val days = setOf(
            today, today - DAY_MS,                       // run of 2 (current)
            today - 5 * DAY_MS, today - 6 * DAY_MS, today - 7 * DAY_MS, // run of 3
        )
        assertEquals(3, HabitStreak.longest(days))
    }

    @Test
    fun `last seven days reflects which were done, oldest first`() {
        val days = setOf(today, today - 2 * DAY_MS)
        val week = HabitStreak.lastSevenDays(days, today)
        assertEquals(7, week.size)
        assertEquals(true, week.last())        // today (newest)
        assertEquals(false, week[5])           // yesterday
        assertEquals(true, week[4])            // two days ago
    }
}
