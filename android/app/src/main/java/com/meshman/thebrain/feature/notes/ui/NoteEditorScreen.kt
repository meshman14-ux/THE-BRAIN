@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.meshman.thebrain.feature.notes.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NoteEditorScreen(
    onBack: () -> Unit,
    viewModel: NoteEditorViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    // Autosave-on-leave: whichever way the user exits, persist first.
    fun leave() {
        viewModel.save()
        onBack()
    }
    BackHandler { leave() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (state.isNew) "New note" else "Edit note") },
                navigationIcon = {
                    IconButton(onClick = ::leave) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = viewModel::onTogglePin) {
                        Icon(
                            imageVector = if (state.pinned) Icons.Filled.PushPin else Icons.Outlined.PushPin,
                            contentDescription = "Pin",
                            tint = if (state.pinned) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (!state.isNew) {
                        IconButton(onClick = { viewModel.delete(onDone = onBack) }) {
                            Icon(Icons.Default.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                },
            )
        },
    ) { padding ->
        val transparentFields = TextFieldDefaults.colors(
            focusedContainerColor = Color.Transparent,
            unfocusedContainerColor = Color.Transparent,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
        )
        Column(Modifier.fillMaxSize().padding(padding)) {
            TextField(
                value = state.title,
                onValueChange = viewModel::onTitleChange,
                placeholder = { Text("Title", fontSize = 22.sp, fontWeight = FontWeight.Bold) },
                textStyle = MaterialTheme.typography.titleLarge.copy(fontSize = 22.sp, fontWeight = FontWeight.Bold),
                singleLine = true,
                colors = transparentFields,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
            )
            TextField(
                value = state.body,
                onValueChange = viewModel::onBodyChange,
                placeholder = { Text("Start writing…") },
                colors = transparentFields,
                modifier = Modifier.fillMaxSize().padding(horizontal = 8.dp),
            )
        }
    }
}
