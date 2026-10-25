package expo.modules.nightguard

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

/** Restarts the night guard after the phone reboots, if it was on. */
class NightBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    if (!NightPrefs.get(context).getBoolean(NightPrefs.ENABLED, false)) return
    try {
      ContextCompat.startForegroundService(context, Intent(context, NightGuardService::class.java))
    } catch (e: Exception) {
      // Some phones block starts from boot; the app restarts it when opened
    }
  }
}
