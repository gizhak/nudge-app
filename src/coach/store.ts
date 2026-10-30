import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SlotId } from '../nutrition/meals';
import type { Container } from '../nutrition/water';
import { graceEnd, OutingPlan } from './outing';
import type { Vacation } from './vacation';
import { EMPTY_OVERRIDES, setWeekOverrides, WeekOverrides, weekStartKey } from '../config/goals';

import { t } from '../i18n';
export type PlaceId = 'home' | 'office' | 'gym';
export type NagLevel = 'quiet' | 'normal' | 'close' | 'drill';

export interface Place {
  latitude: number;
  longitude: number;
  radius: number;
  /** Address or description shown to the user */
  label?: string;
}

export interface CoachPrefs {
  enabled: boolean;
  level: NagLevel;
  /** Minutes after midnight */
  quietStart: number;
  quietEnd: number;
  wakeTime: number;
  bedTime: number;
  tone: 'direct' | 'encouraging';
  /** Meals the user eats; the coach reminds about these when they are not logged */
  mealSlots: SlotId[];
  mealReminders: boolean;
  mealFeedback: boolean;
  waterReminders: boolean;
  /** Native service that notices unlocking the phone after bedtime */
  nightGuard: boolean;
  /** What he drinks from, in ml: 250 is a cup */
  waterContainer: Container;
  /** Messages when arriving at or leaving home, work and the gym */
  placeMessages?: boolean;
  /** A vacation, planned or under way */
  vacation?: Vacation | null;
}

export interface SentMessage {
  id: string;
  day: string;
  at: number;
  title: string;
  body: string;
  /** Other message ids this one stands for (several meals in one message) */
  also?: string[];
}

export interface PlaceState {
  place: PlaceId | null;
  since: number;
  /** Day key of the last gym visit */
  gymDay?: string;
  /** Start of day (ms) of recent gym visits, newest last */
  gymDays?: number[];
  /** How the current place was noticed: Wi-Fi, location, the car, or by hand */
  via?: string;
}

export const PLACE_NAMES: Record<PlaceId, string> = { home: t('בית', 'Home'), office: t('משרד', 'Office'), gym: t('חדר כושר', 'Gym') };

export const DEFAULT_PREFS: CoachPrefs = {
  enabled: true,
  level: 'normal',
  quietStart: 23 * 60 + 30,
  quietEnd: 6 * 60 + 30,
  wakeTime: 6 * 60 + 30,
  bedTime: 23 * 60 + 30,
  tone: 'direct',
  mealSlots: ['breakfast', 'lunch', 'dinner'],
  mealReminders: true,
  mealFeedback: true,
  waterReminders: true,
  nightGuard: true,
  waterContainer: 250,
  placeMessages: true,
};

