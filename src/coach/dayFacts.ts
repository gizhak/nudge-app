// What happened today, hour by hour, for the coach's check-ins and the evening summary.
import { readRecords } from 'react-native-health-connect';
import { workoutsOnly } from '../health/isWorkout';
import { RUN_TYPES } from '../run/read';

const DAY = 86400000;
const range = (start: Date, end: Date) => ({
  timeRangeFilter: { operator: 'between' as const, startTime: start.toISOString(), endTime: end.toISOString() },
});

export interface Session {
  start: number;
  end: number;
  minutes: number;
  run: boolean;
}

export interface HourFacts {
  stepsByHour: number[];
  waterByHour: number[];
  /** Today's workouts he started on the watch */
  workouts: Session[];
  /** The last workout before today that was not a run, for comparison */
  prevWorkout: Session | null;
}

const toSession = (r: any): Session => {
  const start = new Date(r.startTime).getTime();
  const end = new Date(r.endTime).getTime();
  return { start, end, minutes: Math.round((end - start) / 60000), run: RUN_TYPES.includes(r.exerciseType) };
};

/** Spreads a record over the hours it covers, in proportion. */
function addByHour(out: number[], dayStart: number, start: number, end: number, value: number) {
  if (end <= start) {
    const h = Math.floor((start - dayStart) / 3600000);
    if (h >= 0 && h < 24) out[h] += value;
    return;
  }
  for (let t = start; t < end; ) {
    const h = Math.floor((t - dayStart) / 3600000);
    const hourEnd = dayStart + (h + 1) * 3600000;
    const slice = Math.min(end, hourEnd) - t;
    if (h >= 0 && h < 24) out[h] += (value * slice) / (end - start);
    t += slice;
  }
}

export async function readHourFacts(now = new Date()): Promise<HourFacts> {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const ds = dayStart.getTime();
  const safe = async <T,>(fn: () => Promise<T>, fb: T) => {
    try {
      return await fn();
    } catch {
      return fb;
    }
  };
  const [steps, water, sessions] = await Promise.all([
    safe(async () => ((await readRecords('Steps', range(dayStart, now))) as any).records as any[], []),
    safe(async () => ((await readRecords('Hydration', range(dayStart, now))) as any).records as any[], []),
    safe(async () => ((await readRecords('ExerciseSession', range(new Date(ds - 14 * DAY), now))) as any).records as any[], []),
  ]);

  // Phone and watch both count steps: use the source that counted the most
  const byOrigin = new Map<string, any[]>();
  for (const r of steps) {
    const o = r?.metadata?.dataOrigin ?? '?';
    byOrigin.set(o, [...(byOrigin.get(o) ?? []), r]);
  }
  let best: any[] = [];
  let bestSum = -1;
  for (const list of byOrigin.values()) {
    const sum = list.reduce((a, r) => a + (r.count ?? 0), 0);
    if (sum > bestSum) {
      best = list;
      bestSum = sum;
    }
  }
  const stepsByHour = Array(24).fill(0);
  for (const r of best) addByHour(stepsByHour, ds, new Date(r.startTime).getTime(), new Date(r.endTime).getTime(), r.count ?? 0);

  const waterByHour = Array(24).fill(0);
  for (const r of water) addByHour(waterByHour, ds, new Date(r.endTime ?? r.startTime).getTime(), new Date(r.endTime ?? r.startTime).getTime(), r.volume?.inMilliliters ?? 0);

  const all = workoutsOnly(sessions).map(toSession).sort((a, b) => a.start - b.start);
  return {
    stepsByHour: stepsByHour.map(Math.round),
    waterByHour: waterByHour.map(Math.round),
    workouts: all.filter((s) => s.start >= ds),
    prevWorkout: [...all].reverse().find((s) => s.start < ds && !s.run) ?? null,
  };
}
