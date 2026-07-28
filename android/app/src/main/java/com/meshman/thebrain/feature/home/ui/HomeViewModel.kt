package com.meshman.thebrain.feature.home.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.meshman.thebrain.feature.habits.domain.HabitRepository
import com.meshman.thebrain.feature.habits.domain.HabitWithStats
import com.meshman.thebrain.feature.notes.domain.Note
import com.meshman.thebrain.feature.notes.domain.NoteRepository
import com.meshman.thebrain.feature.tasks.domain.Task
import com.meshman.thebrain.feature.tasks.domain.TaskRepository
import com.meshman.thebrain.feature.tasks.domain.groupTasks
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HomeUiState(
    val todayTasks: List<Task> = emptyList(),
    val habits: List<HabitWithStats> = emptyList(),
    val recentNotes: List<Note> = emptyList(),
    val isLoading: Boolean = true,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val taskRepository: TaskRepository,
    private val habitRepository: HabitRepository,
    private val noteRepository: NoteRepository,
) : ViewModel() {

    val uiState: StateFlow<HomeUiState> =
        combine(
            taskRepository.observeTasks(),
            habitRepository.observeHabits(),
            noteRepository.observeNotes(""),
        ) { tasks, habits, notes ->
            HomeUiState(
                todayTasks = groupTasks(tasks, System.currentTimeMillis()).today,
                habits = habits,
                recentNotes = notes.take(3),
                isLoading = false,
            )
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HomeUiState())

    fun onToggleTask(task: Task) = viewModelScope.launch { taskRepository.setDone(task.id, !task.done) }

    fun onToggleHabit(habit: HabitWithStats) = viewModelScope.launch { habitRepository.toggleToday(habit.id) }
}
