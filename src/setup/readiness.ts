// Readiness check: everything the app depends on, verified on this phone.
// Run after onboarding, on demand, and silently at launch to surface breakage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { getGrantedPermissions, getSdkStatus, initialize, readRecords, SdkAvailabilityStatus } from 'react-native-health-connect';
import { COACH_TASK } from '../coach/tasks';
import { loadPlaces } from '../coach/store';
import { sourceLabels } from '../config/sources';
import { loadProfile } from '../profile/profile';
import { activityApp, foodApp } from './devices';

export type CheckStatus = 'ok' | 'warn' | 'error' | 'manual';

export type ActionKey =
  | 'install_hc'
  | 'request_hc'
  | 'open_hc'
  | 'open_hc_data'
  | 'install_zepp'
  | 'open_zepp'
  | 'install_watch_app'
  | 'open_wizard'
  | 'request_notifications'
  | 'request_location'
  | 'go_coach'
  | 'start_coach'
  | 'battery'
  | 'confirm_battery'
  | 'edit_profile';

export interface CheckItem {
  id: string;
  group: string;
  title: string;
  status: CheckStatus;
  detail: string;
  actions?: { key: ActionKey; label: string }[];
}

export interface Readiness {
  at: number;
  items: CheckItem[];
  errors: number;
  warnings: number;
}

const DAY = 24 * 3600 * 1000;
const BATTERY_KEY = 'coach.batteryConfirmed.v1';
const LAST_KEY = 'coach.readiness.v1';

/** Watch and food apps the app knows how to work with through Health Connect. */
export const KNOWN_APPS = [
  { pkg: 'com.xiaomi.wearable', name: 'Mi Fitness', role: 'watch' },
  { pkg: 'com.huami.watch.hmwatchmanager', name: 'Zepp', role: 'food' },
  { pkg: 'com.xiaomi.hm.health', name: 'Zepp Life', role: 'watch' },
  { pkg: 'com.sec.android.app.shealth', name: 'Samsung Health', role: 'watch' },
  { pkg: 'com.garmin.android.apps.connectmobile', name: 'Garmin Connect', role: 'watch' },
  { pkg: 'com.fitbit.FitbitMobile', name: 'Fitbit', role: 'watch' },
  { pkg: 'com.google.android.apps.fitness', name: 'Google Health', role: 'hub' },
] as const;

async function isInstalled(pkg: string): Promise<boolean> {
  try {
    return !!(await IntentLauncher.getApplicationIconAsync(pkg));
  } catch {
    return false;
  }
}

const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / DAY);

/** Latest record and its sources for a data type over the last `days` days. */
async function latest(type: 'Steps' | 'SleepSession' | 'HeartRate' | 'ExerciseSession' | 'Nutrition' | 'Weight', days: number) {
  const now = new Date();
  const { records }: any = await readRecords(type, {
    timeRangeFilter: { operator: 'between', startTime: new Date(now.getTime() - days * DAY).toISOString(), endTime: now.toISOString() },
    ascendingOrder: false,
    pageSize: 30,
  });
  if (!records.length) return null;
  const r = records[0];
  return {
    when: (r.endTime ?? r.time ?? r.startTime) as string,
    sources: sourceLabels(records.map((x: any) => x.metadata?.dataOrigin)),
  };
}

function manufacturerHint(): string {
  const c: any = Platform.constants ?? {};
  const brand = String(c.Brand ?? c.Manufacturer ?? '').toLowerCase();
  if (/xiaomi|redmi|poco/.test(brand)) return 'בשיאומי: הגדרות, אפליקציות, Coach: הפעל "הפעלה אוטומטית" ובחר "ללא הגבלות" בחיסכון סוללה.';
  if (/huawei|honor/.test(brand)) return 'בהואווי: הגדרות, סוללה, הפעלת אפליקציות: Coach בניהול ידני, עם כל שלוש האפשרויות פעילות.';
  if (/oppo|realme|oneplus/.test(brand)) return 'הגדרות, סוללה, Coach: אפשר פעילות ברקע והפעלה אוטומטית.';
  if (/samsung/.test(brand)) return 'בסמסונג: הגדרות, סוללה, מגבלות שימוש ברקע: ודא ש Coach לא ברשימת האפליקציות הרדומות.';
  if (/vivo/.test(brand)) return 'בויוו: הגדרות, סוללה, צריכת חשמל ברקע: אפשר עבור Coach.';
  return 'הגדרות, אפליקציות, Coach, סוללה: בחר "ללא הגבלות".';
}

