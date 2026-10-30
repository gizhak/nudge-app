import { workoutsOnly } from './isWorkout';
import { aggregateRecord, readRecords } from 'react-native-health-connect';
import { sourceLabel, sourceLabels } from '../config/sources';
import { dedupeNutrition } from './meals';
import { withoutHidden } from './hiddenMeals';
import { currentEatingDayStart } from './eatingDay';
import { loadManual, morningKey } from '../sleep/manual';

import { t } from '../i18n';
export type Quality = 'ok' | 'partial' | 'missing';

export interface QualityItem {
  label: string;
  quality: Quality;
  source: string;
  hint?: string;
}

export interface TodayData {
  steps: number;
  activeKcal: number;
  distanceKm: number;
  nutrition: { kcal: number; protein: number; carbs: number; fat: number; meals: number };
  sleepMinutes: number | null;
  weight: { kg: number; daysAgo: number; at: Date } | null;
  heartRate: { avg: number; min: number; max: number } | null;
  restingHr: number | null;
  workouts: { count: number; minutes: number };
  quality: QualityItem[];
}

type Interval = [number, number];

const DAY = 24 * 3600 * 1000;

const range = (start: Date, end: Date) => ({
  timeRangeFilter: {
    operator: 'between' as const,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  },
});

const origin = (r: any): string | undefined => r?.metadata?.dataOrigin;

async function attempt<T>(fn: () => Promise<T>, fallback: T): Promise<{ value: T; failed: boolean }> {
  try {
    return { value: await fn(), failed: false };
  } catch {
    return { value: fallback, failed: true };
  }
}

/** Union length of intervals, so overlapping or duplicate records are counted once. */
function mergedMinutes(intervals: Interval[]): number {
  const sorted = intervals.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: Interval | null = null;
  for (const [s, e] of sorted) {
    if (!cur || s > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [s, e];
    } else {
      cur[1] = Math.max(cur[1], e);
    }
  }
  if (cur) total += cur[1] - cur[0];
  return total / 60000;
}

// Health Connect sleep stages that count as sleep: SLEEPING, LIGHT, DEEP, REM
const ASLEEP_STAGES = new Set([2, 4, 5, 6]);

/** Minutes asleep in a window, counting overlapping records once and only asleep stages when present. */
export function sleepMinutesInWindow(records: any[], winStart: number, winEnd: number): number {
  const clip = (s: string, e: string): Interval => [
    Math.max(new Date(s).getTime(), winStart),
    Math.min(new Date(e).getTime(), winEnd),
  ];

  const stageIntervals: Interval[] = records.flatMap((r: any) =>
    (r.stages ?? []).filter((st: any) => ASLEEP_STAGES.has(st.stage)).map((st: any) => clip(st.startTime, st.endTime)),
  );
  return stageIntervals.length
    ? mergedMinutes(stageIntervals)
    : mergedMinutes(records.map((r: any) => clip(r.startTime, r.endTime)));
}

async function readSleep(dayStart: Date) {
  const winStart = dayStart.getTime() - 6 * 3600 * 1000; // 18:00 yesterday
  const winEnd = dayStart.getTime() + 14 * 3600 * 1000; // 14:00 today
  const { records }: any = await readRecords('SleepSession', range(new Date(winStart), new Date(winEnd)));
  const minutes = sleepMinutesInWindow(records, winStart, winEnd);
  if (!records.length) {
    // The watch missed the night: what he entered by hand
    const m = (await loadManual().catch(() => ({}) as Record<string, any>))[morningKey(dayStart.getTime())];
    if (m) return { minutes: m.minutes as number | null, sources: [t('הזנה ידנית', 'Entered by hand')] };
  }
  return { minutes: records.length ? minutes : null, sources: records.map(origin) };
}

