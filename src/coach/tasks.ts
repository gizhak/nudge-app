import AsyncStorage from '@react-native-async-storage/async-storage';
// Background entry points. Imported from index.ts so the tasks are defined before the app starts,
// including when Android launches the JS runtime headless for a background event.
import * as BackgroundTask from 'expo-background-task';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { configureNightGuard } from '../../modules/night-guard';
import { AppRegistry } from 'react-native';
import { runCoach } from './engine';
import { carPlaceEvents, placeCheck } from './car';
import { acceptGuess, clearWifiLost, learnConnected, loadWifiLost, rejectGuess, wifiAt, wifiCheck, wifiPlaceNow } from './wifi';
import { loadAndApply } from '../profile/bootstrap';
import { ackTopic, didIt } from './followupStore';
import { loadPendingExits, savePendingExits } from './store';
import { ackNight, loadPlaces, loadPlaceState, loadPrefs, markAteUnlogged, markWorkoutDone, PlaceId, snoozeTopic, snoozeToday, SNOOZE_MS } from './store';
import { initialize } from 'react-native-health-connect';
import { addWater } from '../health/water';
import { expectsBrokenNights, interruptLabels, loadProfile } from '../profile/profile';
import { setNightButtons } from '../notifications/schedule';

export const GEOFENCE_TASK = 'coach-geofence';
export const COACH_TASK = 'coach-periodic';
export const RESPONSE_TASK = 'coach-notification-response';

/** Handles the buttons on a coach notification ("I know, it's fine", "the baby woke me"). */
export async function handleNotificationAction(actionIdentifier: string | undefined, data?: Record<string, unknown>, notificationId?: string) {
  const topic = typeof data?.topic === 'string' ? data.topic : undefined;
  // Android does not remove a notification when one of its buttons is pressed; without this
  // "got it" looks like it did nothing
  if (notificationId && actionIdentifier && actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
    await Notifications.dismissNotificationAsync(notificationId).catch(() => undefined);
  }
  if (actionIdentifier === 'ack' || actionIdentifier === 'baby') return ackNight(actionIdentifier === 'baby');
  // "Going to sleep" quiets the night the same way "I know"
  if (actionIdentifier === 'sleeping') return ackNight(false);
  if (actionIdentifier === 'gym_yes' || actionIdentifier === 'gym_no') {
    if (actionIdentifier === 'gym_yes') await acceptGuess().catch(() => false);
    else await rejectGuess().catch(() => undefined);
    return ackTopic('wifi_guess', new Date(), 24 * 3600 * 1000);
  }
  if (actionIdentifier === 'trained') {
    await markWorkoutDone();
    await didIt(['workout']);
    return Promise.all(['workout_today', 'workout_now', 'missed_workout', 'outing_workout'].map((t) => snoozeToday(t)));
  }
  const ate = topic?.match(/^meal_reminder_(\w+)$/);
  if (actionIdentifier === 'ate' && ate) {
    await markAteUnlogged([ate[1]]);
    await didIt([topic!, 'food']);
    return snoozeToday(topic!);
  }
  const drank = actionIdentifier?.match(/^drank(?:_(\d+))?$/);
  if (drank) {
    await initialize().catch(() => false);
    await addWater(drank[1] ? Number(drank[1]) : 250).catch(() => undefined);
    await didIt(['water']);
    return snoozeTopic('water', 2 * 3600 * 1000);
  }
  // "Got it", or a tap on the message itself: he saw it. Something the data can check
  // comes back later if still not done; anything else goes quiet for a while.
  if (topic && (actionIdentifier === 'snooze' || actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER)) {
    await loadAndApply().catch(() => undefined);
    return ackTopic(topic, new Date(), topic === 'go_to_sleep' ? 60 * 60 * 1000 : SNOOZE_MS);
  }
}

// Android runs this for action taps while the app is in the background or closed
TaskManager.defineTask(RESPONSE_TASK, async ({ data }) => {
  try {
    const d = data as any;
    if (d && 'actionIdentifier' in d) await handleNotificationAction(d.actionIdentifier, d.notification?.request?.content?.data, d.notification?.request?.identifier);
  } catch {
    // never crash a background task
  }
});

const PLACE_IDS: PlaceId[] = ['home', 'office', 'gym'];
const MIN_RADIUS: Record<PlaceId, number> = { home: 150, office: 400, gym: 150 };

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { eventType, region } = data as { eventType: Location.GeofencingEventType; region: Location.LocationRegion };
  const place = region?.identifier as PlaceId | undefined;
  if (!place || !PLACE_IDS.includes(place)) return;
  const type = eventType === Location.GeofencingEventType.Enter ? 'enter' : 'exit';
  try {
    const pending = await loadPendingExits();
    if (type === 'exit') {
      // Not yet: a leave counts only once confirmed (still away in a few minutes, or the car)
      pending[place] = Date.now();
      await savePendingExits(pending);
      return;
    }
    if (pending[place]) {
      // Back inside before the leave was confirmed: it was location drift, nothing happened
      delete pending[place];
      await savePendingExits(pending);
      return;
    }
    await runCoach({ type, place, via: 'מיקום' });
  } catch {
    // Never let a background failure crash the task
  }
});

