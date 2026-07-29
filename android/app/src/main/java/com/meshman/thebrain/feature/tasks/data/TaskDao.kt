package com.meshman.thebrain.feature.tasks.data

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface TaskDao {

    // Not-done first; within each group, tasks with a due date come first (soonest
    // due at the top), then undated by newest.
    @Query(
        """
        SELECT * FROM tasks
        ORDER BY done ASC,
                 CASE WHEN dueAt IS NULL THEN 1 ELSE 0 END ASC,
                 dueAt ASC,
                 createdAt DESC
        """
    )
    fun observeTasks(): Flow<List<TaskEntity>>

    @Upsert
    suspend fun upsert(task: TaskEntity)

    @Query("UPDATE tasks SET done = :done, completedAt = :completedAt WHERE id = :id")
    suspend fun setDone(id: String, done: Boolean, completedAt: Long?)

    @Query("DELETE FROM tasks WHERE id = :id")
    suspend fun delete(id: String)
}
