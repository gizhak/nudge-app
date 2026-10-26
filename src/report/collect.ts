// Gathers what a report needs from Health Connect and the app's own records.
import { workoutsOnly } from '../health/isWorkout';
import { aggregateRecord, readRecords } from 'react-native-health-connect';
import { readNutritionByDay, readSleepByNight } from '../health/history';
import { groupWeighIns } from '../health/scale';
import { loadPlaceState } from '../coach/store';
import { BodyPoint, DAY, DayData } from './compute';

const range = (start: number, end: number) => ({
  timeRangeFilter: { operator: 'between' as const, startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString() },
});

const safe = async <X,>(fn: () => Promise<X>, fb: X): Promise<X> => {
  try {
    return await fn();
  } catch {
    return fb;
  }
};

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** One row per day from start (a day start) to end (exclusive), never past now. */
export async function collectDays(start: number, end: number, now = Date.now()): Promise<DayData[]> {
  const last = Math.min(end, startOfDay(now) + DAY);
  const n = Math.max(0, Math.round((last - start) / DAY));
  if (!n) return [];
  const until = new Date(Math.min(last, now) - 1);
  const [nut, sleep, sessions, place] = await Promise.all([
    safe(() => readNutritionByDay(n, until), [] as Awaited<ReturnType<typeof readNutritionByDay>>),
    safe(() => readSleepByNight(n, until), [] as Awaited<ReturnType<typeof readSleepByNight>>),
    safe(async () => workoutsOnly(((await readRecords('ExerciseSession', range(start, last))) as any).records), [] as any[]),
    safe(() => loadPlaceState(), { place: null, since: 0 } as Awaited<ReturnType<typeof loadPlaceState>>),
  ]);
  const workoutDays = new Set<number>([...sessions.map((r: any) => startOfDay(new Date(r.startTime).getTime())), ...(place.gymDays ?? [])]);
  // Steps one day at a time: Health Connect merges overlapping sources in an aggregate
  const steps: (number | null)[] = [];
  for (let i = 0; i < n; i += 7) {
    const chunk = await Promise.all(
      Array.from({ length: Math.min(7, n - i) }, (_, j) => {
        const s = start + (i + j) * DAY;
        const e = Math.min(s + DAY, now);
        return safe(async () => ((await aggregateRecord({ recordType: 'Steps', ...range(s, e) } as any)) as any)?.COUNT_TOTAL ?? null, null);
      }),
    );
    steps.push(...chunk);
  }
  return Array.from({ length: n }, (_, i) => {
    const day = start + i * DAY;
    const nd = nut.find((x) => startOfDay(x.date.getTime()) === day);
    const sl = sleep.find((x) => startOfDay(x.date.getTime()) === day);
    return {
      day,
      kcal: nd?.kcal ?? 0,
      protein: nd?.protein ?? 0,
      meals: nd?.meals ?? 0,
      steps: steps[i] ?? null,
      sleepMin: sl?.minutes ?? null,
      sleepManual: !!sl?.manual,
      workout: workoutDays.has(day),
    };
  });
}

/** Weigh-ins with body composition, every source including weights typed into Nudge. */
export async function collectBody(start: number, end: number): Promise<BodyPoint[]> {
  const read = (t: string) => safe(async () => ((await readRecords(t as any, range(start, end))) as any).records ?? [], [] as any[]);
  const [Weight, BodyFat, LeanBodyMass] = await Promise.all([read('Weight'), read('BodyFat'), read('LeanBodyMass')]);
  return groupWeighIns({ Weight, BodyFat, LeanBodyMass }).map((w) => ({ time: w.time.getTime(), weight: w.weight, fatPct: w.fatPct, leanKg: w.leanKg }));
}