const CONFIRM_MS = 8 * 60 * 1000;

/**
 * Turns held leaves into real ones: when the car connects, or when a few minutes later
 * the phone is really somewhere else. A leave the phone is back from is dropped.
 */
export async function confirmExits(now = Date.now(), carLeft = false): Promise<void> {
  const pending = await loadPendingExits();
  const places = Object.keys(pending) as PlaceId[];
  if (!places.length) return;
  const ready = places.filter((p) => carLeft || now - (pending[p] ?? now) >= CONFIRM_MS);
  if (!ready.length) return;
  // Still on the place's Wi-Fi means still there, whatever the location says
  const lost = await loadWifiLost();
  for (const p of ready) {
    const onIt = carLeft ? 'unknown' : await wifiAt(p).catch(() => 'unknown' as const);
    if (onIt === 'here') {
      delete pending[p];
      continue;
    }
    // The same strict test as the stay check (the loose arrival circle let a walk near home cancel the leave),
    // tighter still when the place's Wi-Fi is gone
    const wifiGone = lost?.place === p || onIt === 'gone';
    const fix = carLeft ? { ok: true, place: null as PlaceId | null } : await placeCheck(p, wifiGone);
    if (!fix.ok) {
      // No usable location: the Wi-Fi gone for a quarter of an hour is enough
      if (!(wifiGone && now - (lost?.place === p ? lost.at : pending[p] ?? now) >= 15 * 60000)) continue;
    } else if (fix.place === p) {
      delete pending[p];
      continue;
    }
    delete pending[p];
    await noteCheck({ at: now, place: p, result: fix.place ? 'moved' : 'left', how: wifiGone ? 'ה Wi-Fi של המקום לא נמצא' : 'מיקום' });
    await runCoach({ type: 'exit', place: p, via: wifiGone ? 'Wi-Fi' : 'מיקום' }).catch(() => undefined);
    if (fix.ok && fix.place) await runCoach({ type: 'enter', place: fix.place, via: 'מיקום' }).catch(() => undefined);
    if (wifiGone) await clearWifiLost();
  }
  await savePendingExits(pending);
}

/**
 * The car connected or disconnected: treat it as leaving or arriving where the phone is,
 * then a normal run, which sends whatever was held back during the drive.
 */
export async function runCarEvents(): Promise<void> {
  const events = await carPlaceEvents();
  // Getting into the car confirms any leave that was waiting
  if (events.some((e) => e.type === 'exit')) await confirmExits(Date.now(), true).catch(() => undefined);
  for (const e of events) {
    if (e.place) await runCoach({ type: e.type, place: e.place, via: 'רכב' }).catch(() => undefined);
  }
  if (events.length) await runCoach().catch(() => undefined);
}

// Started by the native unlock listener: the first unlocks of the morning, so the coach asks for the weigh-in and the water at once
AppRegistry.registerHeadlessTask('NudgeUnlock', () => async () => {
  try {
    const arrived = await wifiCheck().catch(() => null);
    if (arrived) await runCoach(arrived).catch(() => undefined);
    else await verifyPlace().catch(() => undefined);
    await runCoach(undefined, new Date(), { unlock: true });
  } catch {
    // never crash a background task
  }
});

// Started by the native Wi-Fi listener: a network came or went, so maybe he arrived or left
AppRegistry.registerHeadlessTask('NudgeWifi', () => async () => {
  try {
    const arrived = await wifiCheck();
    if (arrived) await runCoach(arrived);
    // A network came or went: a good moment to see whether he left where he was
    else await verifyPlace(Date.now(), 10 * 60000).catch(() => undefined);
    await confirmExits().catch(() => undefined);
  } catch {
    // never crash a background task
  }
});

// Started by the native Bluetooth listener the moment the car connects or disconnects
AppRegistry.registerHeadlessTask('NudgeCar', () => async () => {
  try {
    await runCarEvents();
  } catch {
    // never crash a background task
  }
});

/** The last check of where he is, for the diagnostics screen */
export interface PlaceCheckNote {
  at: number;
  place: PlaceId;
  result: 'stay' | 'left' | 'moved' | 'unknown';
  how: string;
}
async function noteCheck(n: PlaceCheckNote): Promise<void> {
  await AsyncStorage.setItem('coach.placeCheck.v1', JSON.stringify(n)).catch(() => undefined);
}
export async function loadPlaceCheck(): Promise<PlaceCheckNote | null> {
  try {
    return JSON.parse((await AsyncStorage.getItem('coach.placeCheck.v1')) ?? 'null');
  } catch {
    return null;
  }
}

/**
 * A leave the phone never reported (the geofence missed it, the car did not connect): when the
 * coach still thinks he is somewhere he has been for a while, a fresh fix and the Wi-Fi check it.
 * Not there any more means a leave now; another saved place means an arrival there.
 */
