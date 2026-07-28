package com.meshman.thebrain.feature.links.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.meshman.thebrain.feature.links.domain.Link
import com.meshman.thebrain.feature.links.domain.LinkRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LinksUiState(
    // Links grouped by category, preserving the DAO's alphabetical order.
    val grouped: Map<String, List<Link>> = emptyMap(),
    val isLoading: Boolean = true,
)

@HiltViewModel
class LinksViewModel @Inject constructor(
    private val repository: LinkRepository,
) : ViewModel() {

    val uiState: StateFlow<LinksUiState> =
        repository.observeLinks()
            .map { links -> LinksUiState(grouped = links.groupBy { it.category }, isLoading = false) }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), LinksUiState())

    fun onAdd(title: String, url: String, category: String) {
        if (url.isBlank()) return
        viewModelScope.launch { repository.add(title, url, category) }
    }

    fun onDelete(link: Link) = viewModelScope.launch { repository.delete(link.id) }
}