export async function runReadiness(): Promise<Readiness> {
  const items: CheckItem[] = [];
  const add = (i: CheckItem) => items.push(i);

  // Health Connect
  const sdk = await getSdkStatus().catch(() => -1);
  const hcReady = sdk === SdkAvailabilityStatus.SDK_AVAILABLE;
  add({
    id: 'hc_available',
    group: 'Health Connect',
    title: 'Health Connect מותקן',
    status: hcReady ? 'ok' : 'error',
    detail: hcReady ? 'זמין' : 'לא מותקן או דורש עדכון. בלעדיו האפליקציה לא מקבלת נתונים.',
    actions: hcReady ? undefined : [{ key: 'install_hc', label: 'התקן או עדכן' }],
  });

  let granted = new Set<string>();
  let background = false;
  if (hcReady) {
    try {
      await initialize();
      const perms = await getGrantedPermissions();
      granted = new Set(perms.map((p) => `${p.accessType}:${p.recordType}`));
      background = granted.has('read:BackgroundAccessPermission');
    } catch {
      // treated as nothing granted
    }
    const critical = ['Steps', 'SleepSession', 'ExerciseSession', 'Nutrition', 'Weight'];
    const optional = ['ActiveCaloriesBurned', 'HeartRate', 'RestingHeartRate', 'Distance', 'Hydration'];
    const missingCritical = critical.filter((t) => !granted.has(`read:${t}`));
    const missingOptional = optional.filter((t) => !granted.has(`read:${t}`));
    add({
      id: 'hc_read',
      group: 'Health Connect',
      title: 'הרשאות קריאה',
      status: missingCritical.length ? 'error' : missingOptional.length ? 'warn' : 'ok',
      detail: missingCritical.length || missingOptional.length ? `חסרות: ${[...missingCritical, ...missingOptional].join(', ')}` : 'כל ההרשאות ניתנו',
      actions: missingCritical.length || missingOptional.length ? [{ key: 'request_hc', label: 'אשר הרשאות' }, { key: 'open_hc', label: 'הגדרות' }] : undefined,
    });
    add({
      id: 'hc_background',
      group: 'Health Connect',
      title: 'קריאה ברקע',
      status: background ? 'ok' : 'warn',
      detail: background ? 'המאמן יכול לבדוק נתונים כשהאפליקציה סגורה' : 'בלעדיה המאמן לא יראה ארוחות ושינה כשהאפליקציה סגורה',
      actions: background ? undefined : [{ key: 'request_hc', label: 'אשר' }],
    });
    add({
      id: 'hc_write_weight',
      group: 'Health Connect',
      title: 'שמירת משקל',
      status: granted.has('write:Weight') ? 'ok' : 'warn',
      detail: granted.has('write:Weight') ? 'משקל שמוזן באפליקציה נשמר' : 'בלי ההרשאה לא ניתן לשמור משקל',
      actions: granted.has('write:Weight') ? undefined : [{ key: 'request_hc', label: 'אשר' }],
    });
    add({
      id: 'hc_write_water',
      group: 'Health Connect',
      title: 'שמירת מים',
      status: granted.has('write:Hydration') ? 'ok' : 'warn',
      detail: granted.has('write:Hydration') ? 'כוסות מים שנרשמות באפליקציה נשמרות' : 'בלי ההרשאה לא ניתן לרשום מים',
      actions: granted.has('write:Hydration') ? undefined : [{ key: 'request_hc', label: 'אשר' }],
    });
  }

  // Data actually arriving, per type
  if (hcReady) {
    const types = [
      { type: 'Steps', title: 'צעדים', fresh: 2, watch: true },
      { type: 'SleepSession', title: 'שינה', fresh: 2, watch: true },
      { type: 'HeartRate', title: 'דופק', fresh: 2, watch: true },
      { type: 'ExerciseSession', title: 'אימונים', fresh: 14, watch: true },
      { type: 'Nutrition', title: 'תזונה', fresh: 2, watch: false },
      { type: 'Weight', title: 'משקל', fresh: 14, watch: false },
    ] as const;
    for (const t of types) {
      const canRead = granted.has(`read:${t.type}`);
      const hit = canRead ? await latest(t.type, 30).catch(() => null) : null;
      const age = hit ? daysAgo(hit.when) : null;
      const status: CheckStatus = !canRead ? 'error' : hit === null ? (t.watch && t.type !== 'ExerciseSession' ? 'error' : 'warn') : age! > t.fresh ? 'warn' : 'ok';
      const detail = !canRead
        ? 'אין הרשאת קריאה'
        : hit === null
          ? t.type === 'Nutrition'
            ? 'עוד לא נרשמו ארוחות ב30 יום.'
            : t.type === 'Weight'
              ? 'עוד אין שקילות. מזינים במסך ההתקדמות.'
              : t.type === 'ExerciseSession'
                ? 'אין אימונים רשומים ב30 יום'
                : 'לא מגיעים נתונים. בדוק שאפליקציית השעון מורשית לכתוב ל Health Connect.'
          : `${hit.sources} · ${age === 0 ? 'היום' : `לפני ${age} ימים`}`;
      add({
        id: `data_${t.type}`,
        group: 'נתונים שמגיעים',
        title: t.title,
        status,
        detail,
        actions:
          status === 'ok'
            ? undefined
            : !canRead
              ? [{ key: 'request_hc', label: 'אשר הרשאה' }]
              : t.type === 'Nutrition'
              ? [{ key: 'open_zepp', label: 'פתח Zepp' }]
              : t.watch
                ? [{ key: 'open_hc_data', label: 'הרשאות מקורות' }]
                : undefined,
      });
    }
  }

  // Source apps installed on the phone
  const installed = [];
  for (const app of KNOWN_APPS) if (await isInstalled(app.pkg)) installed.push(app);
  const watchApps = installed.filter((a) => a.role === 'watch');
  const prof = await loadProfile();
  const want = activityApp(prof.watch);
  if (prof.watch === 'none') {
    add({ id: 'apps_watch', group: 'אפליקציות', title: 'שעון', status: 'ok', detail: 'אין שעון: צעדים מהטלפון, בלי שינה ודופק.' });
  } else {
    const ok = want ? installed.some((a) => a.pkg === want.pkg) : watchApps.length > 0;
    add({
      id: 'apps_watch',
      group: 'אפליקציות',
      title: want ? `אפליקציית השעון (${want.name})` : 'אפליקציית שעון',
      status: ok ? 'ok' : 'error',
      detail: ok ? (want ? `${want.name} מותקנת.` : watchApps.map((a) => a.name).join(', ')) : 'לא מותקנת. האשף יגיד מה להתקין ואיך לחבר.',
      actions: ok ? undefined : [{ key: 'open_wizard', label: 'אשף החיבורים' }],
    });
  }
  const food = foodApp(prof.foodApp);
  if (prof.foodApp !== 'other' && food) {
    const has = installed.some((a) => a.pkg === food.pkg) || (await isInstalled(food.pkg));
    add({
      id: 'apps_food',
      group: 'אפליקציות',
      title: `רישום ארוחות (${food.name})`,
      status: has ? 'ok' : 'warn',
      detail: has ? `מותקן. ודא שב ${food.name} מופעל חיבור ל Health Connect.` : 'לא מותקן. בלי אפליקציית אוכל אין תזונה.',
      actions: has ? undefined : [{ key: 'open_wizard', label: 'אשף החיבורים' }],
    });
  }

  // Notifications and background work
  const notif = await Notifications.getPermissionsAsync().catch(() => null);
  add({
    id: 'notifications',
    group: 'התראות ורקע',
    title: 'התראות',
    status: notif?.granted ? 'ok' : 'error',
    detail: notif?.granted ? 'מאושרות' : 'חסומות. המאמן לא יוכל לשלוח הודעות.',
    actions: notif?.granted ? undefined : [{ key: 'request_notifications', label: 'אפשר' }],
  });

  const bgStatus = await BackgroundTask.getStatusAsync().catch(() => null);
  const registered = await TaskManager.isTaskRegisteredAsync(COACH_TASK).catch(() => false);
  const bgOk = bgStatus === BackgroundTask.BackgroundTaskStatus.Available && registered;
  add({
    id: 'background_task',
    group: 'התראות ורקע',
    title: 'בדיקה תקופתית של המאמן',
    status: bgOk ? 'ok' : 'error',
    detail: bgOk ? 'פעילה, בערך כל 15 דקות' : 'לא רשומה או חסומה במכשיר',
    actions: bgOk ? undefined : [{ key: 'start_coach', label: 'הפעל' }],
  });

  const fg = await Location.getForegroundPermissionsAsync().catch(() => null);
  const bg = await Location.getBackgroundPermissionsAsync().catch(() => null);
  const places = await loadPlaces();
  const placeCount = Object.keys(places).length;
  add({
    id: 'location',
    group: 'התראות ורקע',
    title: 'מיקום ומקומות',
    status: bg?.granted && placeCount > 0 ? 'ok' : fg?.granted ? 'warn' : 'warn',
    detail: !fg?.granted
      ? 'אין הרשאת מיקום. המאמן לא יזהה בית, משרד וחדר כושר.'
      : !bg?.granted
        ? 'צריך "אפשר כל הזמן" כדי לזהות הגעה ויציאה'
        : placeCount === 0
          ? 'לא הוגדרו מקומות'
          : `${placeCount} מתוך 3 מקומות מוגדרים`,
    actions: bg?.granted && placeCount > 0 ? undefined : bg?.granted ? [{ key: 'go_coach', label: 'הגדר מקומות' }] : [{ key: 'request_location', label: 'אפשר מיקום' }],
  });

  const batteryConfirmed = (await AsyncStorage.getItem(BATTERY_KEY).catch(() => null)) === '1';
  add({
    id: 'battery',
    group: 'התראות ורקע',
    title: 'חיסכון סוללה',
    status: batteryConfirmed ? 'ok' : 'manual',
    detail: batteryConfirmed ? 'סומן כמוגדר' : `אנדרואיד לא מאפשר לבדוק את זה אוטומטית. ${manufacturerHint()}`,
    actions: batteryConfirmed ? undefined : [{ key: 'battery', label: 'פתח הגדרה' }, { key: 'confirm_battery', label: 'עשיתי' }],
  });

  const profile = await loadProfile();
  add({
    id: 'profile',
    group: 'פרופיל',
    title: 'שאלון ותוכנית',
    status: profile.completed ? 'ok' : 'error',
    detail: profile.completed ? 'הושלם' : 'עוד לא מולא',
    actions: profile.completed ? undefined : [{ key: 'edit_profile', label: 'מלא' }],
  });

  const result: Readiness = {
    at: Date.now(),
    items,
    errors: items.filter((i) => i.status === 'error').length,
    warnings: items.filter((i) => i.status === 'warn' || i.status === 'manual').length,
  };
  await AsyncStorage.setItem(LAST_KEY, JSON.stringify(result)).catch(() => undefined);
  return result;
}

export async function loadLastReadiness(): Promise<Readiness | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function confirmBattery() {
  await AsyncStorage.setItem(BATTERY_KEY, '1');
}

export const APP_PACKAGE = 'com.gizhak.coach';
export const HC_PACKAGE = 'com.google.android.apps.healthdata';
export { IntentLauncher };
