package com.lingling.healthbridge

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 每天定时同步（WorkManager）。权限未授予或 Health Connect 不可用则放弃本次。
 */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            if (HealthConnectClient.getSdkStatus(applicationContext) != HealthConnectClient.SDK_AVAILABLE) {
                return@withContext Result.failure()
            }
            val client = HealthConnectClient.getOrCreate(applicationContext)
            val granted = client.permissionController.getGrantedPermissions()
            if (!granted.containsAll(HealthSync.PERMISSIONS)) return@withContext Result.failure()
            HealthSync.sync(applicationContext, client)
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
