package expo.modules.nightguard

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The home screen widgets: water, with a button that logs a cup without opening the app, and food,
 * with what is left today and the next meal. The app computes everything and hands it over as JSON
 * (texts included, in its language); the widgets only draw it. A cup tapped on the widget counts at
 * once here, and is written to Health Connect by the app's JavaScript as soon as it can run.
 */
object WidgetPrefs {
  private const val FILE = "nudge_widgets"
  const val DATA = "data"
  const val PENDING = "pending"
  const val PENDING_DAY = "pending_day"
  const val ADDED_AT = "added_at"
  const val LAUNCH = "launch"

  fun get(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  fun today(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

  fun data(ctx: Context): JSONObject =
    try { JSONObject(get(ctx).getString(DATA, null) ?: "{}") } catch (e: Exception) { JSONObject() }

  /** Cups tapped on the widget today and not yet written by the app */
  fun pending(ctx: Context): Int {
    val p = get(ctx)
    return if (p.getString(PENDING_DAY, null) == today()) p.getInt(PENDING, 0) else 0
  }

  fun addPending(ctx: Context, n: Int) {
    val p = get(ctx)
    val now = pending(ctx) + n
    p.edit().putInt(PENDING, maxOf(0, now)).putString(PENDING_DAY, today()).commit()
  }

  /** Hands the pending cups to the app and clears them; it puts back what it could not write */
  fun takePending(ctx: Context): Int {
    val n = pending(ctx)
    get(ctx).edit().putInt(PENDING, 0).putString(PENDING_DAY, today()).commit()
    return n
  }

  fun updateAll(ctx: Context) {
    val m = AppWidgetManager.getInstance(ctx)
    for (id in m.getAppWidgetIds(ComponentName(ctx, NudgeWaterWidget::class.java))) NudgeWaterWidget.draw(ctx, m, id)
    for (id in m.getAppWidgetIds(ComponentName(ctx, NudgeFoodWidget::class.java))) NudgeFoodWidget.draw(ctx, m, id)
  }

  /** Opens the app at a place: "home", "food" or "check" */
  fun openApp(ctx: Context, target: String, code: Int): PendingIntent {
    val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)!!
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      .putExtra("nudge_open", target)
    return PendingIntent.getActivity(ctx, code, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

}

class NudgeWaterWidget : AppWidgetProvider() {
  companion object {
    const val ADD = "expo.modules.nightguard.WIDGET_ADD_CUP"

    fun draw(ctx: Context, m: AppWidgetManager, id: Int) {
      val d = WidgetPrefs.data(ctx)
      val w = d.optJSONObject("water") ?: JSONObject()
      val t = d.optJSONObject("text") ?: JSONObject()
      val sameDay = d.optString("day") == WidgetPrefs.today()
      val cup = w.optInt("cupMl", 250)
      val base = if (sameDay) w.optInt("ml", 0) else 0
      val ml = base + WidgetPrefs.pending(ctx) * cup
      val target = maxOf(1, w.optInt("targetMl", 2500))
      val done = ml >= target
      val v = RemoteViews(ctx.packageName, R.layout.nudge_widget_water)
      v.setTextViewText(R.id.nw_water_title, t.optString("water", "מים"))
      // Liters with one decimal, like the app; sips counted too when he drinks in sips
      v.setTextViewText(R.id.nw_water_num, String.format(Locale.US, "%.1f", Math.round(ml / 100.0) / 10.0))
      val sipMl = w.optInt("sipMl", 0)
      val of = t.optString("of", "מתוך %s ל'").replace("%s", String.format(Locale.US, "%.1f", Math.round(target / 100.0) / 10.0))
      val sipsText = if (sipMl > 0) " · " + t.optString("sips", "%s לגימות").replace("%s", Math.round(ml.toDouble() / sipMl).toString()) else ""
      v.setTextViewText(R.id.nw_water_of, of + sipsText)
      val pct = minOf(100, ml * 100 / target)
      v.setViewVisibility(R.id.nw_water_bar, if (done) View.GONE else View.VISIBLE)
      v.setViewVisibility(R.id.nw_water_bar_good, if (done) View.VISIBLE else View.GONE)
      v.setProgressBar(R.id.nw_water_bar, 100, pct, false)
      v.setTextColor(R.id.nw_water_num, ctx.getColor(if (done) R.color.nw_good else R.color.nw_ink))
      v.setInt(R.id.nw_water_add, "setBackgroundResource", if (done) R.drawable.nw_bg_good else R.drawable.nw_bg_water)
      v.setTextViewText(R.id.nw_water_add, t.optString("addCup", "+ כוס"))
      // "Logged, 250 ml" after a tap, until the next drawing that the app makes
      val justAdded = System.currentTimeMillis() - WidgetPrefs.get(ctx).getLong(WidgetPrefs.ADDED_AT, 0L) < 60_000L
      v.setViewVisibility(R.id.nw_water_note, if (justAdded) View.VISIBLE else View.GONE)
      v.setTextViewText(R.id.nw_water_note, t.optString("added", "נרשם"))
      val add = PendingIntent.getBroadcast(ctx, 7101, Intent(ctx, NudgeWaterWidget::class.java).setAction(ADD), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      v.setOnClickPendingIntent(R.id.nw_water_add, add)
      v.setOnClickPendingIntent(R.id.nw_root, WidgetPrefs.openApp(ctx, "home", 7102))
      m.updateAppWidget(id, v)
    }
  }

  override fun onUpdate(ctx: Context, m: AppWidgetManager, ids: IntArray) {
    for (id in ids) draw(ctx, m, id)
  }

  override fun onReceive(ctx: Context, intent: Intent) {
    super.onReceive(ctx, intent)
    if (intent.action != ADD) return
    WidgetPrefs.addPending(ctx, 1)
    WidgetPrefs.get(ctx).edit().putLong(WidgetPrefs.ADDED_AT, System.currentTimeMillis()).commit()
    WidgetPrefs.updateAll(ctx)
    // The app writes it to Health Connect now if Android lets it run; otherwise when it next opens
    try {
      ctx.startService(Intent(ctx, WidgetTaskService::class.java))
    } catch (e: Exception) {
      // background start not allowed right now
    }
  }
}

class NudgeFoodWidget : AppWidgetProvider() {
  companion object {
    fun draw(ctx: Context, m: AppWidgetManager, id: Int) {
      val d = WidgetPrefs.data(ctx)
      val f = d.optJSONObject("food") ?: JSONObject()
      val t = d.optJSONObject("text") ?: JSONObject()
      val sameDay = d.optString("day") == WidgetPrefs.today()
      val v = RemoteViews(ctx.packageName, R.layout.nudge_widget_food)
      v.setTextViewText(R.id.nw_food_title, t.optString("food", "אוכל היום"))
      if (sameDay) {
        v.setTextViewText(R.id.nw_food_left, f.optString("left", ""))
        v.setTextViewText(R.id.nw_food_left_sub, f.optString("leftSub", ""))
        v.setTextViewText(R.id.nw_food_pro, f.optString("protein", ""))
        v.setTextViewText(R.id.nw_food_pro_sub, f.optString("proteinSub", ""))
        v.setTextViewText(R.id.nw_food_next_label, f.optString("nextLabel", ""))
        v.setTextViewText(R.id.nw_food_next_text, f.optString("nextText", ""))
      } else {
        v.setTextViewText(R.id.nw_food_left, "")
        v.setTextViewText(R.id.nw_food_left_sub, t.optString("openApp", "פתח את Nudge לעדכון"))
        v.setTextViewText(R.id.nw_food_pro, "")
        v.setTextViewText(R.id.nw_food_pro_sub, "")
        v.setTextViewText(R.id.nw_food_next_label, "")
        v.setTextViewText(R.id.nw_food_next_text, "")
      }
      val now = sameDay && f.optBoolean("now", false)
      v.setInt(R.id.nw_food_next, "setBackgroundResource", if (now) R.drawable.nw_bg_dark else R.drawable.nw_bg_box)
      v.setTextColor(R.id.nw_food_next_text, ctx.getColor(if (now) R.color.nw_on_dark else R.color.nw_ink))
      v.setTextColor(R.id.nw_food_next_label, ctx.getColor(if (now) R.color.nw_chip else R.color.nw_muted))
      v.setTextViewText(R.id.nw_food_zepp, t.optString("zepp", "צלם ב Zepp"))
      v.setTextViewText(R.id.nw_food_check, t.optString("check", "בדוק"))
      // Zepp opens straight away; without it installed, the app's food screen
      val zepp = ctx.packageManager.getLaunchIntentForPackage(d.optString("zeppPackage", "com.huami.watch.hmwatchmanager"))
      val zeppPi = if (zepp != null) {
        PendingIntent.getActivity(ctx, 7201, zepp.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      } else WidgetPrefs.openApp(ctx, "food", 7201)
      v.setOnClickPendingIntent(R.id.nw_food_zepp, zeppPi)
      v.setOnClickPendingIntent(R.id.nw_food_check, WidgetPrefs.openApp(ctx, "check", 7202))
      v.setOnClickPendingIntent(R.id.nw_root, WidgetPrefs.openApp(ctx, "food", 7203))
      m.updateAppWidget(id, v)
    }
  }

  override fun onUpdate(ctx: Context, m: AppWidgetManager, ids: IntArray) {
    for (id in ids) draw(ctx, m, id)
  }
}
