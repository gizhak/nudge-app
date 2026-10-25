// The eating day ends when he goes to sleep, not at midnight. A pizza at 3:00 after a party
// belongs to the party's day. Live, before the watch's sleep arrives, it is a guess from his
// usual wake time; in the morning, when the night's sleep comes in, the day is set by when he
// really woke up, and the totals correct themselves.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readRecords } from 'react-native-health-connect';

const HOUR = 3600000;
/** A sleep this long or longer is the night, not a nap */
const MAIN_SLEEP = 3 * HOUR;

export interface SleepSpan {
  start: number;
  end: number;
}

/**
 * Pure: when the current eating day began.
 * The last real sleep that ended in the last 20 hours decides (he woke up then); without one,
 * an hour before his usual wake time, today's if it already passed, else yesterday's.
 */
export function eatingDayStart(now: number, wakeMin: number, sleeps: SleepSpan[]): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const guessToday = d.getTime() + (wakeMin - 60) * 60000;
  const guess = now >= guessToday ? guessToday : guessToday - 24 * HOUR;
  const woke = sleeps
    .filter((s) => s.end - s.start >= MAIN_SLEEP && s.end <= now && now - s.end <= 20 * HOUR)
    .map((s) => s.end)
    .sort((a, b) => b - a)[0];
  // A wake-up long before the guess belongs to the day before it: the guess wins then
  if (woke !== undefined && woke >= guess - 4 * HOUR) return woke;
  return guess;
}

let cache: { at: number; start: number } | null = null;

/** When today's eating began, from the watch's sleep and his wake time. Cached for a few minutes. */
export async function currentEatingDayStart(now = Date.now()): Promise<number> {
  if (cache && now - cache.at < 5 * 60000 && cache.start <= now) return cache.start;
  let wakeMin = 6 * 60 + 30;
  try {
    const p = JSON.parse((await AsyncStorage.getItem('coach.prefs.v1')) ?? '{}');
    if (typeof p.wakeTime === 'number') wakeMin = p.wakeTime;
  } catch {
    // default wake time
  }
  let sleeps: SleepSpan[] = [];
  try {
    const { records }: any = await readRecords('SleepSession', {
      timeRangeFilter: { operator: 'between', startTime: new Date(now - 30 * HOUR).toISOString(), endTime: new Date(now).toISOString() },
    });
    sleeps = (records ?? []).map((r: any) => ({ start: new Date(r.startTime).getTime(), end: new Date(r.endTime).getTime() }));
  } catch {
    // no sleep data: the wake time guess
  }
  const start = eatingDayStart(now, wakeMin, sleeps);
  cache = { at: now, start };
  return start;
}