export async function verifyPlace(now = Date.now(), minStayMs = 20 * 60000): Promise<void> {
  const st = await loadPlaceState();
  if (!st.place) return;
  // The place's Wi-Fi gone: check now, however short the stay was (home for ten minutes, then out with the dog)
  // Gone: seen dropping (the Wi-Fi listener), or simply not connected to it now (the listener may never have run)
  const lost = await loadWifiLost();
  const onIt = await wifiAt(st.place).catch(() => 'unknown' as const);
  if (onIt === 'here') return now - st.since < minStayMs ? undefined : noteCheck({ at: now, place: st.place, result: 'stay', how: 'Wi-Fi' });
  const wifiGone = (lost?.place === st.place && lost.at >= st.since) || onIt === 'gone';
  if (!wifiGone && now - st.since < minStayMs) return;
  const wifi = await wifiPlaceNow().catch(() => null);
  const fix = wifi ? { ok: true, place: wifi as PlaceId | null } : await placeCheck(st.place, wifiGone);
  const how = wifi ? 'Wi-Fi' : wifiGone && 'meters' in fix && fix.meters != null ? `ה Wi-Fi לא נמצא, ${fix.meters} מ' מהמקום` : 'meters' in fix && fix.meters != null ? `מיקום, ${fix.meters} מ' מהמקום, דיוק ${fix.accuracy} מ'` : 'accuracy' in fix && fix.accuracy ? `מיקום לא מדויק (${Math.round(fix.accuracy)} מ')` : 'אין מיקום';
  if (!fix.ok || fix.place === st.place) {
    // Sure he is there (a long stay, a precise fix well inside): the network he is on becomes the place's own
    if (fix.ok && !wifiGone && now - st.since >= 20 * 60000 && 'accuracy' in fix && (fix.accuracy ?? 999) <= 30 && 'meters' in fix && (fix.meters ?? 999) <= 60)
      await learnConnected(st.place).catch(() => false);
    return noteCheck({ at: now, place: st.place, result: fix.ok ? 'stay' : 'unknown', how });
  }
  await noteCheck({ at: now, place: st.place, result: fix.place ? 'moved' : 'left', how });
  if (wifiGone) await clearWifiLost();
  // The leave is decided here: a held one for the same place must not fire again later
  const pending = await loadPendingExits();
  if (pending[st.place]) {
    delete pending[st.place];
    await savePendingExits(pending);
  }
  await runCoach({ type: 'exit', place: st.place, via: wifiGone ? 'Wi-Fi' : 'בדיקת מיקום' }).catch(() => undefined);
  if (fix.place) await runCoach({ type: 'enter', place: fix.place, via: wifi ? 'Wi-Fi' : 'מיקום' }).catch(() => undefined);
}

TaskManager.defineTask(COACH_TASK, async () => {
  try {
    await verifyPlace().catch(() => undefined);
    // Events the instant task missed are handled here, at most 15 minutes late
    await runCarEvents().catch(() => undefined);
    const arrived = await wifiCheck().catch(() => null);
    if (arrived) await runCoach(arrived).catch(() => undefined);
    await confirmExits().catch(() => undefined);
    await runCoach();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export interface CoachStatus {
  backgroundLocation: boolean;
  geofencing: boolean;
  periodic: boolean;
  places: number;
  nightGuard: boolean;
}

/** Starts (or restarts) geofencing for the saved places and the periodic check. */
export async function startCoach(): Promise<CoachStatus> {
  const places = await loadPlaces();
  const regions: Location.LocationRegion[] = PLACE_IDS.filter((id) => places[id]).map((id) => ({
    identifier: id,
    latitude: places[id]!.latitude,
    longitude: places[id]!.longitude,
    // Big enough that walking around the building does not count as leaving it
    radius: Math.max(places[id]!.radius, MIN_RADIUS[id]),
    notifyOnEnter: true,
    notifyOnExit: true,
  }));

  const bg = await Location.getBackgroundPermissionsAsync();
  let geofencing = false;
  if (bg.granted && regions.length) {
    await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
    geofencing = true;
  } else if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false)) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK);
  }

  let periodic = false;
  try {
    if (!(await TaskManager.isTaskRegisteredAsync(COACH_TASK))) {
      await BackgroundTask.registerTaskAsync(COACH_TASK, { minimumInterval: 15 });
    }
    periodic = true;
  } catch {
    periodic = false;
  }

  await Notifications.registerTaskAsync(RESPONSE_TASK).catch(() => undefined);

  const prefs = await loadPrefs();
  const profile = await loadProfile();
  const brokenLabel = expectsBrokenNights(profile) ? interruptLabels(profile.kids).button : null;
  await setNightButtons(brokenLabel, prefs.waterContainer);
  const nightGuard = configureNightGuard({
    enabled: prefs.enabled && prefs.nightGuard,
    bedTime: prefs.bedTime,
    wakeTime: prefs.wakeTime,
    windowMinutes: 300,
    interruptLabel: brokenLabel ?? '',
  });

  return { backgroundLocation: bg.granted, geofencing, periodic, places: regions.length, nightGuard };
}
