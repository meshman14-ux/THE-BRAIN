package com.meshman.thebrain.feature.tasks.domain

import kotlinx.coroutines.flow.Flow

interface TaskRepository {
    fun observeTasks(): Flow<List<Task>>
    suspend fun add(title: String, dueAt: Long?)
    suspend fun setDone(id: String, done: Boolean)
    suspend fun delete(id: String)
}
