package com.meshman.thebrain.companion

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.time.ZoneId
import java.util.concurrent.TimeUnit

/**
 * The zero taps. Twice a day, read the last seven days out of Health
 * Connect and upsert them — seven, not one, because a watch syncs late,
 * a night finishes after midnight, and yesterday's numbers keep moving
 * for a while. Upserting the window again is idempotent by design:
 * (user_id, on_date) is the key, and rows only SET what they carry.
 */
class SyncWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val store = AuthStore(applicationContext)
        if (!store.signedIn()) return Result.success() // nothing to do, not an error
        val reader = HealthReader(applicationContext)
        if (!reader.available()) return Result.success()

        return try {
            val agg = reader.read(windowDays = 7, zone = ZoneId.systemDefault())
            val days = agg.build()
            if (days.isNotEmpty()) {
                Supabase(store).upsertHealthDays(Payload.toJson(days)).getOrThrow()
            }
            SyncLog.record(applicationContext, days.size)
            Result.success()
        } catch (e: Exception) {
            // Transient by default: the network drops, the token refresh
            // hiccups. Retry with backoff rather than failing silently.
            Result.retry()
        }
    }

    companion object {
        /** Idempotent — safe to call on every app start. */
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(12, TimeUnit.HOURS)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                "health-sync",
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }
    }
}

/** The one line of state the UI shows: when, and how many days. */
object SyncLog {
    fun record(context: Context, days: Int) {
        context.getSharedPreferences("sync", Context.MODE_PRIVATE).edit()
            .putLong("last_at", System.currentTimeMillis())
            .putInt("last_days", days)
            .apply()
    }

    fun lastLine(context: Context): String {
        val p = context.getSharedPreferences("sync", Context.MODE_PRIVATE)
        val at = p.getLong("last_at", 0)
        if (at == 0L) return "Never synced yet."
        val mins = (System.currentTimeMillis() - at) / 60_000
        val ago = if (mins < 60) "${mins}m ago" else "${mins / 60}h ago"
        return "Last sync $ago · ${p.getInt("last_days", 0)} day(s)."
    }
}
