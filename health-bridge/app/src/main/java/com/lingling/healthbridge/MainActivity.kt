package com.lingling.healthbridge

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Constraints
import kotlinx.coroutines.*
import java.io.File
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {

    private lateinit var healthConnectClient: HealthConnectClient
    private lateinit var statusText: TextView
    private lateinit var requestPermission: ActivityResultLauncher<Set<String>>
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        statusText = findViewById(R.id.statusText)
        val syncBtn = findViewById<Button>(R.id.syncBtn)
        val autoToggle = findViewById<Switch>(R.id.autoToggle)
        val gbImportBtn = findViewById<Button>(R.id.gbImportBtn)

        // Plan B：从 Gadgetbridge 导出的数据库文件导入（绕开 Health Connect）
        val pickGbDb = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            if (uri != null) {
                statusText.text = "正在解析 Gadgetbridge 数据…"
                scope.launch {
                    try {
                        val tmp = File(cacheDir, "gadgetbridge.db")
                        contentResolver.openInputStream(uri)?.use { input ->
                            tmp.outputStream().use { output -> input.copyTo(output) }
                        } ?: throw java.io.IOException("无法读取所选文件")
                        HealthSync.importGadgetbridgeDb(tmp)
                        statusText.text = "✅ 已从 Gadgetbridge 导入并同步（今天/昨天）"
                    } catch (e: Exception) {
                        statusText.text = "导入失败：${e.message}"
                    }
                }
            }
        }
        gbImportBtn.setOnClickListener {
            // 允许系统文件选择器访问 Android/data 时，可直接选 Gadgetbridge 的导出文件
            pickGbDb.launch(arrayOf("*/*"))
        }

        // 自动导入：授权一个 Gadgetbridge 自动导出目录（SAF 持久授权），之后打开 App / 定时任务自动读最新文件
        val gbDirBtn = findViewById<Button>(R.id.gbDirBtn)
        val pickGbDir = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
            if (uri != null) {
                try {
                    contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    getSharedPreferences("gb_dir", MODE_PRIVATE).edit().putString("uri", uri.toString()).apply()
                    statusText.text = "自动导入目录已设置 ✅"
                    scope.launch { tryAutoImport() }
                } catch (e: Exception) {
                    statusText.text = "目录授权失败：${e.message}"
                }
            }
        }
        gbDirBtn.setOnClickListener { pickGbDir.launch(null) }

        // 打开 App 时：已有授权目录就自动尝试一次导入
        if (loadGbDirUri() != null) scope.launch { tryAutoImport() }

        // 先确认 Health Connect 可用性，再初始化 client
        when (HealthConnectClient.getSdkStatus(this)) {
            HealthConnectClient.SDK_AVAILABLE -> {
                healthConnectClient = HealthConnectClient.getOrCreate(this)
            }
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> {
                statusText.text = "需要更新 Health Connect，正在打开应用商店…"
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata")))
                return
            }
            else -> {
                statusText.text = "此设备不支持 Health Connect（需 Android 14+，或在 Android 13 上安装 Health Connect App）"
                return
            }
        }

        requestPermission = registerForActivityResult(
            PermissionController.createRequestPermissionResultContract(),
        ) { granted ->
            val missing = HealthSync.PERMISSIONS - granted
            if (missing.isEmpty()) {
                doSync()
            } else {
                // 没授全：告诉用户具体缺哪些，并自动再弹一次授权页（只请求缺失的）
                val names = missing.map(HealthSync::permissionLabel).joinToString("、")
                statusText.text = "还缺：$names。请把这几项都勾上（授权页里每一项都要开）"
                launchPermission(missing)
            }
        }

        autoToggle.setOnCheckedChangeListener { _, on ->
            if (on) scheduleAuto() else cancelAuto()
        }

        syncBtn.setOnClickListener {
            scope.launch {
                try {
                    val granted = healthConnectClient.permissionController.getGrantedPermissions()
                    val missing = HealthSync.PERMISSIONS - granted
                    if (missing.isEmpty()) doSync()
                    else {
                        val names = missing.map(HealthSync::permissionLabel).joinToString("、")
                        statusText.text = "需要先授权：$names（授权页里每一项都要开）"
                        launchPermission(missing)
                    }
                } catch (e: Exception) {
                    // Health Connect 组件异常：自动回退到 Gadgetbridge 目录导入
                    statusText.text = "Health Connect 不可用，尝试从 Gadgetbridge 目录导入…"
                    if (!tryAutoImport()) {
                        statusText.text = "Health Connect 组件异常（${e.message}）。\n请先点「设置自动导入目录」或「从 Gadgetbridge 导入」"
                    }
                }
            }
        }
    }

    /** 读取已授权的 Gadgetbridge 导出目录（SAF 持久 Uri） */
    private fun loadGbDirUri(): Uri? {
        val s = getSharedPreferences("gb_dir", MODE_PRIVATE).getString("uri", null) ?: return null
        return try {
            Uri.parse(s)
        } catch (_: Exception) {
            null
        }
    }

    /** 从已授权目录自动导入；没有目录或失败都返回 false（不打扰用户） */
    private suspend fun tryAutoImport(): Boolean {
        val dir = loadGbDirUri() ?: return false
        return try {
            val ok = HealthSync.importFromDir(this, dir)
            if (ok) statusText.text = "✅ 已自动导入（今天/昨天）"
            ok
        } catch (e: Exception) {
            statusText.text = "自动导入失败：${e.message}"
            false
        }
    }

    /** 弹 Health Connect 授权页；弹不出来（未安装/版本过旧）时给明确指引 */
    private fun launchPermission(perms: Set<String>) {
        try {
            requestPermission.launch(perms)
        } catch (e: Exception) {
            statusText.text = "无法打开 Health Connect 授权页。请确认手机装了「Health Connect」应用；" +
                "也可以去 系统设置 → 应用 → 健康桥 → 权限 → 健康数据 手动勾选后重试"
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata")))
            } catch (_: Exception) {
            }
        }
    }

    private fun doSync() {
        statusText.text = "同步中…"
        scope.launch {
            try {
                HealthSync.sync(this@MainActivity, healthConnectClient)
                statusText.text = "✅ 已同步（今天 / 昨天）"
            } catch (e: Exception) {
                statusText.text = "同步失败：${e.message}"
            }
        }
    }

    private fun scheduleAuto() {
        val req = PeriodicWorkRequestBuilder<SyncWorker>(1, TimeUnit.DAYS)
            .setConstraints(Constraints.Builder().setRequiresBatteryNotLow(true).build())
            .build()
        WorkManager.getInstance(this)
            .enqueueUniquePeriodicWork("health-sync", ExistingPeriodicWorkPolicy.UPDATE, req)
        Toast.makeText(this, "已开启每天自动同步", Toast.LENGTH_SHORT).show()
    }

    private fun cancelAuto() {
        WorkManager.getInstance(this).cancelUniqueWork("health-sync")
        Toast.makeText(this, "已关闭自动同步", Toast.LENGTH_SHORT).show()
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
