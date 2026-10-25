package expo.modules.nightguard

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Buttons on the night notification: "I know, it's fine" and "the baby woke me". Both silence tonight. */
class NightActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == SEEN) {
      // Swiped away: he saw it. Quiet for an hour, then the guard may speak again.
      NightPrefs.get(context).edit().putLong(NightPrefs.GRACE, System.currentTimeMillis() + 60 * 60 * 1000L).apply()
      return
    }
    val baby = intent.action == BABY
    NightPrefs.ack(context, NightPrefs.nightKey(), baby)
    (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NightGuardService.ALERT_ID)
  }

  companion object {
    const val ACK = "expo.modules.nightguard.ACK"
    const val BABY = "expo.modules.nightguard.BABY"
    const val SEEN = "expo.modules.nightguard.SEEN"
  }
}
