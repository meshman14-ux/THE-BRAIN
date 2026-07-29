package com.meshman.thebrain.feature.tasks.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.meshman.thebrain.feature.tasks.domain.GroupedTasks
import com.meshman.thebrain.feature.tasks.domain.Task
import com.meshman.thebrain.feature.tasks.domain.TaskRepository
import com.meshman.thebrain.feature.tasks.domain.groupTasks
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class TasksUiState(
    val groups: GroupedTasks = GroupedTasks(),
    val isLoading: Boolean = true,
)

@HiltViewModel
class TasksViewModel @Inject constructor(
    private val repository: TaskRepository,
) : ViewModel() {

    val uiState: StateFlow<TasksUiState> =
        repository.observeTasks()
            .map { tasks -> TasksUiState(groups = groupTasks(tasks, System.currentTimeMillis()), isLoading = false) }
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                initialValue = TasksUiState(),
            )

    fun onAdd(title: String, dueAt: Long?) {
        if (title.isBlank()) return
        viewModelScope.launch { repository.add(title, dueAt) }
    }

    fun onToggleDone(task: Task) = viewModelScope.launch {
        repository.setDone(task.id, !task.done)
    }

    fun onDelete(task: Task) = viewModelScope.launch {
        repository.delete(task.id)
    }
}
