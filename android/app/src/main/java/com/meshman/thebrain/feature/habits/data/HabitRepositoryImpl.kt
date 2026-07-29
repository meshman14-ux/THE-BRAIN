package com.meshman.thebrain.feature.habits.data

import com.meshman.thebrain.core.util.startOfDayMillis
import com.meshman.thebrain.feature.habits.domain.HabitDetail
import com.meshman.thebrain.feature.habits.domain.HabitRepository
import com.meshman.thebrain.feature.habits.domain.HabitStreak
import com.meshman.thebrain.feature.habits.domain.HabitWithStats
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import java.util.UUID
import javax.inject.Inject

class HabitRepositoryImpl @Inject constructor(
    private val dao: HabitDao,
) : HabitRepository {

    override fun observeHabits(): Flow<List<HabitWithStats>> =
        combine(dao.observeHabits(), dao.observeAllEntries()) { habits, entries ->
            val today = startOfDayMillis()
            val byHabit = entries.groupBy({ it.habitId }, { it.date })
            habits.map { h ->
                val days = byHabit[h.id]?.toSet() ?: emptySet()
                HabitWithStats(
                    id = h.id,
                    name = h.name,
                    createdAt = h.createdAt,
                    currentStreak = HabitStreak.current(days, today),
                    lastSevenDays = HabitStreak.lastSevenDays(days, today),
                    doneToday = days.contains(today),
                )
            }
        }

    override fun observeHabitDetail(id: String): Flow<HabitDetail?> =
        combine(dao.observeHabit(id), dao.observeEntriesFor(id)) { habit, entries ->
            habit ?: return@combine null
            val days = entries.map { it.date }.toSet()
            HabitDetail(
                id = habit.id,
                name = habit.name,
                currentStreak = HabitStreak.current(days, startOfDayMillis()),
                longestStreak = HabitStreak.longest(days),
                totalCheckIns = days.size,
                checkInDates = days.sortedDescending(),
            )
        }

    override suspend fun addHabit(name: String) {
        if (name.isBlank()) return
        dao.insertHabit(
            HabitEntity(
                id = UUID.randomUUID().toString(),
                name = name.trim(),
                createdAt = System.currentTimeMillis(),
            )
        )
    }

    override suspend fun toggleToday(habitId: String) {
        val today = startOfDayMillis()
        if (dao.entryCount(habitId, today) > 0) {
            dao.deleteEntry(habitId, today)
        } else {
            dao.insertEntry(
                HabitEntryEntity(
                    id = UUID.randomUUID().toString(),
                    habitId = habitId,
                    date = today,
                )
            )
        }
    }

    override suspend fun deleteHabit(id: String) {
        dao.deleteEntriesFor(id)
        dao.deleteHabit(id)
    }
}
