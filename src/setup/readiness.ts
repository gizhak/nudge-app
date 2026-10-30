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

import { t as tr } from '../i18n';
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
  if (/xiaomi|redmi|poco/.test(brand)) return tr('בשיאומי: הגדרות, אפליקציות, Coach: הפעל "הפעלה אוטומטית" ובחר "ללא הגבלות" בחיסכון סוללה.', 'On Xiaomi: Settings, Apps, Coach: turn on "Autostart" and choose "No restrictions" in battery saver.');
  if (/huawei|honor/.test(brand)) return tr('בהואווי: הגדרות, סוללה, הפעלת אפליקציות: Coach בניהול ידני, עם כל שלוש האפשרויות פעילות.', 'On Huawei: Settings, Battery, App launch: Coach on manual, with all three options on.');
  if (/oppo|realme|oneplus/.test(brand)) return tr('הגדרות, סוללה, Coach: אפשר פעילות ברקע והפעלה אוטומטית.', 'Settings, Battery, Coach: allow background activity and autostart.');
  if (/samsung/.test(brand)) return tr('בסמסונג: הגדרות, סוללה, מגבלות שימוש ברקע: ודא ש Coach לא ברשימת האפליקציות הרדומות.', 'On Samsung: Settings, Battery, Background usage limits: make sure Coach is not in the sleeping apps list.');
  if (/vivo/.test(brand)) return tr('בויוו: הגדרות, סוללה, צריכת חשמל ברקע: אפשר עבור Coach.', 'On vivo: Settings, Battery, Background power consumption: allow for Coach.');
  return tr('הגדרות, אפליקציות, Coach, סוללה: בחר "ללא הגבלות".', 'Settings, Apps, Coach, Battery: choose "Unrestricted".');
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
    title: tr('Health Connect מותקן', 'Health Connect installed'),
    status: hcReady ? 'ok' : 'error',
    detail: hcReady ? tr('זמין', 'Available') : tr('לא מותקן או דורש עדכון. בלעדיו האפליקציה לא מקבלת נתונים.', 'Not installed or needs an update. Without it the app gets no data.'),
    actions: hcReady ? undefined : [{ key: 'install_hc', label: tr('התקן או עדכן', 'Install or update') }],
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
      title: tr('הרשאות קריאה', 'Read permissions'),
      status: missingCritical.length ? 'error' : missingOptional.length ? 'warn' : 'ok',
      detail: missingCritical.length || missingOptional.length ? tr(`חסרות: ${[...missingCritical, ...missingOptional].join(', ')}`, `Missing: ${[...missingCritical, ...missingOptional].join(', ')}`) : tr('כל ההרשאות ניתנו', 'All permissions granted'),
      actions: missingCritical.length || missingOptional.length ? [{ key: 'request_hc', label: tr('אשר הרשאות', 'Approve permissions') }, { key: 'open_hc', label: tr('הגדרות', 'Settings') }] : undefined,
    });
    add({
      id: 'hc_background',
      group: 'Health Connect',
      title: tr('קריאה ברקע', 'Background reading'),
      status: background ? 'ok' : 'warn',
      detail: background ? tr('המאמן יכול לבדוק נתונים כשהאפליקציה סגורה', 'The coach can check data while the app is closed') : tr('בלעדיה המאמן לא יראה ארוחות ושינה כשהאפליקציה סגורה', 'Without it the coach will not see meals and sleep while the app is closed'),
      actions: background ? undefined : [{ key: 'request_hc', label: tr('אשר', 'Approve') }],
    });
    add({
      id: 'hc_write_weight',
      group: 'Health Connect',
      title: tr('שמירת משקל', 'Saving weight'),
      status: granted.has('write:Weight') ? 'ok' : 'warn',
      detail: granted.has('write:Weight') ? tr('משקל שמוזן באפליקציה נשמר', 'Weight entered in the app is saved') : tr('בלי ההרשאה לא ניתן לשמור משקל', 'Without the permission weight cannot be saved'),
      actions: granted.has('write:Weight') ? undefined : [{ key: 'request_hc', label: tr('אשר', 'Approve') }],
    });
    add({
      id: 'hc_write_water',
      group: 'Health Connect',
      title: tr('שמירת מים', 'Saving water'),
      status: granted.has('write:Hydration') ? 'ok' : 'warn',
      detail: granted.has('write:Hydration') ? tr('כוסות מים שנרשמות באפליקציה נשמרות', 'Cups of water logged in the app are saved') : tr('בלי ההרשאה לא ניתן לרשום מים', 'Without the permission water cannot be logged'),
      actions: granted.has('write:Hydration') ? undefined : [{ key: 'request_hc', label: tr('אשר', 'Approve') }],
    });
  }

  // Data actually arriving, per type
  if (hcReady) {
    const types = [
      { type: 'Steps', title: tr('צעדים', 'Steps'), fresh: 2, watch: true },
      { type: 'SleepSession', title: tr('שינה', 'Sleep'), fresh: 2, watch: true },
      { type: 'HeartRate', title: tr('דופק', 'Heart rate'), fresh: 2, watch: true },
      { type: 'ExerciseSession', title: tr('אימונים', 'Workouts'), fresh: 14, watch: true },
      { type: 'Nutrition', title: tr('תזונה', 'Nutrition'), fresh: 2, watch: false },
      { type: 'Weight', title: tr('משקל', 'Weight'), fresh: 14, watch: false },
    ] as const;
    for (const t of types) {
      const canRead = granted.has(`read:${t.type}`);
      const hit = canRead ? await latest(t.type, 30).catch(() => null) : null;
      const age = hit ? daysAgo(hit.when) : null;
      const status: CheckStatus = !canRead ? 'error' : hit === null ? (t.watch && t.type !== 'ExerciseSession' ? 'error' : 'warn') : age! > t.fresh ? 'warn' : 'ok';
      const detail = !canRead
        ? tr('אין הרשאת קריאה', 'No read permission')
        : hit === null
          ? t.type === 'Nutrition'
            ? tr('עוד לא נרשמו ארוחות ב30 יום.', 'No meals logged in 30 days yet.')
            : t.type === 'Weight'
              ? tr('עוד אין שקילות. מזינים במסך ההתקדמות.', 'No weigh-ins yet. Enter them on the Progress screen.')
              : t.type === 'ExerciseSession'
                ? tr('אין אימונים רשומים ב30 יום', 'No workouts logged in 30 days')
                : tr('לא מגיעים נתונים. בדוק שאפליקציית השעון מורשית לכתוב ל Health Connect.', 'No data is coming in. Check that the watch app is allowed to write to Health Connect.')
          : tr(`${hit.sources} · ${age === 0 ? 'היום' : `לפני ${age} ימים`}`, `${hit.sources} · ${age === 0 ? 'today' : `${age} days ago`}`);
      add({
        id: `data_${t.type}`,
        group: tr('נתונים שמגיעים', 'Data coming in'),
        title: t.title,
        status,
        detail,
        actions:
          status === 'ok'
            ? undefined
            : !canRead
              ? [{ key: 'request_hc', label: tr('אשר הרשאה', 'Approve permission') }]
              : t.type === 'Nutrition'
              ? [{ key: 'open_zepp', label: tr('פתח Zepp', 'Open Zepp') }]
              : t.watch
                ? [{ key: 'open_hc_data', label: tr('הרשאות מקורות', 'Source permissions') }]
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
    add({ id: 'apps_watch', group: tr('אפליקציות', 'Apps'), title: tr('שעון', 'Watch'), status: 'ok', detail: tr('אין שעון: צעדים מהטלפון, בלי שינה ודופק.', 'No watch: steps from the phone, no sleep and heart rate.') });
  } else {
    const ok = want ? installed.some((a) => a.pkg === want.pkg) : watchApps.length > 0;
    add({
      id: 'apps_watch',
      group: tr('אפליקציות', 'Apps'),
      title: want ? tr(`אפליקציית השעון (${want.name})`, `Watch app (${want.name})`) : tr('אפליקציית שעון', 'Watch app'),
      status: ok ? 'ok' : 'error',
      detail: ok ? (want ? tr(`${want.name} מותקנת.`, `${want.name} is installed.`) : watchApps.map((a) => a.name).join(', ')) : tr('לא מותקנת. האשף יגיד מה להתקין ואיך לחבר.', 'Not installed. The wizard will tell you what to install and how to connect it.'),
      actions: ok ? undefined : [{ key: 'open_wizard', label: tr('אשף החיבורים', 'Connection wizard') }],
    });
  }
  const food = foodApp(prof.foodApp);
  if (prof.foodApp !== 'other' && food) {
    const has = installed.some((a) => a.pkg === food.pkg) || (await isInstalled(food.pkg));
    add({
      id: 'apps_food',
      group: tr('אפליקציות', 'Apps'),
      title: tr(`רישום ארוחות (${food.name})`, `Meal logging (${food.name})`),
      status: has ? 'ok' : 'warn',
      detail: has ? tr(`מותקן. ודא שב ${food.name} מופעל חיבור ל Health Connect.`, `Installed. Make sure the Health Connect connection is on in ${food.name}.`) : tr('לא מותקן. בלי אפליקציית אוכל אין תזונה.', 'Not installed. Without a food app there is no nutrition.'),
      actions: has ? undefined : [{ key: 'open_wizard', label: tr('אשף החיבורים', 'Connection wizard') }],
    });
  }

  // Notifications and background work
  const notif = await Notifications.getPermissionsAsync().catch(() => null);
  add({
    id: 'notifications',
    group: tr('התראות ורקע', 'Notifications and background'),
    title: tr('התראות', 'Notifications'),
    status: notif?.granted ? 'ok' : 'error',
    detail: notif?.granted ? tr('מאושרות', 'Allowed') : tr('חסומות. המאמן לא יוכל לשלוח הודעות.', 'Blocked. The coach will not be able to send messages.'),
    actions: notif?.granted ? undefined : [{ key: 'request_notifications', label: tr('אפשר', 'Allow') }],
  });

  const bgStatus = await BackgroundTask.getStatusAsync().catch(() => null);
  const registered = await TaskManager.isTaskRegisteredAsync(COACH_TASK).catch(() => false);
  const bgOk = bgStatus === BackgroundTask.BackgroundTaskStatus.Available && registered;
  add({
    id: 'background_task',
    group: tr('התראות ורקע', 'Notifications and background'),
    title: tr('בדיקה תקופתית של המאמן', 'Coach periodic check'),
    status: bgOk ? 'ok' : 'error',
    detail: bgOk ? tr('פעילה, בערך כל 15 דקות', 'Active, about every 15 minutes') : tr('לא רשומה או חסומה במכשיר', 'Not registered or blocked on the device'),
    actions: bgOk ? undefined : [{ key: 'start_coach', label: tr('הפעל', 'Turn on') }],
  });

  const fg = await Location.getForegroundPermissionsAsync().catch(() => null);
  const bg = await Location.getBackgroundPermissionsAsync().catch(() => null);
  const places = await loadPlaces();
  const placeCount = Object.keys(places).length;
  add({
    id: 'location',
    group: tr('התראות ורקע', 'Notifications and background'),
    title: tr('מיקום ומקומות', 'Location and places'),
    status: bg?.granted && placeCount > 0 ? 'ok' : fg?.granted ? 'warn' : 'warn',
    detail: !fg?.granted
      ? tr('אין הרשאת מיקום. המאמן לא יזהה בית, משרד וחדר כושר.', 'No location permission. The coach will not recognize home, office and gym.')
      : !bg?.granted
        ? tr('צריך "אפשר כל הזמן" כדי לזהות הגעה ויציאה', '"Allow all the time" is needed to notice arriving and leaving')
        : placeCount === 0
          ? tr('לא הוגדרו מקומות', 'No places set')
          : tr(`${placeCount} מתוך 3 מקומות מוגדרים`, `${placeCount} of 3 places set`),
    actions: bg?.granted && placeCount > 0 ? undefined : bg?.granted ? [{ key: 'go_coach', label: tr('הגדר מקומות', 'Set places') }] : [{ key: 'request_location', label: tr('אפשר מיקום', 'Allow location') }],
  });

  const batteryConfirmed = (await AsyncStorage.getItem(BATTERY_KEY).catch(() => null)) === '1';
  add({
    id: 'battery',
    group: tr('התראות ורקע', 'Notifications and background'),
    title: tr('חיסכון סוללה', 'Battery saver'),
    status: batteryConfirmed ? 'ok' : 'manual',
    detail: batteryConfirmed ? tr('סומן כמוגדר', 'Marked as set') : tr(`אנדרואיד לא מאפשר לבדוק את זה אוטומטית. ${manufacturerHint()}`, `Android does not let us check this automatically. ${manufacturerHint()}`),
    actions: batteryConfirmed ? undefined : [{ key: 'battery', label: tr('פתח הגדרה', 'Open setting') }, { key: 'confirm_battery', label: tr('עשיתי', 'Done it') }],
  });

  const profile = await loadProfile();
  add({
    id: 'profile',
    group: tr('פרופיל', 'Profile'),
    title: tr('שאלון ותוכנית', 'Questions and plan'),
    status: profile.completed ? 'ok' : 'error',
    detail: profile.completed ? tr('הושלם', 'Completed') : tr('עוד לא מולא', 'Not filled in yet'),
    actions: profile.completed ? undefined : [{ key: 'edit_profile', label: tr('מלא', 'Fill in') }],
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
