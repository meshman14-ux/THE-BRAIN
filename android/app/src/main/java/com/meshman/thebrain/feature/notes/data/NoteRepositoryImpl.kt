package com.meshman.thebrain.feature.notes.data

import com.meshman.thebrain.feature.notes.domain.Note
import com.meshman.thebrain.feature.notes.domain.NoteRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject

/**
 * Room-backed implementation. Translates between domain models and entities and
 * delegates to the DAO. Injected wherever a [NoteRepository] is required (Hilt
 * binds this class to the interface in RepositoryModule).
 */
class NoteRepositoryImpl @Inject constructor(
    private val dao: NoteDao,
) : NoteRepository {

    override fun observeNotes(query: String): Flow<List<Note>> =
        dao.observeNotes(query).map { list -> list.map { it.toDomain() } }

    override fun observeNote(id: String): Flow<Note?> =
        dao.observeNote(id).map { it?.toDomain() }

    override suspend fun upsert(note: Note) = dao.upsert(note.toEntity())

    override suspend fun setPinned(id: String, pinned: Boolean) =
        dao.setPinned(id, pinned, System.currentTimeMillis())

    override suspend fun delete(id: String) = dao.delete(id)
}
