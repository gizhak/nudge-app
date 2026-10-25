package expo.modules.nightguard

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/** Runs the JavaScript task "NudgeCar" so the coach handles a drive starting or ending right away. */
class CarTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
    HeadlessJsTaskConfig("NudgeCar", Arguments.createMap(), 60_000L, true)
}
