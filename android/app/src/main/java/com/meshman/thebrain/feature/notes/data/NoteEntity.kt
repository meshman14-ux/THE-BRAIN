package com.meshman.thebrain.feature.notes.data

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.meshman.thebrain.feature.notes.domain.Note

/** Room table row. Every entity has a stable id + createdAt/updatedAt from day one. */
@Entity(tableName = "notes")
data class NoteEntity(
    @PrimaryKey val id: String,
    val title: String,
    val body: String,
    val pinned: Boolean,
    val createdAt: Long,
    val updatedAt: Long,
)

// ---- Mappers between the storage entity and the domain model ----

fun NoteEntity.toDomain() = Note(
    id = id,
    title = title,
    body = body,
    pinned = pinned,
    createdAt = createdAt,
    updatedAt = updatedAt,
)

fun Note.toEntity() = NoteEntity(
    id = id,
    title = title,
    body = body,
    pinned = pinned,
    createdAt = createdAt,
    updatedAt = updatedAt,
)
