package com.meshman.thebrain

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

/**
 * The Application class. [@HiltAndroidApp] triggers Hilt's code generation and
 * creates the app-level dependency container — the root from which every
 * injected object is built. This is the one class that wires DI into existence.
 */
@HiltAndroidApp
class TheBrainApp : Application()
