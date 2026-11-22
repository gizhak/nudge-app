package expo.modules.nightguard

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/** Runs the JavaScript task "NudgeWidget": writes cups tapped on the widget and redraws the widgets. */
class WidgetTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
    HeadlessJsTaskConfig("NudgeWidget", Arguments.createMap(), 60_000L, true)
}
