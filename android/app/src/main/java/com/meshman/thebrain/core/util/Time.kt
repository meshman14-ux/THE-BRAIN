package com.meshman.thebrain.core.util

import java.util.Calendar

/** Normalizes a timestamp to the start of its day (local time) in millis. */
fun startOfDayMillis(ts: Long = System.currentTimeMillis()): Long =
    Calendar.getInstance().apply {
        timeInMillis = ts
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }.timeInMillis
