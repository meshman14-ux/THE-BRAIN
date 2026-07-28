package com.meshman.thebrain.feature.links.data

import com.meshman.thebrain.feature.links.domain.Link
import com.meshman.thebrain.feature.links.domain.LinkRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.UUID
import javax.inject.Inject

class LinkRepositoryImpl @Inject constructor(
    private val dao: LinkDao,
) : LinkRepository {

    override fun observeLinks(): Flow<List<Link>> =
        dao.observeLinks().map { list -> list.map { it.toDomain() } }

    override suspend fun add(title: String, url: String, category: String) {
        val normalizedUrl = if (url.startsWith("http://") || url.startsWith("https://")) url else "https://$url"
        dao.upsert(
            LinkEntity(
                id = UUID.randomUUID().toString(),
                title = title.trim().ifBlank { normalizedUrl },
                url = normalizedUrl.trim(),
                category = category.trim().ifBlank { "General" },
                createdAt = System.currentTimeMillis(),
            )
        )
    }

    override suspend fun delete(id: String) = dao.delete(id)
}
