package com.lingling.healthbridge

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import android.app.usage.UsageStatsManager
import android.app.usage.UsageEvents
import android.os.BatteryManager
import androidx.documentfile.provider.DocumentFile
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

    // ═══ 手机状态（合二为一：原 LoverConnect 字段） ═══

    data class PhoneStatus(
        var batteryLevel: Int? = null,
        var batteryCharging: Boolean? = null,
        var screenMinutes: Int? = null,
        var topApps: List<AppUsage>? = null,
    )

    data class AppUsage(
        val pkg: String,
        val minutes: Int,
    )

    /** 读电量（sticky broadcast，不需动态权限） */
    private fun readBattery(context: Context): Pair<Int?, Boolean?> {
        val intentFilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryStatus = context.registerReceiver(null, intentFilter) ?: return null to null
        val level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        val pct = if (scale > 0) (level * 100 / scale) else null
        val status = batteryStatus.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        val charging = if (status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL) true else false
        return pct to charging
    }

    /**
     * 读屏幕使用时间 + App 时间线（需用户在设置里授权"使用情况访问权限"）。
     * 失败（未授权）静默返回 null，不阻塞健康数据同步。
     */
    private fun readScreenTime(context: Context, date: LocalDate): Pair<Int?, List<AppUsage>?> {
        return try {
            val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val zone = ZoneId.systemDefault()
            val start = date.atStartOfDay(zone).toInstant()
            val end = date.plusDays(1).atStartOfDay(zone).toInstant()

            // 屏幕总时长：按 UsageStats 聚合 foreground 时间
            val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start.toEpochMilli(), end.toEpochMilli())
            val totalMs = stats.filter { it.totalTimeInForeground > 0 }.sumOf { it.totalTimeInForeground }
            val screenMin = (totalMs / 60000).toInt()

            // App 时间线：取 top10（按 foreground 时长）
            val topApps = stats
                .filter { it.totalTimeInForeground > 60000 } // 只看 ≥1分钟的
                .sortedByDescending { it.totalTimeInForeground }
                .take(10)
                .map { AppUsage(it.packageName, (it.totalTimeInForeground / 60000).toInt()) }

            (if (screenMin > 0) screenMin else null) to (if (topApps.isNotEmpty()) topApps else null)
        } catch (_: Exception) {
            null to null // 未授权或不可用，静默跳过
        }
    }

    /** 采集今日手机状态（电量是实时的，屏幕时间按今日自然日） */
    private fun collectPhoneStatus(context: Context): PhoneStatus {
        val (battery, charging) = readBattery(context)
        val (screenMin, topApps) = readScreenTime(context, LocalDate.now())
        return PhoneStatus(battery, charging, screenMin, topApps)
    }

    /** 采集指定日期的手机状态（用于补报昨天等——电量只采今日，历史日期只报屏幕时间） */
    private fun collectPhoneStatusForDate(context: Context, date: LocalDate): PhoneStatus {
        if (date == LocalDate.now()) return collectPhoneStatus(context)
        // 历史日期：电量不可追溯，只采屏幕时间
        val (screenMin, topApps) = readScreenTime(context, date)
        return PhoneStatus(null, null, screenMin, topApps)
    }

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

            // 2) 逐日聚合步数 + 心率 + 手机状态（今天、昨天）
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

                val phone = collectPhoneStatusForDate(context, date)
                postDay(date, sleepByDate[date], steps, restingHr, avgHr, phone)
            }

            // 3) 睡眠归属到更早于「昨天」的日期（前天的觉），补推一次
            for ((date, sleep) in sleepByDate) {
                if (date.isBefore(LocalDate.now().minusDays(1))) {
                    val phone = collectPhoneStatusForDate(context, date)
                    postDay(date, sleep, null, null, null, phone)
                }
            }
        }
    }

    /**
     * Plan B：直接读 Gadgetbridge 导出的 SQLite 数据库文件，绕开 Health Connect。
     * 用户用 Gadgetbridge「导出数据库」，这里解析步数/心率/睡眠后照常上报给小家。
     */
    suspend fun importGadgetbridgeDb(dbFile: java.io.File) {
        withContext(Dispatchers.IO) {
            val db = SQLiteDatabase.openDatabase(dbFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
            try {
                val tables = mutableListOf<String>()
                db.rawQuery("SELECT name FROM sqlite_master WHERE type='table'", null).use { c ->
                    while (c.moveToNext()) tables.add(c.getString(0))
                }

                val sampleTable = tables.firstOrNull { it.uppercase().contains("ACTIVITY_SAMPLE") }
                    ?: throw java.io.IOException("数据库里没找到活动数据表，确认选的是 Gadgetbridge 导出的文件")

                val dates = listOf(LocalDate.now(), LocalDate.now().minusDays(1), LocalDate.now().minusDays(2))

                // 1) 步数 / 心率：按天聚合（心率 255 = 无效测量，排除）
                val stepsByDay = mutableMapOf<LocalDate, Int>()
                val hrByDay = mutableMapOf<LocalDate, Int>()
                db.rawQuery(
                    "SELECT date(TIMESTAMP,'unixepoch','localtime') d, SUM(STEPS) s, " +
                        "AVG(CASE WHEN HEART_RATE!=255 THEN HEART_RATE END) h " +
                        "FROM \"$sampleTable\" GROUP BY d",
                    null,
                ).use { c ->
                    while (c.moveToNext()) {
                        val d = LocalDate.parse(c.getString(0))
                        if (d in dates) {
                            if (!c.isNull(1)) stepsByDay[d] = c.getInt(1)
                            if (!c.isNull(2)) hrByDay[d] = c.getDouble(2).toInt()
                        }
                    }
                }

                // 2) 睡眠：优先专门的 sleep 表，否则用采样表 RAW_KIND=112（0x70=睡眠）识别连续段
                val sleepByDate = mutableMapOf<LocalDate, SleepAgg>()
                val sleepTable = tables.firstOrNull {
                    it.lowercase().contains("sleep") && !it.lowercase().contains("sample")
                }

                if (sleepTable != null) {
                    val cols = mutableSetOf<String>()
                    db.rawQuery("PRAGMA table_info(\"$sleepTable\")", null).use { c ->
                        val idx = c.getColumnIndex("name")
                        while (c.moveToNext()) cols.add(c.getString(idx))
                    }
                    val stCol = listOf("timestamp", "start_time", "start").firstOrNull { it in cols }
                    val etCol = listOf("end_timestamp", "end_time", "end").firstOrNull { it in cols }
                    val intCol = listOf("intensity", "quality", "stage").firstOrNull { it in cols }
                    if (stCol != null && etCol != null) {
                        val q = "SELECT \"$stCol\" st, \"$etCol\" et" +
                            (if (intCol != null) ", \"$intCol\" iv" else "") +
                            " FROM \"$sleepTable\""
                        db.rawQuery(q, null).use { c ->
                            while (c.moveToNext()) {
                                val st = Instant.ofEpochSecond(c.getLong(0))
                                val et = Instant.ofEpochSecond(c.getLong(1))
                                val wake = et.atZone(ZoneId.systemDefault()).toLocalDate()
                                val agg = sleepByDate.getOrPut(wake) { SleepAgg() }
                                val mins = ChronoUnit.MINUTES.between(st, et).toInt()
                                agg.minutes += mins
                                if (agg.start == null || st.isBefore(agg.start)) agg.start = st
                                if (agg.end == null || et.isAfter(agg.end)) agg.end = et
                                // intensity 无统一标准：粗略按 50 分深/浅
                                if (intCol != null && !c.isNull(2)) {
                                    if (c.getInt(2) > 50) agg.deep += mins else agg.light += mins
                                }
                            }
                        }
                    }
                } else {
                    val segs = mutableListOf<Pair<Long, Long>>()
                    db.rawQuery(
                        "SELECT TIMESTAMP FROM \"$sampleTable\" WHERE RAW_KIND=112 ORDER BY TIMESTAMP",
                        null,
                    ).use { c ->
                        var segStart: Long? = null
                        var prev: Long? = null
                        while (c.moveToNext()) {
                            val ts = c.getLong(0)
                            if (segStart == null) {
                                segStart = ts
                                prev = ts
                            } else if (ts - prev!! > 120L) {
                                segs.add(segStart!! to prev!!)
                                segStart = ts
                            }
                            prev = ts
                        }
                        if (segStart != null && prev != null) segs.add(segStart to prev)
                    }
                    for ((st, et) in segs) {
                        val wake = Instant.ofEpochSecond(et).atZone(ZoneId.systemDefault()).toLocalDate()
                        val agg = sleepByDate.getOrPut(wake) { SleepAgg() }
                        agg.minutes += ChronoUnit.MINUTES.between(Instant.ofEpochSecond(st), Instant.ofEpochSecond(et)).toInt()
                        if (agg.start == null || st < agg.start!!.epochSecond) agg.start = Instant.ofEpochSecond(st)
                        if (agg.end == null || et > agg.end!!.epochSecond) agg.end = Instant.ofEpochSecond(et)
                    }
                }

                // 3) 上报最近 3 天（睡眠按醒来日归属）—— Gadgetbridge 模式不采手机状态（focus 在手环数据）
                for (date in dates) postDay(date, sleepByDate[date], stepsByDay[date], null, hrByDay[date], null)
            } finally {
                db.close()
            }
        }
    }

    /**
     * 从用户授权的 Gadgetbridge 自动导出目录里找最新的数据库文件并导入。
     * 目录通过 SAF 一次性授权（takePersistableUriPermission），之后 App 可长期读取。
     */
    suspend fun importFromDir(context: Context, dirUri: Uri): Boolean {
        return withContext(Dispatchers.IO) {
            val dir = DocumentFile.fromTreeUri(context, dirUri) ?: return@withContext false
            var best: Pair<Long, Uri>? = null
            for (f in dir.listFiles()) {
                if (f.isDirectory) continue
                val name = f.name?.lowercase() ?: continue
                if (name == "gadgetbridge" || name.endsWith(".db")) {
                    val lm = f.lastModified()
                    if (best == null || lm > best!!.first) best = lm to f.uri
                }
            }
            val target = best ?: return@withContext false
            val tmp = java.io.File(context.cacheDir, "gadgetbridge_auto.db")
            val copied = context.contentResolver.openInputStream(target.second)?.use { input ->
                tmp.outputStream().use { out -> input.copyTo(out) }
                true
            } ?: false
            if (!copied) return@withContext false
            importGadgetbridgeDb(tmp)
            true
        }
    }

    private fun postDay(
        date: LocalDate,
        sleep: SleepAgg?,
        steps: Int?,
        restingHr: Int?,
        avgHr: Int?,
        phone: PhoneStatus?,
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
            // 手机状态（合二为一）
            if (phone != null) {
                phone.batteryLevel?.let { put("battery_level", it) }
                phone.batteryCharging?.let { put("battery_charging", it) }
                phone.screenMinutes?.let { put("screen_minutes", it) }
                phone.topApps?.let { apps ->
                    if (apps.isNotEmpty()) {
                        val arr = org.json.JSONArray()
                        for (a in apps) {
                            val obj = JSONObject()
                            obj.put("pkg", a.pkg)
                            obj.put("minutes", a.minutes)
                            arr.put(obj)
                        }
                        put("top_apps", arr)
                    }
                }
            }
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
