package com.meshman.thebrain.feature.habits.ui

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.meshman.thebrain.core.navigation.HABIT_ID_ARG
import com.meshman.thebrain.feature.habits.domain.HabitDetail
import com.meshman.thebrain.feature.habits.domain.HabitRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class HabitDetailViewModel @Inject constructor(
    private val repository: HabitRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val habitId: String = savedStateHandle[HABIT_ID_ARG] ?: ""

    val detail: StateFlow<HabitDetail?> =
        repository.observeHabitDetail(habitId)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun delete(onDone: () -> Unit) = viewModelScope.launch {
        repository.deleteHabit(habitId)
        onDone()
    }
}
