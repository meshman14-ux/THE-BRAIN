package com.meshman.thebrain.feature.tasks.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.meshman.thebrain.core.ui.components.EmptyState
import com.meshman.thebrain.core.ui.components.SectionHeader
import com.meshman.thebrain.core.util.DateFormat
import com.meshman.thebrain.feature.tasks.domain.Task
import java.util.Calendar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TasksScreen(viewModel: TasksViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var showSheet by remember { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState()

    Scaffold(
        topBar = { TopAppBar(title = { Text("Tasks") }) },
        floatingActionButton = {
            FloatingActionButton(onClick = { showSheet = true }) {
                Icon(Icons.Default.Add, contentDescription = "New task")
            }
        },
    ) { padding ->
        val g = state.groups
        if (g.today.isEmpty() && g.upcoming.isEmpty() && g.done.isEmpty() && !state.isLoading) {
            EmptyState(
                icon = Icons.Outlined.TaskAlt,
                title = "No tasks yet",
                subtitle = "Tap + to add something to do.",
                modifier = Modifier.padding(padding),
            )
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                if (g.today.isNotEmpty()) {
                    item { SectionHeader("Today") }
                    items(g.today, key = { it.id }) { TaskRow(it, viewModel::onToggleDone, viewModel::onDelete) }
                }
                if (g.upcoming.isNotEmpty()) {
                    item { SectionHeader("Upcoming") }
                    items(g.upcoming, key = { it.id }) { TaskRow(it, viewModel::onToggleDone, viewModel::onDelete) }
                }
                if (g.done.isNotEmpty()) {
                    item { SectionHeader("Done") }
                    items(g.done, key = { it.id }) { TaskRow(it, viewModel::onToggleDone, viewModel::onDelete) }
                }
            }
        }
    }

    if (showSheet) {
        ModalBottomSheet(onDismissRequest = { showSheet = false }, sheetState = sheetState) {
            AddTaskSheet(
                onAdd = { title, due ->
                    viewModel.onAdd(title, due)
                    showSheet = false
                },
            )
        }
    }
}

@Composable
private fun TaskRow(task: Task, onToggle: (Task) -> Unit, onDelete: (Task) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = { onToggle(task) }) {
            Icon(
                imageVector = if (task.done) Icons.Filled.CheckCircle else Icons.Outlined.Circle,
                contentDescription = if (task.done) "Mark not done" else "Mark done",
                tint = if (task.done) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            text = task.title,
            style = MaterialTheme.typography.bodyLarge,
            textDecoration = if (task.done) TextDecoration.LineThrough else TextDecoration.None,
            color = if (task.done) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        DateFormat.dueLabel(task.dueAt)?.let { label ->
            AssistChip(onClick = { }, label = { Text(label) })
        }
    }
}

@Composable
private fun AddTaskSheet(onAdd: (String, Long?) -> Unit) {
    var title by remember { mutableStateOf("") }
    var due by remember { mutableStateOf<Long?>(null) }

    Column(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 24.dp)) {
        Text("New task", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 8.dp))
        OutlinedTextField(
            value = title,
            onValueChange = { title = it },
            placeholder = { Text("What needs doing?") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Text("Due", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 12.dp, bottom = 4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DueChip("None", due == null) { due = null }
            DueChip("Today", isSameOffset(due, 0)) { due = daysFromNow(0) }
            DueChip("Tomorrow", isSameOffset(due, 1)) { due = daysFromNow(1) }
            DueChip("Next week", isSameOffset(due, 7)) { due = daysFromNow(7) }
        }
        Row(Modifier.fillMaxWidth().padding(top = 16.dp), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = { onAdd(title, due) }, enabled = title.isNotBlank()) {
                Text("Add task")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DueChip(label: String, selected: Boolean, onClick: () -> Unit) {
    FilterChip(selected = selected, onClick = onClick, label = { Text(label) })
}

private fun daysFromNow(days: Int): Long = Calendar.getInstance().apply {
    add(Calendar.DAY_OF_YEAR, days)
    set(Calendar.HOUR_OF_DAY, 9)
    set(Calendar.MINUTE, 0)
    set(Calendar.SECOND, 0)
    set(Calendar.MILLISECOND, 0)
}.timeInMillis

private fun isSameOffset(due: Long?, days: Int): Boolean {
    if (due == null) return false
    return DateFormat.dueLabel(due) == DateFormat.dueLabel(daysFromNow(days))
}
