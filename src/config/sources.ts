// Maps Health Connect data origins (package names) to readable labels.
const SOURCE_LABELS: Record<string, string> = {
  'com.xiaomi.wearable': 'Mi Fitness',
  'com.mi.health': 'Mi Fitness',
  'com.huami.watch.hmwatchmanager': 'Zepp',
  'com.xiaomi.hm.health': 'Zepp Life',
  'com.google.android.apps.fitness': 'Google Health',
  'com.google.android.apps.healthdata': 'Health Connect',
  'com.gizhak.coach': 'Nudge',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.samsung.android.app.shealth': 'Samsung Health',
  'com.garmin.android.apps.connectmobile': 'Garmin',
};

export function sourceLabel(packageName: string | undefined): string {
  if (!packageName) return 'לא ידוע';
  if (packageName.startsWith('com.android.healthconnect.phone')) return 'חיישן הטלפון';
  return SOURCE_LABELS[packageName] ?? packageName;
}

export function sourceLabels(packages: (string | undefined)[]): string {
  const unique = Array.from(new Set(packages.filter(Boolean).map(sourceLabel)));
  return unique.length ? unique.join(' + ') : 'אין מקור';
}
