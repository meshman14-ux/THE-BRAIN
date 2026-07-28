package com.meshman.thebrain.core.di

import android.content.Context
import androidx.room.Room
import com.meshman.thebrain.core.db.AppDatabase
import com.meshman.thebrain.feature.habits.data.HabitDao
import com.meshman.thebrain.feature.links.data.LinkDao
import com.meshman.thebrain.feature.notes.data.NoteDao
import com.meshman.thebrain.feature.tasks.data.TaskDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Tells Hilt how to build the database and each DAO. Everything here lives for
 * the whole app ([SingletonComponent] + [@Singleton]) — one database instance,
 * shared everywhere.
 */
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): AppDatabase =
        Room.databaseBuilder(context, AppDatabase::class.java, "the_brain.db")
            .fallbackToDestructiveMigration() // fine for early dev; replace with real migrations before release
            .build()

    @Provides fun provideNoteDao(db: AppDatabase): NoteDao = db.noteDao()
    @Provides fun provideTaskDao(db: AppDatabase): TaskDao = db.taskDao()
    @Provides fun provideHabitDao(db: AppDatabase): HabitDao = db.habitDao()
    @Provides fun provideLinkDao(db: AppDatabase): LinkDao = db.linkDao()
}
