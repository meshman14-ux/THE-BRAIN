package com.meshman.thebrain.core.navigation

import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.NavType
import com.meshman.thebrain.feature.habits.ui.HabitDetailScreen
import com.meshman.thebrain.feature.habits.ui.HabitsScreen
import com.meshman.thebrain.feature.home.ui.HomeScreen
import com.meshman.thebrain.feature.links.ui.LinksScreen
import com.meshman.thebrain.feature.notes.ui.NoteEditorScreen
import com.meshman.thebrain.feature.notes.ui.NotesScreen
import com.meshman.thebrain.feature.tasks.ui.TasksScreen

/**
 * The app's single navigation host. A bottom bar switches between the five
 * top-level destinations; detail screens (note editor, habit detail) push on
 * top and hide the bar.
 */
@Composable
fun TheBrainNavHost(navController: NavHostController = rememberNavController()) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val showBottomBar = TopLevelDestination.entries.any { it.route == currentRoute }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    val currentDestination = backStackEntry?.destination
                    TopLevelDestination.entries.forEach { dest ->
                        val selected = currentDestination?.hierarchy?.any { it.route == dest.route } == true
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                navController.navigate(dest.route) {
                                    // Standard bottom-nav behavior: single top-level back stack.
                                    popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(dest.icon, contentDescription = dest.label) },
                            label = { Text(dest.label) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Routes.HOME,
            modifier = Modifier,
            // Screens apply the Scaffold padding via their own Scaffolds; we pass
            // the bottom-bar inset down so content isn't hidden behind the bar.
        ) {
            composable(Routes.HOME) {
                HomeScreen(
                    contentPadding = padding,
                    onOpenTab = { route -> navController.navigate(route) { launchSingleTop = true } },
                    onOpenNote = { id -> navController.navigate(Routes.noteEditor(id)) },
                )
            }
            composable(Routes.NOTES) {
                Padded(padding) { NotesScreen(onOpenNote = { id -> navController.navigate(Routes.noteEditor(id)) }) }
            }
            composable(Routes.TASKS) { Padded(padding) { TasksScreen() } }
            composable(Routes.HABITS) {
                Padded(padding) { HabitsScreen(onOpenHabit = { id -> navController.navigate(Routes.habitDetail(id)) }) }
            }
            composable(Routes.LINKS) { Padded(padding) { LinksScreen() } }

            composable(
                route = Routes.NOTE_EDITOR,
                arguments = listOf(navArgument(NOTE_ID_ARG) { type = NavType.StringType }),
            ) {
                NoteEditorScreen(onBack = { navController.popBackStack() })
            }
            composable(
                route = Routes.HABIT_DETAIL,
                arguments = listOf(navArgument(HABIT_ID_ARG) { type = NavType.StringType }),
            ) {
                HabitDetailScreen(onBack = { navController.popBackStack() })
            }
        }
    }
}

/** Applies the outer Scaffold's bottom inset to a top-level screen. */
@Composable
private fun Padded(
    padding: androidx.compose.foundation.layout.PaddingValues,
    content: @Composable () -> Unit,
) {
    androidx.compose.foundation.layout.Box(
        Modifier.padding(bottom = padding.calculateBottomPadding())
    ) { content() }
}
