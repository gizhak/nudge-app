package expo.modules.nightguard

import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager

/**
 * Wi-Fi as a sign of where he is: the network he is connected to, and the strong networks
 * around him (a gym he never joins still shows up). Reading only; nothing is ever joined.
 */
object WifiPrefs {
  private const val FILE = "nudge_wifi"
  private const val LAST_WAKE = "lastWake"
  private const val THROTTLE_MS = 20 * 1000L

  private fun clean(ssid: String?): String? {
    val s = ssid?.trim()?.removePrefix("\"")?.removeSuffix("\"") ?: return null
    return if (s.isEmpty() || s == "<unknown ssid>") null else s
  }

  /** What the phone sees now. `scan` asks for a fresh scan too (Android allows only a few). */
  @Suppress("DEPRECATION")
  fun now(ctx: Context, scan: Boolean): Map<String, Any?> {
    val wm = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
      ?: return mapOf("ok" to false, "reason" to "no_wifi", "nearby" to emptyList<Any>())
    if (!wm.isWifiEnabled) return mapOf("ok" to false, "reason" to "wifi_off", "nearby" to emptyList<Any>())
    return try {
      if (scan) try { wm.startScan() } catch (e: Exception) { }
      val info = wm.connectionInfo
      val bssid = info?.bssid
      val connected = if (info != null && info.networkId != -1 && bssid != null && bssid != "02:00:00:00:00:00") {
        mapOf("ssid" to clean(info.ssid), "bssid" to bssid.lowercase(), "rssi" to info.rssi)
      } else null
      val nearby = (wm.scanResults ?: emptyList()).map {
        mapOf("ssid" to clean(it.SSID), "bssid" to (it.BSSID ?: "").lowercase(), "rssi" to it.level)
      }
      mapOf("ok" to true, "connected" to connected, "nearby" to nearby)
    } catch (e: SecurityException) {
      mapOf("ok" to false, "reason" to "permission", "nearby" to emptyList<Any>())
    }
  }

  /** The Wi-Fi connection changed: let the coach look at once, at most every 20 seconds. */
  fun changed(ctx: Context) {
    val prefs = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)
    val now = System.currentTimeMillis()
    if (now - prefs.getLong(LAST_WAKE, 0L) < THROTTLE_MS) return
    prefs.edit().putLong(LAST_WAKE, now).apply()
    try {
      ctx.startService(Intent(ctx, WifiTaskService::class.java))
    } catch (e: Exception) {
      // not allowed right now; the next background run looks instead
    }
  }
}
