@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.meshman.thebrain.feature.habits.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.outlined.SelfImprovement
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.meshman.thebrain.core.ui.components.EmptyState
import com.meshman.thebrain.feature.habits.domain.HabitWithStats

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HabitsScreen(
    onOpenHabit: (String) -> Unit,
    viewModel: HabitsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var showAdd by remember { mutableStateOf(false) }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Habits") }) },
        floatingActionButton = {
            FloatingActionButton(onClick = { showAdd = true }) {
                Icon(Icons.Default.Add, contentDescription = "New habit")
            }
        },
    ) { padding ->
        if (state.habits.isEmpty() && !state.isLoading) {
            EmptyState(
                icon = Icons.Outlined.SelfImprovement,
                title = "No habits yet",
                subtitle = "Tap + to start building one.",
                modifier = Modifier.padding(padding),
            )
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(state.habits, key = { it.id }) { habit ->
                    HabitCard(
                        habit = habit,
                        onToggleToday = { viewModel.onToggleToday(habit) },
                        onOpen = { onOpenHabit(habit.id) },
                    )
                }
            }
        }
    }

    if (showAdd) {
        AddHabitDialog(
            onDismiss = { showAdd = false },
            onConfirm = { name ->
                viewModel.onAdd(name)
                showAdd = false
            },
        )
    }
}

@Composable
private fun HabitCard(habit: HabitWithStats, onToggleToday: () -> Unit, onOpen: () -> Unit) {
    ElevatedCard(
        onClick = onOpen,
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = habit.name,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                if (habit.currentStreak > 0) {
                    Icon(
                        Icons.Default.LocalFireDepartment,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        text = " ${habit.currentStreak}",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                habit.lastSevenDays.forEachIndexed { index, done ->
                    val isToday = index == habit.lastSevenDays.lastIndex
                    DayDot(done = done, isToday = isToday, onClick = if (isToday) onToggleToday else null)
                }
            }
        }
    }
}

@Composable
private fun DayDot(done: Boolean, isToday: Boolean, onClick: (() -> Unit)?) {
    val color = MaterialTheme.colorScheme
    var modifier = Modifier
        .size(if (isToday) 26.dp else 20.dp)
        .clip(CircleShape)
        .background(if (done) color.primary else color.surfaceVariant)
    if (isToday) modifier = modifier.border(2.dp, color.primary, CircleShape)
    if (onClick != null) modifier = modifier.clickable(onClick = onClick)
    Box(modifier = modifier, contentAlignment = Alignment.Center) {}
}

@Composable
private fun AddHabitDialog(onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New habit") },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                placeholder = { Text("e.g. Meditate") },
                singleLine = true,
            )
        },
        confirmButton = { TextButton(onClick = { onConfirm(name) }, enabled = name.isNotBlank()) { Text("Add") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
