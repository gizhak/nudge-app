package expo.modules.nightguard

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/** Runs the JavaScript task "NudgeWifi": a Wi-Fi network came or went, so maybe a place did. */
class WifiTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
    HeadlessJsTaskConfig("NudgeWifi", Arguments.createMap(), 60_000L, true)
}
