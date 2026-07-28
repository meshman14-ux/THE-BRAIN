package com.meshman.thebrain.feature.tasks.domain

import java.util.Calendar

/** The three buckets the Tasks screen shows. */
data class GroupedTasks(
    val today: List<Task> = emptyList(),
    val upcoming: List<Task> = emptyList(),
    val done: List<Task> = emptyList(),
)

/**
 * Pure grouping logic (no Android, no time-now side effects) so it can be unit
 * tested deterministically by passing [now]. Overdue undone tasks fall into
 * "today" so they stay visible until handled.
 */
fun groupTasks(tasks: List<Task>, now: Long): GroupedTasks {
    val endOfToday = endOfDay(now)
    val today = mutableListOf<Task>()
    val upcoming = mutableListOf<Task>()
    val done = mutableListOf<Task>()

    for (t in tasks) {
        when {
            t.done -> done += t
            t.dueAt != null && t.dueAt <= endOfToday -> today += t
            else -> upcoming += t
        }
    }
    return GroupedTasks(today = today, upcoming = upcoming, done = done)
}

private fun endOfDay(now: Long): Long {
    val cal = Calendar.getInstance().apply {
        timeInMillis = now
        set(Calendar.HOUR_OF_DAY, 23)
        set(Calendar.MINUTE, 59)
        set(Calendar.SECOND, 59)
        set(Calendar.MILLISECOND, 999)
    }
    return cal.timeInMillis
}
