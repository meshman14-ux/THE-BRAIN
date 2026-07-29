package com.meshman.thebrain.feature.notes.ui

import app.cash.turbine.test
import com.meshman.thebrain.feature.notes.domain.Note
import com.meshman.thebrain.feature.notes.domain.NoteRepository
import com.meshman.thebrain.util.MainDispatcherRule
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/**
 * A ViewModel test with NO Android and NO database — just a hand-written fake
 * repository. This is only possible because the ViewModel depends on the
 * NoteRepository *interface*, not the Room implementation.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NotesViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val backing = MutableStateFlow(
        listOf(
            note("1", "Alpha"),
            note("2", "Beta"),
        )
    )

    private val fakeRepo = object : NoteRepository {
        override fun observeNotes(query: String): Flow<List<Note>> =
            backing.map { list -> list.filter { query.isBlank() || it.title.contains(query, ignoreCase = true) } }
        override fun observeNote(id: String): Flow<Note?> = backing.map { it.firstOrNull { n -> n.id == id } }
        override suspend fun upsert(note: Note) {}
        override suspend fun setPinned(id: String, pinned: Boolean) {}
        override suspend fun delete(id: String) {}
    }

    @Test
    fun `emits all notes initially`() = runTest {
        val vm = NotesViewModel(fakeRepo)
        vm.uiState.test {
            // First emission may be the loading placeholder; advance to the real one.
            var state = awaitItem()
            while (state.isLoading) state = awaitItem()
            assertEquals(listOf("Alpha", "Beta"), state.notes.map { it.title })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `search filters the list`() = runTest {
        val vm = NotesViewModel(fakeRepo)
        vm.onQueryChange("beta")
        vm.uiState.test {
            var state = awaitItem()
            while (state.notes.size != 1) state = awaitItem()
            assertEquals(listOf("Beta"), state.notes.map { it.title })
            cancelAndIgnoreRemainingEvents()
        }
    }

    private companion object {
        fun note(id: String, title: String) =
            Note(id = id, title = title, body = "", pinned = false, createdAt = 0, updatedAt = 0)
    }
}
