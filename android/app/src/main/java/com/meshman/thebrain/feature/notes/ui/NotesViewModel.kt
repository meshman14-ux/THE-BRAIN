package com.meshman.thebrain.feature.notes.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.meshman.thebrain.feature.notes.domain.Note
import com.meshman.thebrain.feature.notes.domain.NoteRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class NotesUiState(
    val notes: List<Note> = emptyList(),
    val query: String = "",
    val isLoading: Boolean = true,
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class NotesViewModel @Inject constructor(
    private val repository: NoteRepository,
) : ViewModel() {

    private val query = MutableStateFlow("")

    /** Re-runs the DB query whenever the search text changes, then folds the
     *  results + current query into one immutable UiState the screen collects. */
    val uiState: StateFlow<NotesUiState> =
        combine(
            query,
            query.flatMapLatest { repository.observeNotes(it) },
        ) { q, notes ->
            NotesUiState(notes = notes, query = q, isLoading = false)
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = NotesUiState(),
        )

    fun onQueryChange(value: String) {
        query.value = value
    }

    fun onTogglePin(note: Note) = viewModelScope.launch {
        repository.setPinned(note.id, !note.pinned)
    }

    fun onDelete(note: Note) = viewModelScope.launch {
        repository.delete(note.id)
    }
}
