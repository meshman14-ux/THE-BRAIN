package com.meshman.thebrain.core.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Note
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.Psychology
import androidx.compose.material.icons.outlined.Whatshot
import androidx.compose.ui.graphics.vector.ImageVector

// ---- Navigation argument keys (shared by nav graph + ViewModels' SavedStateHandle) ----
const val NOTE_ID_ARG = "noteId"
const val HABIT_ID_ARG = "habitId"

/** All routes in one place, so typos become compile errors, not runtime crashes. */
object Routes {
    const val HOME = "home"
    const val NOTES = "notes"
    const val TASKS = "tasks"
    const val HABITS = "habits"
    const val LINKS = "links"

    const val NOTE_EDITOR = "noteEditor/{$NOTE_ID_ARG}"
    fun noteEditor(noteId: String) = "noteEditor/$noteId"

    const val HABIT_DETAIL = "habitDetail/{$HABIT_ID_ARG}"
    fun habitDetail(habitId: String) = "habitDetail/$habitId"
}

/** The five provinces of the bottom navigation bar. */
enum class TopLevelDestination(val route: String, val label: String, val icon: ImageVector) {
    HOME(Routes.HOME, "Home", Icons.Outlined.Psychology),
    NOTES(Routes.NOTES, "Notes", Icons.AutoMirrored.Outlined.Note),
    TASKS(Routes.TASKS, "Tasks", Icons.Outlined.CheckCircle),
    HABITS(Routes.HABITS, "Habits", Icons.Outlined.Whatshot),
    LINKS(Routes.LINKS, "Links", Icons.Outlined.Link),
}
