package com.meshman.thebrain.feature.tasks.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TaskGroupingTest {

    private val now = 1_700_000_000_000L // fixed instant
    private val dayMs = 24L * 60 * 60 * 1000

    private fun task(id: String, done: Boolean = false, dueAt: Long? = null) =
        Task(id = id, title = id, notes = null, dueAt = dueAt, done = done, createdAt = now, completedAt = null)

    @Test
    fun `done tasks go to the done bucket`() {
        val result = groupTasks(listOf(task("a", done = true)), now)
        assertEquals(listOf("a"), result.done.map { it.id })
        assertTrue(result.today.isEmpty())
        assertTrue(result.upcoming.isEmpty())
    }

    @Test
    fun `a task due today lands in today`() {
        val result = groupTasks(listOf(task("a", dueAt = now)), now)
        assertEquals(listOf("a"), result.today.map { it.id })
    }

    @Test
    fun `an overdue undone task stays in today`() {
        val result = groupTasks(listOf(task("a", dueAt = now - 3 * dayMs)), now)
        assertEquals(listOf("a"), result.today.map { it.id })
    }

    @Test
    fun `a future task is upcoming`() {
        val result = groupTasks(listOf(task("a", dueAt = now + 3 * dayMs)), now)
        assertEquals(listOf("a"), result.upcoming.map { it.id })
    }

    @Test
    fun `an undated undone task is upcoming`() {
        val result = groupTasks(listOf(task("a", dueAt = null)), now)
        assertEquals(listOf("a"), result.upcoming.map { it.id })
    }
}
