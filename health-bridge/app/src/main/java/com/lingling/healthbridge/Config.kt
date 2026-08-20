package com.lingling.healthbridge

/**
 * 配置：部署前改这两个值。
 * - SERVER_URL：小家 VPS 地址（和浏览器打开小家同一个域名，需 https）。
 * - HEALTH_TOKEN：与 VPS 上 .env 里的 HEALTH_SYNC_TOKEN 完全一致。
 * 改完记得「Build → Generate Signed Bundle / APK」装到手机。
 */
object Config {
    const val SERVER_URL = "https://ling1018.com"          // TODO: 改成你的小家域名
    const val HEALTH_TOKEN = "xiaojia-health-bridge-change-me" // TODO: 与 VPS 端 HEALTH_SYNC_TOKEN 保持一致
}
