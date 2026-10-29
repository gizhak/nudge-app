package expo.modules.nightguard

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class NightGuardConfig : Record {
  @Field var enabled: Boolean = false
  @Field var bedTime: Int = 23 * 60 + 30
  @Field var wakeTime: Int = 6 * 60 + 30
  @Field var windowMinutes: Int = 300
  @Field var interruptLabel: String = ""
}

private fun sharedText(intent: Intent?): String? {
  if (intent?.action != Intent.ACTION_SEND) return null
  return intent.getStringExtra(Intent.EXTRA_TEXT)?.takeIf { it.isNotBlank() }
}

class NightGuardModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No React context")

  override fun definition() = ModuleDefinition {
    Name("NightGuard")

    // Text shared into the app from another app (for example a menu copied with Google Lens)
    Events("onSharedText")

    OnNewIntent { intent ->
      sharedText(intent)?.let { sendEvent("onSharedText", mapOf("text" to it)) }
    }

    Function("takeInitialSharedText") {
      val intent = appContext.currentActivity?.intent ?: return@Function null
      val text = sharedText(intent)
      if (text != null) intent.removeExtra(Intent.EXTRA_TEXT)
      text
    }

    Function("configure") { config: NightGuardConfig ->
      val ctx = context
      NightPrefs.get(ctx).edit()
        .putBoolean(NightPrefs.ENABLED, config.enabled)
        .putInt(NightPrefs.BED, config.bedTime)
        .putInt(NightPrefs.WAKE, config.wakeTime)
        .putInt(NightPrefs.WINDOW, config.windowMinutes)
        .putString(NightPrefs.LABEL, config.interruptLabel)
        .apply()
      val intent = Intent(ctx, NightGuardService::class.java)
      if (config.enabled) {
        try {
          ContextCompat.startForegroundService(ctx, intent)
          true
        } catch (e: Exception) {
          false
        }
      } else {
        ctx.stopService(intent)
        false
      }
    }

    Function("ack") { night: String, baby: Boolean ->
      NightPrefs.ack(context, night, baby)
    }

    Function("setGraceUntil") { epochMs: Double ->
      NightPrefs.get(context).edit().putLong(NightPrefs.GRACE, epochMs.toLong()).apply()
    }

    // ---------- The car ----------

    /** Paired Bluetooth devices to pick the car from; null without the "nearby devices" permission. */
    Function("listPairedDevices") {
      try {
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as android.bluetooth.BluetoothManager
        val adapter = manager.adapter ?: return@Function emptyList<Map<String, String>>()
        adapter.bondedDevices.map { mapOf("name" to (it.name ?: it.address), "address" to it.address) }
      } catch (e: SecurityException) {
        null
      }
    }

    Function("setCar") { address: String, name: String ->
      val edit = CarPrefs.get(context).edit()
      if (address.isEmpty()) edit.remove(CarPrefs.ADDRESS).remove(CarPrefs.NAME)
      else edit.putString(CarPrefs.ADDRESS, address).putString(CarPrefs.NAME, name)
      edit.putBoolean(CarPrefs.CONNECTED, false).putString(CarPrefs.EVENTS, "[]").apply()
    }

    Function("getCarState") {
      val p = CarPrefs.get(context)
      mapOf(
        "address" to p.getString(CarPrefs.ADDRESS, null),
        "name" to p.getString(CarPrefs.NAME, null),
        "connected" to p.getBoolean(CarPrefs.CONNECTED, false),
        "since" to p.getLong(CarPrefs.SINCE, 0L).toDouble()
      )
    }

    // ---------- Wi-Fi ----------

    /** The network he is on and the networks around him, with their strength. */
    Function("wifiNow") { scan: Boolean ->
      WifiPrefs.now(context, scan)
    }

    Function("takeCarEvents") {
      CarPrefs.takeEvents(context)
    }

    Function("getUnlocks") {
      NightPrefs.unlocks(appContext.reactContext ?: return@Function emptyList<Double>())
    }

    // The app's language, read at start before any screen is drawn; a change shows from the next start
    Function("getLang") {
      NightPrefs.get(context).getString("lang", null)
    }
    Function("setLang") { lang: String ->
      NightPrefs.get(context).edit().putString("lang", lang).commit()
    }
    // Starts the app's screens again, so a new language takes effect now
    Function("reload") {
      try {
        val host = (context.applicationContext as com.facebook.react.ReactApplication).reactHost
        if (host == null) {
          false
        } else {
          android.os.Handler(android.os.Looper.getMainLooper()).post { host.reload("language") }
          true
        }
      } catch (e: Throwable) {
        false
      }
    }

    Function("getState") {
      val prefs = NightPrefs.get(context)
      mapOf(
        "ack" to prefs.getString(NightPrefs.ACK, null),
        "babyNights" to (prefs.getStringSet(NightPrefs.BABY, emptySet()) ?: emptySet()).toList(),
        "lastAlert" to prefs.getLong(NightPrefs.LAST_ALERT, 0L).toDouble()
      )
    }
  }
}
