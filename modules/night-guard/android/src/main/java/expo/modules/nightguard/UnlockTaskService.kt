package expo.modules.nightguard

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/** Runs the JavaScript task "NudgeUnlock": the coach checks the morning the moment he picks up the phone. */
class UnlockTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
    HeadlessJsTaskConfig("NudgeUnlock", Arguments.createMap(), 60_000L, true)
}
