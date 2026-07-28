package com.meshman.thebrain.feature.links.domain

import kotlinx.coroutines.flow.Flow

data class Link(
    val id: String,
    val title: String,
    val url: String,
    val category: String,
    val createdAt: Long,
)

interface LinkRepository {
    fun observeLinks(): Flow<List<Link>>
    suspend fun add(title: String, url: String, category: String)
    suspend fun delete(id: String)
}
