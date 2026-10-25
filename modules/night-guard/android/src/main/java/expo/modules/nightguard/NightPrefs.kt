package expo.modules.nightguard

import android.content.Context
import android.content.SharedPreferences
import java.util.Calendar

object NightPrefs {
  const val FILE = "nudge_night_guard"
  const val ENABLED = "enabled"
  const val BED = "bed"
  const val WAKE = "wake"
  const val WINDOW = "window"
  const val ACK = "ack"
  const val BABY = "baby"
  const val LAST_ALERT = "lastAlert"
  const val LABEL = "interruptLabel"
  const val GRACE = "graceUntil"
  const val LAST_MORNING = "lastMorning"

  fun get(ctx: Context): SharedPreferences = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  /** The night a moment belongs to: before noon counts as the previous evening. Same format as the JS dayKey. */
  fun nightKey(now: Calendar = Calendar.getInstance()): String {
    val c = now.clone() as Calendar
    if (c.get(Calendar.HOUR_OF_DAY) < 12) c.add(Calendar.DAY_OF_MONTH, -1)
    return "${c.get(Calendar.YEAR)}-${c.get(Calendar.MONTH) + 1}-${c.get(Calendar.DAY_OF_MONTH)}"
  }

  fun ack(ctx: Context, night: String, baby: Boolean) {
    val prefs = get(ctx)
    val editor = prefs.edit().putString(ACK, night)
    if (baby) {
      val set = (prefs.getStringSet(BABY, emptySet()) ?: emptySet()).toMutableSet()
      set.add(night)
      // keep the last 30 nights
      editor.putStringSet(BABY, set.sortedBy { it }.takeLast(30).toSet())
    }
    editor.apply()
  }
}
