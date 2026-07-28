package com.meshman.thebrain.feature.notes.ui

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.meshman.thebrain.core.navigation.NOTE_ID_ARG
import com.meshman.thebrain.feature.notes.domain.Note
import com.meshman.thebrain.feature.notes.domain.NoteRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

data class NoteEditorUiState(
    val title: String = "",
    val body: String = "",
    val pinned: Boolean = false,
    val isNew: Boolean = true,
)

@HiltViewModel
class NoteEditorViewModel @Inject constructor(
    private val repository: NoteRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    // "new" is the sentinel the nav graph passes when creating a fresh note.
    private val noteId: String = savedStateHandle[NOTE_ID_ARG] ?: "new"
    private val existingId: String? = noteId.takeIf { it != "new" }
    private val createdAt: Long = System.currentTimeMillis()

    private val _uiState = MutableStateFlow(NoteEditorUiState(isNew = existingId == null))
    val uiState = _uiState.asStateFlow()

    init {
        existingId?.let { id ->
            viewModelScope.launch {
                repository.observeNote(id).first()?.let { note ->
                    _uiState.value = NoteEditorUiState(
                        title = note.title,
                        body = note.body,
                        pinned = note.pinned,
                        isNew = false,
                    )
                }
            }
        }
    }

    fun onTitleChange(v: String) { _uiState.value = _uiState.value.copy(title = v) }
    fun onBodyChange(v: String) { _uiState.value = _uiState.value.copy(body = v) }
    fun onTogglePin() { _uiState.value = _uiState.value.copy(pinned = !_uiState.value.pinned) }

    /** Persist. Called on back/save. Skips saving a truly empty new note. */
    fun save() {
        val s = _uiState.value
        if (existingId == null && s.title.isBlank() && s.body.isBlank()) return
        viewModelScope.launch {
            repository.upsert(
                Note(
                    id = existingId ?: UUID.randomUUID().toString(),
                    title = s.title.trim(),
                    body = s.body.trim(),
                    pinned = s.pinned,
                    createdAt = createdAt,
                    updatedAt = System.currentTimeMillis(),
                )
            )
        }
    }

    fun delete(onDone: () -> Unit) {
        val id = existingId ?: return onDone()
        viewModelScope.launch {
            repository.delete(id)
            onDone()
        }
    }
}
