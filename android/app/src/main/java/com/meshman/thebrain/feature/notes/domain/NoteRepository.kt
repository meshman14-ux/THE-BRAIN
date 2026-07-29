package com.meshman.thebrain.feature.notes.domain

import kotlinx.coroutines.flow.Flow

/**
 * The repository *interface* lives in the domain layer. The UI depends on this
 * abstraction; the concrete Room-backed implementation lives in the data layer
 * and is bound via Hilt. This is the Dependency Inversion Principle in practice.
 */
interface NoteRepository {
    /** A live stream of notes (pinned first, then newest). Emits again on any change. */
    fun observeNotes(query: String): Flow<List<Note>>

    fun observeNote(id: String): Flow<Note?>

    suspend fun upsert(note: Note)

    suspend fun setPinned(id: String, pinned: Boolean)

    suspend fun delete(id: String)
}
