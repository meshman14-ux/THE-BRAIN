package com.meshman.thebrain.feature.tasks.data

import com.meshman.thebrain.feature.tasks.domain.Task
import com.meshman.thebrain.feature.tasks.domain.TaskRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.UUID
import javax.inject.Inject

class TaskRepositoryImpl @Inject constructor(
    private val dao: TaskDao,
) : TaskRepository {

    override fun observeTasks(): Flow<List<Task>> =
        dao.observeTasks().map { list -> list.map { it.toDomain() } }

    override suspend fun add(title: String, dueAt: Long?) {
        val now = System.currentTimeMillis()
        dao.upsert(
            Task(
                id = UUID.randomUUID().toString(),
                title = title.trim(),
                notes = null,
                dueAt = dueAt,
                done = false,
                createdAt = now,
                completedAt = null,
            ).toEntity()
        )
    }

    override suspend fun setDone(id: String, done: Boolean) =
        dao.setDone(id, done, if (done) System.currentTimeMillis() else null)

    override suspend fun delete(id: String) = dao.delete(id)
}
