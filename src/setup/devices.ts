// Which apps feed the coach, by the watch and food app the user has. Pure.
import type { FoodAppKind, WatchKind } from '../profile/profile';

import { t } from '../i18n';
export interface AppInfo {
  name: string;
  pkg: string;
  /** Where to switch on Health Connect inside that app. Menus move between versions. */
  connect: string;
}

export const APPS = {
  miFitness: { name: 'Mi Fitness', pkg: 'com.xiaomi.wearable', connect: t('בפרופיל, נכנסים ל Health Connect ומפעילים את כל סוגי הנתונים.', 'In the profile, open Health Connect and turn on every data type.') },
  zepp: { name: 'Zepp', pkg: 'com.huami.watch.hmwatchmanager', connect: t('בפרופיל, "הוסף חשבונות", Health Connect, ומפעילים הכל.', 'In the profile, "Add accounts", Health Connect, and turn everything on.') },
  samsung: { name: 'Samsung Health', pkg: 'com.sec.android.app.shealth', connect: t('בהגדרות של Samsung Health, Health Connect, ומאשרים את כל ההרשאות.', 'In Samsung Health settings, Health Connect, and allow every permission.') },
  garmin: { name: 'Garmin Connect', pkg: 'com.garmin.android.apps.connectmobile', connect: t('בתפריט "עוד", הגדרות, אפליקציות מחוברות, Health Connect.', 'In the "More" menu, Settings, Connected apps, Health Connect.') },
  fitbit: { name: 'Fitbit', pkg: 'com.fitbit.FitbitMobile', connect: t('בחשבון, Health Connect, ומפעילים סנכרון.', 'In the account, Health Connect, and turn on sync.') },
} satisfies Record<string, AppInfo>;

export const HEALTH_CONNECT_PKG = 'com.google.android.apps.healthdata';

export const WATCHES: { key: WatchKind; label: string }[] = [
  { key: 'xiaomi', label: t('שיאומי', 'Xiaomi') },
  { key: 'amazfit', label: 'Amazfit' },
  { key: 'samsung', label: 'Samsung Galaxy Watch' },
  { key: 'garmin', label: 'Garmin' },
  { key: 'fitbit', label: 'Fitbit' },
  { key: 'none', label: t('אין שעון', 'No watch') },
  { key: 'other', label: t('אחר', 'Other') },
];

export const FOOD_APPS: { key: FoodAppKind; label: string }[] = [
  { key: 'zepp', label: t('Zepp, צילום עם AI (מומלץ, חינם)', 'Zepp, AI photo logging (recommended, free)') },
  { key: 'samsung', label: 'Samsung Health' },
  { key: 'other', label: t('אפליקציה אחרת שמחוברת ל Health Connect', 'Another app connected to Health Connect') },
  { key: 'none', label: t('אין לי', 'I do not have one') },
];

/** The app that brings steps, sleep and heart rate, or null when there is no watch. */
export function activityApp(watch: WatchKind | undefined): AppInfo | null {
  switch (watch) {
    case 'xiaomi':
      return APPS.miFitness;
    case 'amazfit':
      return APPS.zepp;
    case 'samsung':
      return APPS.samsung;
    case 'garmin':
      return APPS.garmin;
    case 'fitbit':
      return APPS.fitbit;
    default:
      return null;
  }
}

/** The app meals are logged in. "none" still recommends Zepp. */
export function foodApp(kind: FoodAppKind | undefined): AppInfo | null {
  if (kind === 'samsung') return APPS.samsung;
  if (kind === 'other') return null;
  return APPS.zepp;
}

export const hasWatch = (watch: WatchKind | undefined) => watch !== undefined && watch !== 'none';

/** What the coach can and cannot do with this setup, in plain words. */
export function capabilities(watch: WatchKind | undefined, food: FoodAppKind | undefined): { works: string[]; missing: string[] } {
  const works = [t('צעדים', 'Steps'), t('מים', 'Water'), t('משקל', 'Weight'), t('אימונים', 'Workouts'), t('שומר לילה', 'Night guard')];
  const missing: string[] = [];
  if (hasWatch(watch)) works.push(t('שינה', 'Sleep'), t('דופק', 'Heart rate'));
  else missing.push(t('שינה ודופק, כי אין שעון', 'Sleep and heart rate, since there is no watch'));
  if (food === 'none') missing.push(t('תזונה, עד שתתקין את Zepp', 'Nutrition, until you install Zepp'));
  else works.push(t('תזונה ומשוב על ארוחות', 'Nutrition and feedback on meals'));
  return { works, missing };
}
