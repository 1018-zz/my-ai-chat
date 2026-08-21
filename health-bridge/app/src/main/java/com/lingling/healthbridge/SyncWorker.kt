package com.lingling.healthbridge

import android.content.Context
import android.net.Uri
import androidx.health.connect.client.HealthConnectClient
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 每天定时同步。优先走 Health Connect；失败/未授权时自动回退到
 * 已授权的 Gadgetbridge 自动导出目录（Plan B）。
 */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        // 1) 优先 Health Connect 同步
        try {
            if (HealthConnectClient.getSdkStatus(applicationContext) == HealthConnectClient.SDK_AVAILABLE) {
                val client = HealthConnectClient.getOrCreate(applicationContext)
                val granted = client.permissionController.getGrantedPermissions()
                if (granted.containsAll(HealthSync.PERMISSIONS)) {
                    HealthSync.sync(applicationContext, client)
                    return@withContext Result.success()
                }
            }
        } catch (_: Exception) {
            // Health Connect 组件异常，走 Plan B
        }

        // 2) 回退：从已授权的 Gadgetbridge 导出目录导入
        try {
            val dirStr = applicationContext.getSharedPreferences("gb_dir", Context.MODE_PRIVATE)
                .getString("uri", null) ?: return@withContext Result.failure()
            val dir = Uri.parse(dirStr)
            if (HealthSync.importFromDir(applicationContext, dir)) Result.success()
            else Result.failure()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
