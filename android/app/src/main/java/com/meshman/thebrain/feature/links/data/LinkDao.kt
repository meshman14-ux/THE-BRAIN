package com.meshman.thebrain.feature.links.data

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Upsert
import com.meshman.thebrain.feature.links.domain.Link
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "links")
data class LinkEntity(
    @PrimaryKey val id: String,
    val title: String,
    val url: String,
    val category: String,
    val createdAt: Long,
)

fun LinkEntity.toDomain() = Link(id, title, url, category, createdAt)

@Dao
interface LinkDao {
    @Query("SELECT * FROM links ORDER BY category ASC, title ASC")
    fun observeLinks(): Flow<List<LinkEntity>>

    @Upsert
    suspend fun upsert(link: LinkEntity)

    @Query("DELETE FROM links WHERE id = :id")
    suspend fun delete(id: String)
}