const K = {
  places: 'coach.places.v1',
  prefs: 'coach.prefs.v1',
  log: 'coach.log.v1',
  state: 'coach.placeState.v1',
};

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? { ...(fallback as any), ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export const loadPlaces = () => read<Partial<Record<PlaceId, Place>>>(K.places, {});
export const savePlaces = (p: Partial<Record<PlaceId, Place>>) => AsyncStorage.setItem(K.places, JSON.stringify(p));

export const loadPrefs = () => read<CoachPrefs>(K.prefs, DEFAULT_PREFS);
export const savePrefs = (p: CoachPrefs) => AsyncStorage.setItem(K.prefs, JSON.stringify(p));

export const loadPlaceState = () => read<PlaceState>(K.state, { place: null, since: 0 });
export const savePlaceState = (s: PlaceState) => AsyncStorage.setItem(K.state, JSON.stringify(s));

export async function loadLog(): Promise<SentMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(K.log);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function appendLog(m: SentMessage) {
  const log = await loadLog();
  await AsyncStorage.setItem(K.log, JSON.stringify([m, ...log].slice(0, 60)));
}

const RUN_LOCK = 'coach.runLock.v1';

/**
 * The background task and opening the app can start the coach at the same moment;
 * both would read the log before either wrote, and send the same message twice.
 * Returns false when another run started in the last 45 seconds.
 */
export async function claimRun(now = Date.now(), force = false): Promise<boolean> {
  try {
    const held = Number(await AsyncStorage.getItem(RUN_LOCK)) || 0;
    if (!force && now - held < 45000 && held <= now) return false;
    await AsyncStorage.setItem(RUN_LOCK, String(now));
    return true;
  } catch {
    return true;
  }
}

export async function releaseRun() {
  await AsyncStorage.removeItem(RUN_LOCK).catch(() => undefined);
}

/** Ids already said today, including meals folded into a combined message. */
export const loggedIds = (log: SentMessage[]) => log.flatMap((l) => [l.id, ...(l.also ?? [])]);

export const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// ---------- Night state: "I know, it's fine" and nights woken by the baby ----------

/** The night a moment belongs to: before noon counts as the previous evening. */
export const nightKey = (d = new Date()) => {
  const x = new Date(d);
  if (x.getHours() < 12) x.setDate(x.getDate() - 1);
  return dayKey(x);
};

export interface NightState {
  /** Nights where he said "I know, it's fine" */
  acks: string[];
  babyNights: string[];
  /** Nights he said he was going out */
  outings?: string[];
  /** What was planned for each of those nights */
  outingPlans?: Record<string, OutingPlan>;
  /** Nights he answered "not going out" */
  notOut?: string[];
}

const NIGHT_KEY = 'coach.night.v2';
const uniqLast = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].slice(-30);

export async function loadNightState(): Promise<NightState> {
  const own = await read<NightState>(NIGHT_KEY, { acks: [], babyNights: [] });
  // The night notification buttons are handled natively; merge what they stored
  const { nightGuardState } = await import('../../modules/night-guard');
  const native = nightGuardState();
  return {
    acks: uniqLast([...own.acks, native.ack]),
    babyNights: uniqLast([...own.babyNights, ...native.babyNights]),
    outings: uniqLast(own.outings ?? []),
    outingPlans: own.outingPlans ?? {},
    notOut: uniqLast(own.notOut ?? []),
  };
}

/** Silences tonight's sleep nags. broken = the night was cut by the baby, kids or waking up. */
export async function ackNight(broken: boolean, night = nightKey()) {
  const baby = broken;
  const state = await loadNightState();
  const next: NightState = {
    acks: uniqLast([...state.acks, night]),
    babyNights: baby ? uniqLast([...state.babyNights, night]) : state.babyNights,
    outings: state.outings ?? [],
    outingPlans: state.outingPlans ?? {},
    notOut: state.notOut ?? [],
  };
  await AsyncStorage.setItem(NIGHT_KEY, JSON.stringify(next));
  const { ackNightNative } = await import('../../modules/night-guard');
  ackNightNative(night, baby);
}

/** "Going out tonight" with the plan, or null to cancel. Quiets sleep nags until after the return. */
export async function setOutingPlan(plan: OutingPlan | null, night = nightKey()) {
  const state = await loadNightState();
  const plans = { ...(state.outingPlans ?? {}) };
  if (plan) plans[night] = plan;
  else delete plans[night];
  const keep = Object.keys(plans).slice(-14);
  const outings = plan ? uniqLast([...(state.outings ?? []), night]) : (state.outings ?? []).filter((n) => n !== night);
  const notOut = (state.notOut ?? []).filter((n) => n !== night);
  await AsyncStorage.setItem(
    NIGHT_KEY,
    JSON.stringify({ ...state, outings, notOut, outingPlans: Object.fromEntries(keep.map((k) => [k, plans[k]])) }),
  );
  // The native night guard stays quiet until half an hour after the planned return
  const { setNightGrace } = await import('../../modules/night-guard');
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  if (new Date().getHours() < 12) base.setDate(base.getDate() - 1);
  setNightGrace(plan ? base.getTime() + graceEnd(plan) * 60000 : 0);
}

