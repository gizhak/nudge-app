// Android 11+ hides other apps unless declared in <queries>. Declares the apps the app opens or detects.
const { withAndroidManifest } = require('@expo/config-plugins');

const PACKAGES = [
  'com.huami.watch.hmwatchmanager',
  'com.xiaomi.wearable',
  'com.xiaomi.hm.health',
  'com.sec.android.app.shealth',
  'com.garmin.android.apps.connectmobile',
  'com.fitbit.FitbitMobile',
  'com.google.android.apps.fitness',
  'com.google.android.apps.healthdata',
  'com.google.android.googlequicksearchbox',
  'com.google.ar.lens',
];

module.exports = function withAppQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.queries = manifest.queries ?? [{}];
    const q = manifest.queries[0];
    q.package = q.package ?? [];
    for (const name of PACKAGES) {
      if (!q.package.some((p) => p.$?.['android:name'] === name)) q.package.push({ $: { 'android:name': name } });
    }
    return cfg;
  });
};
