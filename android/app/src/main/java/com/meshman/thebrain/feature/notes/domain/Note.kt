package com.meshman.thebrain.feature.notes.domain

/**
 * Domain model for a note — a plain Kotlin data class with no Android or Room
 * annotations. The UI and business logic speak in terms of this, never the
 * database entity. That separation is what lets us swap storage later without
 * touching screens.
 */
data class Note(
    val id: String,
    val title: String,
    val body: String,
    val pinned: Boolean,
    val createdAt: Long,
    val updatedAt: Long,
)
