package com.meshman.thebrain.feature.tasks.domain

data class Task(
    val id: String,
    val title: String,
    val notes: String?,
    val dueAt: Long?,
    val done: Boolean,
    val createdAt: Long,
    val completedAt: Long?,
)
