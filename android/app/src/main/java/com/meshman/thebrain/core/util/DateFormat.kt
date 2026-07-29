package com.meshman.thebrain.core.util

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** Human date labels used across the app: "Today", "Tomorrow", a weekday, or a date. */
object DateFormat {

    fun dueLabel(dueAt: Long?, now: Long = System.currentTimeMillis()): String? {
        if (dueAt == null) return null
        val due = startOfDay(dueAt)
        val today = startOfDay(now)
        val dayMs = 24L * 60 * 60 * 1000
        return when (val diff = ((due - today) / dayMs).toInt()) {
            0 -> "Today"
            1 -> "Tomorrow"
            -1 -> "Yesterday"
            in 2..6 -> SimpleDateFormat("EEE", Locale.getDefault()).format(Date(dueAt))
            else -> {
                if (diff < 0) "Overdue" else SimpleDateFormat("d MMM", Locale.getDefault()).format(Date(dueAt))
            }
        }
    }

    fun greeting(now: Long = System.currentTimeMillis()): String {
        val hour = Calendar.getInstance().apply { timeInMillis = now }.get(Calendar.HOUR_OF_DAY)
        return when {
            hour < 5 -> "Good night"
            hour < 12 -> "Good morning"
            hour < 18 -> "Good afternoon"
            else -> "Good evening"
        }
    }

    fun longDate(now: Long = System.currentTimeMillis()): String =
        SimpleDateFormat("EEEE, d MMMM", Locale.getDefault()).format(Date(now))

    private fun startOfDay(ts: Long): Long = Calendar.getInstance().apply {
        timeInMillis = ts
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }.timeInMillis
}
