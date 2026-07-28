package com.meshman.thebrain.feature.tasks.data

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.meshman.thebrain.feature.tasks.domain.Task

@Entity(tableName = "tasks")
data class TaskEntity(
    @PrimaryKey val id: String,
    val title: String,
    val notes: String?,
    val dueAt: Long?,
    val done: Boolean,
    val createdAt: Long,
    val completedAt: Long?,
)

fun TaskEntity.toDomain() = Task(id, title, notes, dueAt, done, createdAt, completedAt)

fun Task.toEntity() = TaskEntity(id, title, notes, dueAt, done, createdAt, completedAt)
