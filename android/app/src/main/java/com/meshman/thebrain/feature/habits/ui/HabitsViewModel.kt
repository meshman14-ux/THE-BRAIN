package com.meshman.thebrain.feature.habits.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.meshman.thebrain.feature.habits.domain.HabitRepository
import com.meshman.thebrain.feature.habits.domain.HabitWithStats
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HabitsUiState(
    val habits: List<HabitWithStats> = emptyList(),
    val isLoading: Boolean = true,
)

@HiltViewModel
class HabitsViewModel @Inject constructor(
    private val repository: HabitRepository,
) : ViewModel() {

    val uiState: StateFlow<HabitsUiState> =
        repository.observeHabits()
            .map { HabitsUiState(habits = it, isLoading = false) }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HabitsUiState())

    fun onAdd(name: String) = viewModelScope.launch { repository.addHabit(name) }

    fun onToggleToday(habit: HabitWithStats) = viewModelScope.launch {
        repository.toggleToday(habit.id)
    }
}
