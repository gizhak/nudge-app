// Lets other apps share plain text into Nudge (Android "Share" sheet), e.g. a menu copied with Google Lens.
const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withShareText(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    const main = app.activity.find((a) => a.$['android:name'] === '.MainActivity');
    if (!main) return cfg;
    main['intent-filter'] = main['intent-filter'] ?? [];
    const exists = main['intent-filter'].some((f) => (f.action ?? []).some((a) => a.$['android:name'] === 'android.intent.action.SEND'));
    if (!exists) {
      main['intent-filter'].push({
        action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:mimeType': 'text/plain' } }],
      });
    }
    return cfg;
  });
};
