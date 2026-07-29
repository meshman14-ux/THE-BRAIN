package com.meshman.thebrain.core.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

// Brand fallback schemes — used when dynamic color is off or unavailable.
private val BrandDarkColors = darkColorScheme(
    primary = BrandBlueLight,
    secondary = BrandViolet,
    background = DarkBackground,
    surface = DarkSurface,
    surfaceVariant = DarkSurfaceVariant,
    onBackground = DarkOnSurface,
    onSurface = DarkOnSurface,
    onSurfaceVariant = DarkOnSurfaceMuted,
    error = Danger,
)

private val BrandLightColors = lightColorScheme(
    primary = BrandBlue,
    secondary = BrandViolet,
    background = LightBackground,
    surface = LightSurface,
    surfaceVariant = LightSurfaceVariant,
    onBackground = LightOnSurface,
    onSurface = LightOnSurface,
    onSurfaceVariant = LightOnSurfaceMuted,
    error = Danger,
)

/**
 * THE BRAIN's Material 3 theme.
 *
 * @param darkTheme follow the system by default.
 * @param dynamicColor Material You — derive colors from the user's wallpaper on
 *        Android 12+ (our minSdk is 31, so this is always available). When off,
 *        we fall back to the brand blue→violet scheme.
 */
@Composable
fun TheBrainTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> BrandDarkColors
        else -> BrandLightColors
    }

    // Make the status bar icons match the theme (light icons on dark, etc.).
    val view = LocalView.current
    if (!view.isInEditMode) {
        val window = (view.context as Activity).window
        WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = AppTypography,
        content = content,
    )
}
