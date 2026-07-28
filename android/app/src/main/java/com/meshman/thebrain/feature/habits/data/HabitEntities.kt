package com.meshman.thebrain.feature.habits.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** A habit definition. */
@Entity(tableName = "habits")
data class HabitEntity(
    @PrimaryKey val id: String,
    val name: String,
    val createdAt: Long,
)

/**
 * One check-in = one row (per habit, per day). Storing check-ins as their own
 * table — instead of a JSON blob on the habit — is what makes streak queries and
 * history real, indexable data. The unique index blocks accidental duplicates.
 */
@Entity(
    tableName = "habit_entries",
    indices = [Index(value = ["habitId", "date"], unique = true)],
)
data class HabitEntryEntity(
    @PrimaryKey val id: String,
    val habitId: String,
    val date: Long, // normalized to start-of-day millis
)
