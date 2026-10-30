import { workoutsOnly } from './isWorkout';
import { insertRecords, readRecords } from 'react-native-health-connect';
import { sleepMinutesInWindow } from './today';
import { dedupeNutrition, mealId, mealKey } from './meals';
import { withoutHidden } from './hiddenMeals';
import { merge, onePerDay } from '../report/weightWhy';
import { currentEatingDayStart, eatingDayStart, SleepSpan } from './eatingDay';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadManual, morningKey } from '../sleep/manual';

const readNutrition = async (start: Date, end: Date): Promise<any[]> => {
  const { records }: any = await readRecords('Nutrition', range(start, end));
  // Hidden first: every copy of a hidden meal goes, whichever copy the dedupe would keep
  return dedupeNutrition(await withoutHidden(records ?? []));
};

const DAY = 24 * 3600 * 1000;

const range = (start: Date, end: Date) => ({
  timeRangeFilter: { operator: 'between' as const, startTime: start.toISOString(), endTime: end.toISOString() },
});

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/** Midnight `n` calendar days after (or before) a midnight. Not n × 24 hours: a day with a clock
 *  change is 23 or 25 hours long, and counting hours lands on the wrong day. */
export const addDays = (d: Date | number, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export interface Meal {
  id: string;
  /** The meal across its copies, for hiding */
  key?: string;
  name: string;
  time: Date;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar?: number;
}

export async function readMeals(day = new Date()): Promise<Meal[]> {
  // Today is the eating day (from waking up), so food after midnight before sleep stays with yesterday
  const now = Date.now();
  const isToday = startOfDay(day).getTime() === startOfDay(new Date(now)).getTime();
  const start = isToday ? new Date(await currentEatingDayStart(now)) : startOfDay(day);
  const end = isToday ? new Date(now) : new Date(start.getTime() + DAY);
  const records = await readNutrition(start, end);
  return records
    .map((r: any) => ({
      id: mealId(r),
      key: mealKey(r),
      name: r.name || 'ארוחה',
      time: new Date(r.startTime),
      kcal: r.energy?.inKilocalories ?? 0,
      protein: r.protein?.inGrams ?? 0,
      carbs: r.totalCarbohydrate?.inGrams ?? 0,
      fat: r.totalFat?.inGrams ?? 0,
      sugar: r.sugar?.inGrams,
    }))
    .sort((a: Meal, b: Meal) => a.time.getTime() - b.time.getTime());
}

/** Every food item of the last `days` days, oldest first. */
export async function readMealsSince(days: number, now = new Date()): Promise<Meal[]> {
  const records = await readNutrition(new Date(now.getTime() - days * DAY), now);
  return records
    .map((r: any) => ({
      id: mealId(r),
      key: mealKey(r),
      name: r.name || 'ארוחה',
      time: new Date(r.startTime),
      kcal: r.energy?.inKilocalories ?? 0,
      protein: r.protein?.inGrams ?? 0,
      carbs: r.totalCarbohydrate?.inGrams ?? 0,
      fat: r.totalFat?.inGrams ?? 0,
      sugar: r.sugar?.inGrams,
    }))
    .sort((a: Meal, b: Meal) => a.time.getTime() - b.time.getTime());
}

/** Protein per day for the last `days` days, oldest first. */
export async function readProteinByDay(days = 7, now = new Date()) {
  const start = addDays(startOfDay(now), -(days - 1));
  const records = await readNutrition(start, now);
  const out = Array.from({ length: days }, (_, i) => ({ date: addDays(start, i), protein: 0 }));
  for (const r of records) {
    const idx = Math.round((startOfDay(new Date(r.startTime)).getTime() - start.getTime()) / DAY);
    if (idx >= 0 && idx < days) out[idx].protein += r.protein?.inGrams ?? 0;
  }
  return out;
}

/**
 * One weigh-in a day for the trend: the day's first (onePerDay), from the same scale as the latest weigh-in
 * (another scale shows another number), and of two readings minutes apart that disagree, the
 * one that fits the other days (the same cleaning as the weight explanation).
 */
export async function readWeights(days = 60, now = new Date()) {
  const { records }: any = await readRecords('Weight', range(new Date(now.getTime() - days * DAY), now));
  const points = merge(
    (records ?? []).map((r: any) => ({ time: new Date(r.time).getTime(), kg: r.weight?.inKilograms, source: r.metadata?.dataOrigin })).filter((p: any) => p.kg > 0),
    [],
  );
  const main = points.length ? points[points.length - 1].source : undefined;
  const same = points.filter((p) => p.source === main);
  const use = same.length >= 2 ? same : points;
  return onePerDay(use).map((p) => ({ date: new Date(p.time), kg: p.kg, source: p.source }));
}

export async function saveWeight(kg: number, at = new Date()) {
  await insertRecords([{ recordType: 'Weight', time: at.toISOString(), weight: { value: kg, unit: 'kilograms' } }]);
}

/** Workout sessions per week (Sunday start) for the last `weeks` weeks, oldest first. */
export async function readWorkoutsByWeek(weeks = 4, now = new Date()) {
  const thisWeek = startOfDay(now);
  thisWeek.setDate(thisWeek.getDate() - thisWeek.getDay());
  const start = new Date(thisWeek.getTime() - (weeks - 1) * 7 * DAY);
  const records = workoutsOnly(((await readRecords('ExerciseSession', range(start, now))) as any).records);
  const out = Array.from({ length: weeks }, (_, i) => ({ weekStart: new Date(start.getTime() + i * 7 * DAY), count: 0 }));
  for (const r of records) {
    const idx = Math.floor((new Date(r.startTime).getTime() - start.getTime()) / (7 * DAY));
    if (idx >= 0 && idx < weeks) out[idx].count += 1;
  }
  return out;
}

/** Days of the current week (Sunday start) that had at least one workout. */
export async function readWorkoutDaysThisWeek(now = new Date()): Promise<Set<number>> {
  const start = startOfDay(now);
  start.setDate(start.getDate() - start.getDay());
  const records = workoutsOnly(((await readRecords('ExerciseSession', range(start, now))) as any).records);
  return new Set(records.map((r: any) => new Date(r.startTime).getDay()));
}


/**
 * Calories per day the way the food screen counts them: the eating day runs from waking up
 * to the next waking up, so a late snack after midnight stays with its evening. Oldest first,
 * each day with its meals, so a total can be checked meal by meal.
 */
export async function readNutritionByEatingDay(days = 14, now = new Date()) {
  const first = addDays(startOfDay(now), -(days - 1));
  let wakeMin = 6 * 60 + 30;
  try {
    const p = JSON.parse((await AsyncStorage.getItem('coach.prefs.v1')) ?? '{}');
    if (typeof p.wakeTime === 'number') wakeMin = p.wakeTime;
  } catch {
    // default wake time
  }
  let sleeps: SleepSpan[] = [];
  try {
    const { records }: any = await readRecords('SleepSession', range(new Date(first.getTime() - DAY), now));
    sleeps = (records ?? []).map((r: any) => ({ start: new Date(r.startTime).getTime(), end: new Date(r.endTime).getTime() }));
  } catch {
    // no sleep: each day starts an hour before his usual wake time
  }
  // Where each day starts: that morning's wake-up
  const starts = Array.from({ length: days + 1 }, (_, i) => {
    const day = addDays(first, i).getTime();
    const noon = Math.min(day + 12 * 3600000, now.getTime());
    return eatingDayStart(noon, wakeMin, sleeps);
  });
  const records = await readNutrition(new Date(starts[0]!), now);
  return Array.from({ length: days }, (_, i) => {
    const from = starts[i]!;
    const to = i === days - 1 ? now.getTime() + 1 : starts[i + 1]!;
    const meals = records
      .filter((r: any) => {
        const t = new Date(r.startTime).getTime();
        return t >= from && t < to;
      })
      .map((r: any) => ({ name: r.name || 'ארוחה', time: new Date(r.startTime), kcal: r.energy?.inKilocalories ?? 0, protein: r.protein?.inGrams ?? 0 }))
      .sort((a: any, b: any) => a.time.getTime() - b.time.getTime());
    return {
      date: addDays(first, i),
      kcal: meals.reduce((a: number, m: any) => a + m.kcal, 0),
      protein: meals.reduce((a: number, m: any) => a + m.protein, 0),
      meals: meals.length,
      list: meals as { name: string; time: Date; kcal: number; protein: number }[],
    };
  });
}

/** Calories and protein per day for the last `days` days, oldest first: by eating day, everywhere in the app. */
export const readNutritionByDay = (days = 7, now = new Date()) => readNutritionByEatingDay(days, now);

/** Sleep per night for the last `nights` nights (night of day D = 18:00 on D-1 to 14:00 on D), oldest first. */
export async function readSleepByNight(nights = 7, now = new Date()) {
  const today = startOfDay(now);
  const first = addDays(today, -(nights - 1));
  const [{ records }, manual]: any = await Promise.all([readRecords('SleepSession', range(new Date(first.getTime() - 6 * 3600 * 1000), now)), loadManual()]);
  return Array.from({ length: nights }, (_, i) => {
    const day = addDays(first, i);
    const winStart = day.getTime() - 6 * 3600 * 1000;
    const winEnd = day.getTime() + 14 * 3600 * 1000;
    const inWindow = records.filter((r: any) => new Date(r.endTime).getTime() > winStart && new Date(r.startTime).getTime() < winEnd);
    if (inWindow.length) return { date: day, minutes: sleepMinutesInWindow(inWindow, winStart, winEnd) as number | null, manual: false };
    // The watch missed the night: what he entered by hand, if anything
    const m = manual[morningKey(day.getTime())];
    return { date: day, minutes: (m ? m.minutes : null) as number | null, manual: !!m };
  });
}
