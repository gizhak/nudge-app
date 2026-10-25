package expo.modules.nightguard

import android.bluetooth.BluetoothDevice
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/**
 * The user's car, picked from the paired Bluetooth devices. Connecting to it means a
 * drive started; disconnecting means it ended. Only listens, never connects to anything.
 */
object CarPrefs {
  private const val FILE = "nudge_car"
  const val ADDRESS = "address"
  const val NAME = "name"
  const val CONNECTED = "connected"
  const val SINCE = "since"
  const val EVENTS = "events"

  fun get(ctx: Context): SharedPreferences = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  private fun deviceOf(intent: Intent): BluetoothDevice? =
    if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
    else @Suppress("DEPRECATION") intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)

  /** Handles an ACL broadcast. Returns true when it was the car and its state changed. */
  fun onAcl(ctx: Context, intent: Intent): Boolean {
    val connected = when (intent.action) {
      BluetoothDevice.ACTION_ACL_CONNECTED -> true
      BluetoothDevice.ACTION_ACL_DISCONNECTED -> false
      else -> return false
    }
    val prefs = get(ctx)
    val car = prefs.getString(ADDRESS, null) ?: return false
    val address = try { deviceOf(intent)?.address } catch (e: SecurityException) { null } ?: return false
    if (!address.equals(car, ignoreCase = true)) return false
    // The manifest receiver and the running service may both hear the same event
    if (prefs.getBoolean(CONNECTED, false) == connected) return false
    val now = System.currentTimeMillis()
    val events = try { JSONArray(prefs.getString(EVENTS, "[]")) } catch (e: Exception) { JSONArray() }
    events.put(JSONObject().put("type", if (connected) "connect" else "disconnect").put("at", now))
    while (events.length() > 10) events.remove(0)
    prefs.edit().putBoolean(CONNECTED, connected).putLong(SINCE, now).putString(EVENTS, events.toString()).apply()
    wakeJs(ctx)
    return true
  }

  /**
   * Lets the coach react at once. If Android refuses, the next background run picks the event up.
   * No wake lock here: one taken before a refused start would never be released and drain the
   * battery. The service takes its own lock when it runs and releases it when the task ends.
   */
  private fun wakeJs(ctx: Context) {
    try {
      ctx.startService(Intent(ctx, CarTaskService::class.java))
    } catch (e: Exception) {
      // background start not allowed right now
    }
  }

  fun takeEvents(ctx: Context): List<Map<String, Any>> {
    val prefs = get(ctx)
    val raw = try { JSONArray(prefs.getString(EVENTS, "[]")) } catch (e: Exception) { JSONArray() }
    prefs.edit().putString(EVENTS, "[]").apply()
    return (0 until raw.length()).map {
      val o = raw.getJSONObject(it)
      mapOf("type" to o.getString("type"), "at" to o.getLong("at").toDouble())
    }
  }
}
