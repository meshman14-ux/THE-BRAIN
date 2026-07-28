@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.meshman.thebrain.feature.home.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.meshman.thebrain.core.navigation.Routes
import com.meshman.thebrain.core.util.DateFormat
import com.meshman.thebrain.feature.habits.domain.HabitWithStats
import com.meshman.thebrain.feature.tasks.domain.Task

@Composable
fun HomeScreen(
    contentPadding: PaddingValues,
    onOpenTab: (String) -> Unit,
    onOpenNote: (String) -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(top = 24.dp, start = 16.dp, end = 16.dp)
            .padding(bottom = contentPadding.calculateBottomPadding() + 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Greeting
        Column {
            Text(DateFormat.greeting(), style = MaterialTheme.typography.headlineSmall)
            Text(
                DateFormat.longDate(),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        // Today's tasks
        SectionCard(title = "Today's tasks", count = state.todayTasks.size, onOpen = { onOpenTab(Routes.TASKS) }) {
            if (state.todayTasks.isEmpty()) {
                MutedLine("Nothing due today. Enjoy the calm.")
            } else {
                state.todayTasks.take(4).forEach { task ->
                    TaskLine(task = task, onToggle = { viewModel.onToggleTask(task) })
                }
            }
        }

        // Habits
        SectionCard(title = "Habits", count = state.habits.size, onOpen = { onOpenTab(Routes.HABITS) }) {
            if (state.habits.isEmpty()) {
                MutedLine("No habits yet. Start one on the Habits tab.")
            } else {
                state.habits.take(4).forEach { habit ->
                    HabitLine(habit = habit, onToggle = { viewModel.onToggleHabit(habit) })
                }
            }
        }

        // Recent notes
        SectionCard(title = "Recent notes", count = state.recentNotes.size, onOpen = { onOpenTab(Routes.NOTES) }) {
            if (state.recentNotes.isEmpty()) {
                MutedLine("No notes yet. Capture a thought on the Notes tab.")
            } else {
                state.recentNotes.forEach { note ->
                    Text(
                        text = "• ${note.title.ifBlank { note.body.ifBlank { "Untitled" } }}",
                        style = MaterialTheme.typography.bodyLarge,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 6.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun SectionCard(
    title: String,
    count: Int,
    onOpen: () -> Unit,
    content: @Composable () -> Unit,
) {
    ElevatedCard(onClick = onOpen, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Text("$count", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            content()
        }
    }
}

@Composable
private fun TaskLine(task: Task, onToggle: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onToggle) {
            Icon(
                imageVector = if (task.done) Icons.Filled.CheckCircle else Icons.Outlined.Circle,
                contentDescription = null,
                tint = if (task.done) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp),
            )
        }
        Text(task.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun HabitLine(habit: HabitWithStats, onToggle: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 4.dp)) {
        IconButton(onClick = onToggle) {
            Icon(
                imageVector = if (habit.doneToday) Icons.Filled.CheckCircle else Icons.Outlined.Circle,
                contentDescription = if (habit.doneToday) "Done today" else "Mark done today",
                tint = if (habit.doneToday) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp),
            )
        }
        Text(habit.name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (habit.currentStreak > 0) {
            Text("${habit.currentStreak}🔥", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun MutedLine(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = 6.dp),
    )
}
