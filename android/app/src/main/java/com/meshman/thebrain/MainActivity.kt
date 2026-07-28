package com.meshman.thebrain

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.meshman.thebrain.core.navigation.TheBrainNavHost
import com.meshman.thebrain.core.ui.theme.TheBrainTheme
import dagger.hilt.android.AndroidEntryPoint

/**
 * The single Activity that hosts the entire Compose UI. [@AndroidEntryPoint]
 * lets Hilt inject dependencies into anything scoped to this Activity (like our
 * ViewModels via hiltViewModel()).
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            TheBrainTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    TheBrainNavHost()
                }
            }
        }
    }
}
