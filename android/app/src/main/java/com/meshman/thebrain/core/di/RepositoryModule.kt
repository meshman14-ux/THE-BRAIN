package com.meshman.thebrain.core.di

import com.meshman.thebrain.feature.habits.data.HabitRepositoryImpl
import com.meshman.thebrain.feature.habits.domain.HabitRepository
import com.meshman.thebrain.feature.links.data.LinkRepositoryImpl
import com.meshman.thebrain.feature.links.domain.LinkRepository
import com.meshman.thebrain.feature.notes.data.NoteRepositoryImpl
import com.meshman.thebrain.feature.notes.domain.NoteRepository
import com.meshman.thebrain.feature.tasks.data.TaskRepositoryImpl
import com.meshman.thebrain.feature.tasks.domain.TaskRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Binds each repository *interface* (domain) to its concrete Room-backed
 * implementation (data). Because we depend on interfaces, tests can swap in
 * fakes without any Android or database at all. @Binds is the lightweight way
 * to say "when someone asks for X, give them Y".
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds @Singleton
    abstract fun bindNoteRepository(impl: NoteRepositoryImpl): NoteRepository

    @Binds @Singleton
    abstract fun bindTaskRepository(impl: TaskRepositoryImpl): TaskRepository

    @Binds @Singleton
    abstract fun bindHabitRepository(impl: HabitRepositoryImpl): HabitRepository

    @Binds @Singleton
    abstract fun bindLinkRepository(impl: LinkRepositoryImpl): LinkRepository
}
