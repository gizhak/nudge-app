package expo.modules.nightguard

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import java.util.Calendar

/**
 * Runs in the foreground so it survives, and listens for the phone being unlocked.
 * An unlock after bedtime means he is awake: post the coach's "go to sleep" message
 * straight from here, no JavaScript needed.
 */
class NightGuardService : Service() {
  private var receiver: BroadcastReceiver? = null
  private var carReceiver: BroadcastReceiver? = null
  private var wifiCallback: android.net.ConnectivityManager.NetworkCallback? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    ensureChannels(this)
    val notification = NotificationCompat.Builder(this, GUARD_CHANNEL)
      .setSmallIcon(smallIcon(this))
      .setContentTitle("Nudge שומר על הלילה שלך")
      .setContentText("אם תפתח את הטלפון אחרי שעת השינה, אני אגיד לך")
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setContentIntent(openAppIntent(this))
      .build()
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(GUARD_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(GUARD_ID, notification)
    }

    val r = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        onUnlock(context)
      }
    }
    receiver = r
    val filter = IntentFilter(Intent.ACTION_USER_PRESENT)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      registerReceiver(r, filter)
    }

    // Car connect and disconnect, also heard here while the service runs
    val car = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        CarPrefs.onAcl(context, intent)
      }
    }
    carReceiver = car
    val carFilter = IntentFilter().apply {
      addAction(android.bluetooth.BluetoothDevice.ACTION_ACL_CONNECTED)
      addAction(android.bluetooth.BluetoothDevice.ACTION_ACL_DISCONNECTED)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(car, carFilter, Context.RECEIVER_EXPORTED)
    } else {
      registerReceiver(car, carFilter)
    }

    // Joining or leaving a Wi-Fi network: arriving home or at work, or leaving
    try {
      val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
      val cb = object : android.net.ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: android.net.Network) {
          WifiPrefs.changed(this@NightGuardService)
        }
        override fun onLost(network: android.net.Network) {
          WifiPrefs.changed(this@NightGuardService)
        }
      }
      val req = android.net.NetworkRequest.Builder().addTransportType(android.net.NetworkCapabilities.TRANSPORT_WIFI).build()
      cm.registerNetworkCallback(req, cb)
      wifiCallback = cb
    } catch (e: Exception) {
      // no Wi-Fi watching on this phone; the periodic check still looks
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!NightPrefs.get(this).getBoolean(NightPrefs.ENABLED, false)) {
      stopSelf()
      return START_NOT_STICKY
    }
    return START_STICKY
  }

  override fun onDestroy() {
    receiver?.let { unregisterReceiver(it) }
    receiver = null
    carReceiver?.let { unregisterReceiver(it) }
    carReceiver = null
    wifiCallback?.let {
      try {
        (getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager).unregisterNetworkCallback(it)
      } catch (e: Exception) {
      }
    }
    wifiCallback = null
    super.onDestroy()
  }

  companion object {
    const val GUARD_CHANNEL = "nudge_guard"
    const val COACH_CHANNEL = "coach_urgent"
    const val GUARD_ID = 7301
    const val ALERT_ID = 7302
    private const val THROTTLE_MS = 20 * 60 * 1000L
    private const val MORNING_THROTTLE_MS = 10 * 60 * 1000L

    fun ensureChannels(ctx: Context) {
      if (Build.VERSION.SDK_INT < 26) return
      val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(GUARD_CHANNEL) == null) {
        nm.createNotificationChannel(NotificationChannel(GUARD_CHANNEL, "שומר הלילה", NotificationManager.IMPORTANCE_MIN))
      }
      if (nm.getNotificationChannel(COACH_CHANNEL) == null) {
        nm.createNotificationChannel(NotificationChannel(COACH_CHANNEL, "Nudge: חשוב", NotificationManager.IMPORTANCE_HIGH))
      }
    }

    fun smallIcon(ctx: Context): Int {
      val id = ctx.resources.getIdentifier("notification_icon", "drawable", ctx.packageName)
      return if (id != 0) id else android.R.drawable.ic_dialog_info
    }

    fun openAppIntent(ctx: Context): PendingIntent? {
      val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return null
      return PendingIntent.getActivity(ctx, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun actionIntent(ctx: Context, action: String, code: Int): PendingIntent {
      val i = Intent(ctx, NightActionReceiver::class.java).setAction(action)
      return PendingIntent.getBroadcast(ctx, code, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    fun onUnlock(ctx: Context) {
      val prefs = NightPrefs.get(ctx)
      if (!prefs.getBoolean(NightPrefs.ENABLED, false)) return
      NightPrefs.noteUnlock(ctx)
      val now = Calendar.getInstance()
      val m = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)
      val bed = prefs.getInt(NightPrefs.BED, 23 * 60 + 30)
      val wake = prefs.getInt(NightPrefs.WAKE, 6 * 60 + 30)
      // Morning: from half an hour before waking until noon, an unlock wakes the coach (weigh-in, water before coffee)
      if (m >= wake - 30 && m < 12 * 60) {
        val lastMorning = prefs.getLong(NightPrefs.LAST_MORNING, 0L)
        if (System.currentTimeMillis() - lastMorning >= MORNING_THROTTLE_MS) {
          prefs.edit().putLong(NightPrefs.LAST_MORNING, System.currentTimeMillis()).apply()
          try {
            ctx.startService(Intent(ctx, UnlockTaskService::class.java))
          } catch (e: Exception) {
            // not allowed right now; the next background run asks instead
          }
        }
        return
      }
      val window = prefs.getInt(NightPrefs.WINDOW, 300)
      val sinceBed = ((m - bed) % 1440 + 1440) % 1440
      val untilWake = ((wake - m) % 1440 + 1440) % 1440
      if (sinceBed >= window || untilWake <= 60) return
      if (prefs.getString(NightPrefs.ACK, null) == NightPrefs.nightKey(now)) return
      // Going out tonight: quiet until the grace time the app set
      if (System.currentTimeMillis() < prefs.getLong(NightPrefs.GRACE, 0L)) return
      val last = prefs.getLong(NightPrefs.LAST_ALERT, 0L)
      if (System.currentTimeMillis() - last < THROTTLE_MS) return
      prefs.edit().putLong(NightPrefs.LAST_ALERT, System.currentTimeMillis()).apply()

      ensureChannels(ctx)
      val hours = "${untilWake / 60}:${(untilWake % 60).toString().padStart(2, '0')}"
      val title = if (sinceBed < 5) "זמן לישון" else if (sinceBed < 60) "עברו $sinceBed דקות משעת השינה" else "עברו ${sinceBed / 60}:${(sinceBed % 60).toString().padStart(2, '0')} שעות משעת השינה"
      val body = "פתחת את הטלפון. אם תירדם עכשיו תישן $hours שעות. הנח את הטלפון."
      val builder = NotificationCompat.Builder(ctx, COACH_CHANNEL)
        .setSmallIcon(smallIcon(ctx))
        .setColor(0xFFFF4D2E.toInt())
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setAutoCancel(true)
        .setDeleteIntent(actionIntent(ctx, NightActionReceiver.SEEN, 3))
        .addAction(0, "ידוע לי, זה בסדר", actionIntent(ctx, NightActionReceiver.ACK, 1))
      // Second button only for people who said they have broken nights (baby, kids, waking up)
      val label = prefs.getString(NightPrefs.LABEL, "") ?: ""
      if (label.isNotEmpty()) builder.addAction(0, label, actionIntent(ctx, NightActionReceiver.BABY, 2))
      val n: Notification = builder.build()
      try {
        (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(ALERT_ID, n)
      } catch (e: SecurityException) {
        // notifications not allowed
      }
    }
  }
}
