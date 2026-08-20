package com.lingling.healthbridge

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/**
 * 健康同步核心：读 Health Connect → 汇总成每日摘要 → POST 到小家 /api/health/sync。
 * 睡眠按「醒来日」归属（跨午夜的觉算醒来那天），步数/心率按自然日聚合。
 */
object HealthSync {

    val PERMISSIONS = setOf(
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
    )

    private val SLEEP_PERM = HealthPermission.getReadPermission(SleepSessionRecord::class)
    private val STEPS_PERM = HealthPermission.getReadPermission(StepsRecord::class)
    private val HR_PERM = HealthPermission.getReadPermission(HeartRateRecord::class)
    private val RHR_PERM = HealthPermission.getReadPermission(RestingHeartRateRecord::class)

    /** 权限字符串 → 中文名，给授权提示用 */
    fun permissionLabel(p: String): String = when (p) {
        SLEEP_PERM -> "睡眠"
        STEPS_PERM -> "步数"
        HR_PERM -> "心率"
        RHR_PERM -> "静息心率"
        else -> p
    }

    data class SleepAgg(
        var minutes: Int = 0,
        var deep: Int = 0,
        var light: Int = 0,
        var rem: Int = 0,
        var start: Instant? = null,
        var end: Instant? = null,
    )

    suspend fun sync(context: Context, client: HealthConnectClient) {
        withContext(Dispatchers.IO) {
            val end = Instant.now()
            val start = end.minus(3, ChronoUnit.DAYS)

            // 1) 睡眠会话：按醒来日归并
            val sleepResp = client.readRecords(
                ReadRecordsRequest(SleepSessionRecord::class, timeRangeFilter = TimeRangeFilter.between(start, end)),
            )
            val sleepByDate = mutableMapOf<LocalDate, SleepAgg>()
            for (s in sleepResp.records) {
                val wake = s.endTime.atZone(ZoneId.systemDefault()).toLocalDate()
                val agg = sleepByDate.getOrPut(wake) { SleepAgg() }
                agg.minutes += ChronoUnit.MINUTES.between(s.startTime, s.endTime).toInt()
                for (stage in s.stages) {
                    val sm = ChronoUnit.MINUTES.between(stage.startTime, stage.endTime).toInt()
                    when (stage.stage) {
                        SleepSessionRecord.STAGE_TYPE_DEEP -> agg.deep += sm
                        SleepSessionRecord.STAGE_TYPE_REM -> agg.rem += sm
                        SleepSessionRecord.STAGE_TYPE_LIGHT -> agg.light += sm
                    }
                }
                if (agg.start == null || s.startTime.isBefore(agg.start)) agg.start = s.startTime
                if (agg.end == null || s.endTime.isAfter(agg.end)) agg.end = s.endTime
            }

            // 2) 逐日聚合步数 + 心率（今天、昨天）
            val dates = listOf(LocalDate.now(), LocalDate.now().minusDays(1))
            for (date in dates) {
                val dayStart = date.atStartOfDay(ZoneId.systemDefault()).toInstant()
                val dayEnd = date.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant()

                val stepsAgg = client.aggregate(
                    AggregateRequest(setOf(StepsRecord.COUNT_TOTAL), timeRangeFilter = TimeRangeFilter.between(dayStart, dayEnd)),
                )
                val steps = stepsAgg[StepsRecord.COUNT_TOTAL]?.toInt()

                val hrAgg = client.aggregate(
                    AggregateRequest(setOf(HeartRateRecord.BPM_AVG), timeRangeFilter = TimeRangeFilter.between(dayStart, dayEnd)),
                )
                val avgHr = hrAgg[HeartRateRecord.BPM_AVG]?.toInt()

                val restingHr = try {
                    client.readRecords(
                        ReadRecordsRequest(RestingHeartRateRecord::class, timeRangeFilter = TimeRangeFilter.between(dayStart, dayEnd)),
                    ).records.maxByOrNull { it.time }?.beatsPerMinute?.toInt()
                } catch (_: Exception) {
                    null // 静息心率非必须权限，读不到就跳过
                }

                postDay(date, sleepByDate[date], steps, restingHr, avgHr)
            }

            // 3) 睡眠归属到更早于「昨天」的日期（前天的觉），补推一次
            for ((date, sleep) in sleepByDate) {
                if (date.isBefore(LocalDate.now().minusDays(1))) postDay(date, sleep, null, null, null)
            }
        }
    }

    private fun postDay(
        date: LocalDate,
        sleep: SleepAgg?,
        steps: Int?,
        restingHr: Int?,
        avgHr: Int?,
    ) {
        val body = JSONObject().apply {
            put("date", date.toString())
            if (sleep != null) {
                put("sleep_minutes", sleep.minutes)
                put("sleep_deep_min", sleep.deep)
                put("sleep_light_min", sleep.light)
                put("sleep_rem_min", sleep.rem)
                sleep.start?.let { put("sleep_start", it.toString()) }
                sleep.end?.let { put("sleep_end", it.toString()) }
            }
            if (steps != null) put("steps", steps)
            if (restingHr != null) put("resting_hr", restingHr)
            if (avgHr != null) put("avg_hr", avgHr)
        }

        val conn = URL("${Config.SERVER_URL}/api/health/sync").openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
        conn.setRequestProperty("x-health-token", Config.HEALTH_TOKEN)
        conn.doOutput = true
        conn.connectTimeout = 15000
        conn.readTimeout = 15000
        conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
        val code = conn.responseCode
        conn.disconnect()
        if (code !in 200..299) throw java.io.IOException("sync failed: $code")
    }
}
