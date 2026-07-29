package com.meshman.thebrain.feature.habits.domain

import kotlinx.coroutines.flow.Flow

interface HabitRepository {
    fun observeHabits(): Flow<List<HabitWithStats>>
    fun observeHabitDetail(id: String): Flow<HabitDetail?>
    suspend fun addHabit(name: String)
    suspend fun toggleToday(habitId: String)
    suspend fun deleteHabit(id: String)
}
