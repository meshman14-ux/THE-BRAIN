package com.meshman.thebrain.companion

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.LocalDate
import java.time.ZoneId

/**
 * Reads the last `windowDays` days out of Health Connect — the on-device
 * hub Samsung Health syncs into — and hands plain numbers to the
 * aggregator. Steps and exercise minutes use Health Connect's own
 * per-day AGGREGATE, which de-duplicates multiple source apps natively;
 * the record types where "which reading" matters (weight, sleep, HRV,
 * resting HR, meals) are read raw and settled by the aggregator's rules.
 */
class HealthReader(private val context: Context) {

    val permissions: Set<String> = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class),
        HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        HealthPermission.getReadPermission(NutritionRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
    )

    fun available(): Boolean =
        HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    suspend fun granted(): Set<String> =
        HealthConnectClient.getOrCreate(context)
            .permissionController.getGrantedPermissions()

    /**
     * One pass over the window. Fields whose permission was not granted are
     * simply absent from the result — absence, never zero.
     */
    suspend fun read(windowDays: Long, zone: ZoneId): DayAggregator {
        val client = HealthConnectClient.getOrCreate(context)
        val agg = DayAggregator(zone)
        val today = LocalDate.now(zone)
        val granted = granted()
        val can = { p: String -> p in granted }

        // Steps + exercise minutes: per local day, via the aggregate API.
        for (back in 0 until windowDays) {
            val day = today.minusDays(back)
            val start = day.atStartOfDay(zone).toInstant()
            val end = day.plusDays(1).atStartOfDay(zone).toInstant()
            val filter = TimeRangeFilter.between(start, end)

            if (can(HealthPermission.getReadPermission(StepsRecord::class))) {
                val r = client.aggregate(
                    AggregateRequest(setOf(StepsRecord.COUNT_TOTAL), filter)
                )
                r[StepsRecord.COUNT_TOTAL]?.let { agg.addSteps(day, it) }
            }
            if (can(HealthPermission.getReadPermission(ExerciseSessionRecord::class))) {
                val r = client.aggregate(
                    AggregateRequest(setOf(ExerciseSessionRecord.EXERCISE_DURATION_TOTAL), filter)
                )
                r[ExerciseSessionRecord.EXERCISE_DURATION_TOTAL]?.let {
                    agg.addActiveMinutes(day, it.toMinutes())
                }
            }
        }

        // The window as one range for the record reads. Sleep starts a day
        // early so a night that began before the window still lands whole.
        val windowStart = today.minusDays(windowDays).atStartOfDay(zone).toInstant()
        val sleepStart = today.minusDays(windowDays + 1).atStartOfDay(zone).toInstant()
        val windowEnd = today.plusDays(1).atStartOfDay(zone).toInstant()

        if (can(HealthPermission.getReadPermission(SleepSessionRecord::class))) {
            client.readRecords(
                ReadRecordsRequest(
                    SleepSessionRecord::class,
                    TimeRangeFilter.between(sleepStart, windowEnd)
                )
            ).records.forEach {
                agg.addSleepSession(it.startTime.toEpochMilli(), it.endTime.toEpochMilli())
            }
        }
        if (can(HealthPermission.getReadPermission(WeightRecord::class))) {
            client.readRecords(
                ReadRecordsRequest(
                    WeightRecord::class,
                    TimeRangeFilter.between(windowStart, windowEnd)
                )
            ).records.forEach {
                agg.addWeight(it.time.toEpochMilli(), it.weight.inKilograms)
            }
        }
        if (can(HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class))) {
            client.readRecords(
                ReadRecordsRequest(
                    HeartRateVariabilityRmssdRecord::class,
                    TimeRangeFilter.between(windowStart, windowEnd)
                )
            ).records.forEach {
                agg.addRmssd(it.time.toEpochMilli(), it.heartRateVariabilityMillis)
            }
        }
        if (can(HealthPermission.getReadPermission(RestingHeartRateRecord::class))) {
            client.readRecords(
                ReadRecordsRequest(
                    RestingHeartRateRecord::class,
                    TimeRangeFilter.between(windowStart, windowEnd)
                )
            ).records.forEach {
                agg.addRestingHr(it.time.toEpochMilli(), it.beatsPerMinute)
            }
        }
        if (can(HealthPermission.getReadPermission(NutritionRecord::class))) {
            client.readRecords(
                ReadRecordsRequest(
                    NutritionRecord::class,
                    TimeRangeFilter.between(windowStart, windowEnd)
                )
            ).records.forEach {
                agg.addNutrition(
                    it.startTime.toEpochMilli(),
                    it.energy?.inKilocalories,
                    it.protein?.inGrams
                )
            }
        }

        return agg
    }
}
