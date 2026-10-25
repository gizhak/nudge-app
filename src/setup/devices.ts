// Which apps feed the coach, by the watch and food app the user has. Pure.
import type { FoodAppKind, WatchKind } from '../profile/profile';

export interface AppInfo {
  name: string;
  pkg: string;
  /** Where to switch on Health Connect inside that app. Menus move between versions. */
  connect: string;
}

export const APPS = {
  miFitness: { name: 'Mi Fitness', pkg: 'com.xiaomi.wearable', connect: 'בפרופיל, נכנסים ל Health Connect ומפעילים את כל סוגי הנתונים.' },
  zepp: { name: 'Zepp', pkg: 'com.huami.watch.hmwatchmanager', connect: 'בפרופיל, "הוסף חשבונות", Health Connect, ומפעילים הכל.' },
  samsung: { name: 'Samsung Health', pkg: 'com.sec.android.app.shealth', connect: 'בהגדרות של Samsung Health, Health Connect, ומאשרים את כל ההרשאות.' },
  garmin: { name: 'Garmin Connect', pkg: 'com.garmin.android.apps.connectmobile', connect: 'בתפריט "עוד", הגדרות, אפליקציות מחוברות, Health Connect.' },
  fitbit: { name: 'Fitbit', pkg: 'com.fitbit.FitbitMobile', connect: 'בחשבון, Health Connect, ומפעילים סנכרון.' },
} satisfies Record<string, AppInfo>;

export const HEALTH_CONNECT_PKG = 'com.google.android.apps.healthdata';

export const WATCHES: { key: WatchKind; label: string }[] = [
  { key: 'xiaomi', label: 'שיאומי' },
  { key: 'amazfit', label: 'Amazfit' },
  { key: 'samsung', label: 'Samsung Galaxy Watch' },
  { key: 'garmin', label: 'Garmin' },
  { key: 'fitbit', label: 'Fitbit' },
  { key: 'none', label: 'אין שעון' },
  { key: 'other', label: 'אחר' },
];

export const FOOD_APPS: { key: FoodAppKind; label: string }[] = [
  { key: 'zepp', label: 'Zepp, צילום עם AI (מומלץ, חינם)' },
  { key: 'samsung', label: 'Samsung Health' },
  { key: 'other', label: 'אפליקציה אחרת שמחוברת ל Health Connect' },
  { key: 'none', label: 'אין לי' },
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
  const works = ['צעדים', 'מים', 'משקל', 'אימונים', 'שומר לילה'];
  const missing: string[] = [];
  if (hasWatch(watch)) works.push('שינה', 'דופק');
  else missing.push('שינה ודופק, כי אין שעון');
  if (food === 'none') missing.push('תזונה, עד שתתקין את Zepp');
  else works.push('תזונה ומשוב על ארוחות');
  return { works, missing };
}
