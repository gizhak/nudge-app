package expo.modules.nightguard

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Bluetooth connect and disconnect, delivered even when the app is closed. */
class CarReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    CarPrefs.onAcl(context, intent)
  }
}
