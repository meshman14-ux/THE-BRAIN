package com.meshman.thebrain.feature.notes.data

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/**
 * Data Access Object. Room generates the implementation at build time from
 * these annotations. Functions returning [Flow] emit a fresh list whenever the
 * underlying table changes — the engine behind our reactive, offline-first UI.
 */
@Dao
interface NoteDao {

    @Query(
        """
        SELECT * FROM notes
        WHERE (:query = '' OR title LIKE '%' || :query || '%' OR body LIKE '%' || :query || '%')
        ORDER BY pinned DESC, updatedAt DESC
        """
    )
    fun observeNotes(query: String): Flow<List<NoteEntity>>

    @Query("SELECT * FROM notes WHERE id = :id")
    fun observeNote(id: String): Flow<NoteEntity?>

    @Upsert
    suspend fun upsert(note: NoteEntity)

    @Query("UPDATE notes SET pinned = :pinned, updatedAt = :updatedAt WHERE id = :id")
    suspend fun setPinned(id: String, pinned: Boolean, updatedAt: Long)

    @Query("DELETE FROM notes WHERE id = :id")
    suspend fun delete(id: String)
}
