package com.meshman.thebrain.feature.habits.domain

import kotlin.math.max

/**
 * Pure streak math over a set of check-in days (each normalized to start-of-day
 * millis). No clock reads inside — [today] is passed in — so these are trivially
 * unit-testable (see HabitStreakTest).
 */
object HabitStreak {

    const val DAY_MS: Long = 24L * 60 * 60 * 1000

    /** Current run of consecutive days ending today (or yesterday, if today isn't done yet). */
    fun current(daysDone: Set<Long>, today: Long): Int {
        if (daysDone.isEmpty()) return 0
        // Anchor: today if done, else yesterday if done, else streak is 0.
        var cursor = when {
            daysDone.contains(today) -> today
            daysDone.contains(today - DAY_MS) -> today - DAY_MS
            else -> return 0
        }
        var count = 0
        while (daysDone.contains(cursor)) {
            count++
            cursor -= DAY_MS
        }
        return count
    }

    /** The longest consecutive run anywhere in the history. */
    fun longest(daysDone: Set<Long>): Int {
        if (daysDone.isEmpty()) return 0
        val sorted = daysDone.sorted()
        var best = 1
        var run = 1
        for (i in 1 until sorted.size) {
            run = if (sorted[i] - sorted[i - 1] == DAY_MS) run + 1 else 1
            best = max(best, run)
        }
        return best
    }

    /** For the little week strip: oldest→newest booleans for the last 7 days ending [today]. */
    fun lastSevenDays(daysDone: Set<Long>, today: Long): List<Boolean> =
        (6 downTo 0).map { offset -> daysDone.contains(today - offset * DAY_MS) }
}
