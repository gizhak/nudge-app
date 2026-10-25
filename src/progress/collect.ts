// The numbers that go with a checkpoint, gathered from what the app already reads.
import { readRecords } from 'react-native-health-connect';
import { readProteinByDay, readSleepByNight, readWeights } from '../health/history';
import { loadPlaceState } from '../coach/store';

const DAY = 24 * 3600 * 1000;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const round1 = (n?: number) => (n == null ? undefined : Math.round(n * 10) / 10);
const safe = async <X,>(fn: () => Promise<X>, fb: X) => {
  try {
    return await fn();
  } catch {
    return fb;
  }
};

/** Distinct days with a workout: recorded by the watch, a gym visit, or marked "I trained". */
export async function workoutDaysSince(sinceMs: number, now = new Date()): Promise<number> {
  const res: any = await safe(
    () => readRecords('ExerciseSession', { timeRangeFilter: { operator: 'between', startTime: new Date(sinceMs).toISOString(), endTime: now.toISOString() } }) as Promise<any>,
    { records: [] },
  );
  const days = new Set<number>();
  const dayOf = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  for (const r of res.records ?? []) days.add(dayOf(new Date(r.startTime).getTime()));
  const st = await loadPlaceState();
  for (const d of st.gymDays ?? []) if (d >= dayOf(sinceMs)) days.add(d);
  return days.size;
}

export async function collectNumbers(now = new Date()) {
  const [weights, protein, sleep, workouts] = await Promise.all([
    safe(() => readWeights(7, now), [] as { date: Date; kg: number }[]),
    safe(() => readProteinByDay(8, now), [] as { date: Date; protein: number }[]),
    safe(() => readSleepByNight(7, now), [] as { date: Date; minutes: number | null }[]),
    workoutDaysSince(now.getTime() - 28 * DAY, now),
  ]);
  return {
    weightAvg: round1(avg(weights.map((w) => w.kg))),
    // Past days only: today is still in progress
    proteinAvg: round1(avg(protein.slice(0, -1).map((d) => d.protein).filter((p) => p > 0))),
    sleepAvgH: round1(avg(sleep.map((s) => s.minutes).filter((m): m is number => m != null).map((m) => m / 60))),
    workouts,
  };
}

/** Today's 7-day weight average, for the journey card between checkpoints. */
export async function currentWeightAvg(now = new Date()): Promise<number | undefined> {
  const w = await safe(() => readWeights(7, now), [] as { date: Date; kg: number }[]);
  return round1(avg(w.map((x) => x.kg)));
}