/** "Not going out tonight": stop asking until tomorrow. */
export async function declineOuting(night = nightKey()) {
  const state = await loadNightState();
  await AsyncStorage.setItem(NIGHT_KEY, JSON.stringify({ ...state, notOut: uniqLast([...(state.notOut ?? []), night]) }));
}

// ---------- "Got it": silence one topic for a while ----------

const SNOOZE_KEY = 'coach.snooze.v1';
export const SNOOZE_MS = 3 * 3600 * 1000;

export async function loadSnoozes(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(SNOOZE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Silences one topic (base message id, e.g. "water") until now + ms. */
export async function snoozeTopic(base: string, ms = SNOOZE_MS, now = Date.now()) {
  const all = await loadSnoozes();
  // drop expired entries while here
  const kept = Object.fromEntries(Object.entries(all).filter(([, until]) => until > now));
  kept[base] = now + ms;
  await AsyncStorage.setItem(SNOOZE_KEY, JSON.stringify(kept));
}

// ---------- This week's moved, shortened or skipped workouts ----------

const WEEK_KEY = 'coach.week.v1';

export async function loadWeekOverrides(now = new Date()): Promise<WeekOverrides> {
  try {
    const raw = await AsyncStorage.getItem(WEEK_KEY);
    const o: WeekOverrides | null = raw ? JSON.parse(raw) : null;
    return o && o.week === weekStartKey(now) ? o : EMPTY_OVERRIDES;
  } catch {
    return EMPTY_OVERRIDES;
  }
}

export async function saveWeekOverrides(o: WeekOverrides) {
  await AsyncStorage.setItem(WEEK_KEY, JSON.stringify(o));
  setWeekOverrides(o);
}

// ---------- "Got it" and "done" from the app ----------

/** "Got it" on a message in the app: that topic stays quiet until midnight. */
export async function snoozeToday(base: string, now = new Date()) {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  await snoozeTopic(base, midnight.getTime() - now.getTime(), now.getTime());
}

/** "I trained": counts today as a workout day even when the watch recorded nothing. */
export async function markWorkoutDone(now = new Date()) {
  const state = await loadPlaceState();
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  state.gymDay = dayKey(now);
  state.gymDays = [...new Set([...(state.gymDays ?? []), d.getTime()])].slice(-30);
  await savePlaceState(state);
}

const UNLOGGED_KEY = 'coach.unlogged.v1';

/** Meal slots he ate today without logging: no reminders, but no calories either. */
export async function loadUnlogged(now = new Date()): Promise<string[]> {
  try {
    const raw = JSON.parse((await AsyncStorage.getItem(UNLOGGED_KEY)) ?? '{}');
    return raw.day === dayKey(now) ? raw.slots ?? [] : [];
  } catch {
    return [];
  }
}

export async function markAteUnlogged(slots: string[], now = new Date()) {
  const cur = await loadUnlogged(now);
  await AsyncStorage.setItem(UNLOGGED_KEY, JSON.stringify({ day: dayKey(now), slots: [...new Set([...cur, ...slots])] }));
}

// ---------- Leaving a place, confirmed ----------

const PENDING_EXIT = 'coach.pendingExit.v1';

/**
 * Inside a building the location jumps around and the phone can "leave" a place it never
 * left. A leave is held here until it is confirmed: still away after a few minutes, or
 * the car connected.
 */
export async function loadPendingExits(): Promise<Partial<Record<PlaceId, number>>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(PENDING_EXIT)) ?? '{}');
  } catch {
    return {};
  }
}

export async function savePendingExits(p: Partial<Record<PlaceId, number>>) {
  await AsyncStorage.setItem(PENDING_EXIT, JSON.stringify(p));
}