export async function readToday(now = new Date()): Promise<TodayData> {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const today = range(dayStart, now);

  const [steps, active, distance, nutrition, weight, sleep, hr, resting, exercise] = await Promise.all([
    attempt(() => aggregateRecord({ recordType: 'Steps', ...today }) as Promise<any>, null),
    attempt(() => aggregateRecord({ recordType: 'ActiveCaloriesBurned', ...today }) as Promise<any>, null),
    attempt(() => aggregateRecord({ recordType: 'Distance', ...today }) as Promise<any>, null),
    attempt(async () => readRecords('Nutrition', range(new Date(await currentEatingDayStart(now.getTime())), now)) as Promise<any>, { records: [] }),
    attempt(() => readRecords('Weight', range(new Date(now.getTime() - 365 * DAY), now)) as Promise<any>, { records: [] }),
    attempt(() => readSleep(dayStart), { minutes: null, sources: [] as (string | undefined)[] }),
    attempt(() => readRecords('HeartRate', today) as Promise<any>, { records: [] }),
    attempt(() => readRecords('RestingHeartRate', range(new Date(now.getTime() - 2 * DAY), now)) as Promise<any>, { records: [] }),
    attempt(() => readRecords('ExerciseSession', today) as Promise<any>, { records: [] }),
  ]);

  // Nutrition
  const meals: any[] = dedupeNutrition(await withoutHidden(nutrition.value.records ?? []));
  const sum = (f: (r: any) => number | undefined) => meals.reduce((a, r) => a + (f(r) ?? 0), 0);
  const nut = {
    kcal: sum((r) => r.energy?.inKilocalories),
    protein: sum((r) => r.protein?.inGrams),
    carbs: sum((r) => r.totalCarbohydrate?.inGrams),
    fat: sum((r) => r.totalFat?.inGrams),
    meals: meals.length,
  };

  // Weight: latest record in the last year
  const weights: any[] = weight.value.records;
  const latestW = weights.length ? weights.reduce((a, b) => (a.time > b.time ? a : b)) : null;
  const weightVal = latestW
    ? {
        kg: latestW.weight.inKilograms,
        daysAgo: Math.floor((now.getTime() - new Date(latestW.time).getTime()) / DAY),
        at: new Date(latestW.time),
      }
    : null;

  // Heart rate
  const hrRecords: any[] = hr.value.records;
  const bpm: number[] = hrRecords.flatMap((r) => (r.samples ?? []).map((s: any) => s.beatsPerMinute));
  const hrVal = bpm.length
    ? { avg: Math.round(bpm.reduce((a, b) => a + b, 0) / bpm.length), min: Math.min(...bpm), max: Math.max(...bpm) }
    : null;
  const restingRecords: any[] = resting.value.records;
  const restingVal = restingRecords.length ? restingRecords[restingRecords.length - 1].beatsPerMinute : null;

  // Workouts
  const sessions: any[] = workoutsOnly(exercise.value.records);
  const workoutMinutes = mergedMinutes(
    sessions.map((r) => [new Date(r.startTime).getTime(), new Date(r.endTime).getTime()] as Interval),
  );

  const stepsCount = steps.value?.COUNT_TOTAL ?? 0;
  const sleepMin = sleep.value.minutes;

  const quality: QualityItem[] = [
    {
      label: t('צעדים', 'Steps'),
      quality: steps.failed ? 'missing' : stepsCount > 0 ? 'ok' : 'missing',
      source: sourceLabels(steps.value?.dataOrigins ?? []),
    },
    {
      label: t('תזונה', 'Nutrition'),
      quality: nut.meals ? 'ok' : 'missing',
      source: sourceLabels(meals.map(origin)),
      hint: nut.meals ? undefined : t('לא נרשמו ארוחות היום ב Zepp', 'No meals logged today in Zepp'),
    },
    {
      label: t('שינה', 'Sleep'),
      quality: sleepMin === null ? 'missing' : sleepMin < 240 ? 'partial' : 'ok',
      source: sourceLabels(sleep.value.sources),
      hint: sleepMin !== null && sleepMin < 240 ? t('פחות מ4 שעות, כנראה סנכרון חלקי', 'Under 4 hours, probably a partial sync') : undefined,
    },
    {
      label: t('משקל', 'Weight'),
      quality: !weightVal ? 'missing' : weightVal.daysAgo > 7 ? 'partial' : 'ok',
      source: latestW ? sourceLabel(origin(latestW)) : t('אין מקור', 'No source'),
      hint: !weightVal ? t('אין שקילה ב Health Connect', 'No weigh-in in Health Connect') : weightVal.daysAgo > 7 ? t(`שקילה אחרונה לפני ${weightVal.daysAgo} ימים`, `Last weigh-in ${weightVal.daysAgo} days ago`) : undefined,
    },
    {
      label: t('דופק', 'Heart rate'),
      quality: hrVal ? (bpm.length >= 50 ? 'ok' : 'partial') : 'missing',
      source: sourceLabels(hrRecords.map(origin)),
      hint: hrVal ? undefined : t('Mi Fitness לא כותב דופק ל Health Connect', 'Mi Fitness does not write heart rate to Health Connect'),
    },
  ];

  return {
    steps: stepsCount,
    activeKcal: active.value?.ACTIVE_CALORIES_TOTAL?.inKilocalories ?? 0,
    distanceKm: (distance.value?.DISTANCE?.inMeters ?? 0) / 1000,
    nutrition: nut,
    sleepMinutes: sleepMin,
    weight: weightVal,
    heartRate: hrVal,
    restingHr: restingVal,
    workouts: { count: sessions.length, minutes: Math.round(workoutMinutes) },
    quality,
  };
}
