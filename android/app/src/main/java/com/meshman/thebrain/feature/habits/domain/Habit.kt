package com.meshman.thebrain.feature.habits.domain

/** A habit plus the derived stats the UI needs. */
data class HabitWithStats(
    val id: String,
    val name: String,
    val createdAt: Long,
    val currentStreak: Int,
    /** Oldest → newest: whether each of the last 7 days (ending today) was done. */
    val lastSevenDays: List<Boolean>,
    val doneToday: Boolean,
)

/** Fuller view for the detail screen. */
data class HabitDetail(
    val id: String,
    val name: String,
    val currentStreak: Int,
    val longestStreak: Int,
    val totalCheckIns: Int,
    /** Start-of-day millis for each check-in, newest first. */
    val checkInDates: List<Long>,
)
