package com.meshman.thebrain.core.db

import androidx.room.Database
import androidx.room.RoomDatabase
import com.meshman.thebrain.feature.habits.data.HabitDao
import com.meshman.thebrain.feature.habits.data.HabitEntity
import com.meshman.thebrain.feature.habits.data.HabitEntryEntity
import com.meshman.thebrain.feature.links.data.LinkDao
import com.meshman.thebrain.feature.links.data.LinkEntity
import com.meshman.thebrain.feature.notes.data.NoteDao
import com.meshman.thebrain.feature.notes.data.NoteEntity
import com.meshman.thebrain.feature.tasks.data.TaskDao
import com.meshman.thebrain.feature.tasks.data.TaskEntity

/**
 * The single Room database for THE BRAIN. Bump [version] and add a Migration
 * whenever the schema changes (adding a table/column). For this scaffold we use
 * a fixed version 1; migrations are the topic of a later teaching step.
 */
@Database(
    entities = [
        NoteEntity::class,
        TaskEntity::class,
        HabitEntity::class,
        HabitEntryEntity::class,
        LinkEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun noteDao(): NoteDao
    abstract fun taskDao(): TaskDao
    abstract fun habitDao(): HabitDao
    abstract fun linkDao(): LinkDao
}
