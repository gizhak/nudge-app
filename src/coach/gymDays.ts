// A day counts as a gym day only after he has been there a while: a walk past the gym, or its
// Wi-Fi caught from outside, made whole weeks of "you trained". Every arrival and leave is logged,
// with how it was noticed, for the diagnostics screen.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlaceState } from './store';

/** Minutes at the gym before the day counts as a workout */
export const GYM_MIN = 30;
const LOG_KEY = 'coach.gymLog.v1';
const RESET_KEY = 'coach.gymDays.reset.v1';
const MIN = 60000;

export interface GymEntry {
  at: number;
  kind: 'enter' | 'exit' | 'counted';
  via?: string;
  minutes?: number;
}

const dayOf = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export async function loadGymLog(): Promise<GymEntry[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(LOG_KEY)) ?? '[]');
  } catch {
    return [];
  }
}

export async function logGym(e: GymEntry): Promise<void> {
  const list = await loadGymLog();
  await AsyncStorage.setItem(LOG_KEY, JSON.stringify([...list, e].slice(-30))).catch(() => undefined);
}

/** Adds the day of the visit, once */
function addDay(state: PlaceState, at: number): boolean {
  const d = dayOf(at);
  if ((state.gymDays ?? []).includes(d)) return false;
  state.gymDays = [...new Set([...(state.gymDays ?? []), d])].slice(-30);
  return true;
}

/**
 * Still at the gym long enough: the day counts. Only for a visit that started in the last few
 * hours, so an arrival whose leave was missed does not count day after day.
 */
export async function countLongVisit(state: PlaceState, now: number): Promise<boolean> {
  if (state.place !== 'gym' || !state.since) return false;
  const stayed = now - state.since;
  if (stayed < GYM_MIN * MIN || stayed > 5 * 3600 * 1000) return false;
  if (!addDay(state, state.since)) return false;
  await logGym({ at: now, kind: 'counted', minutes: Math.round(stayed / MIN) });
  return true;
}

/** Leaving the gym: the day counts if he stayed long enough */
export async function countOnExit(state: PlaceState, now: number, via?: string): Promise<void> {
  const minutes = state.since ? Math.round((now - state.since) / MIN) : 0;
  await logGym({ at: now, kind: 'exit', via, minutes });
  if (minutes >= GYM_MIN && minutes <= 5 * 60) addDay(state, state.since);
}

/** Once: the days counted under the old rule (any arrival at all) are dropped */
export async function resetOldGymDays(state: PlaceState): Promise<boolean> {
  if (await AsyncStorage.getItem(RESET_KEY).catch(() => '1')) return false;
  await AsyncStorage.setItem(RESET_KEY, '1').catch(() => undefined);
  state.gymDays = [];
  return true;
}
