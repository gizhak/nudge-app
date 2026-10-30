// Everything the coach needs to know about today, read once. Used by the background
// coach and by the Today screen, so both see the same picture.
import { workoutsOnly } from '../health/isWorkout';
import { getGrantedPermissions, getSdkStatus, initialize, readRecords, SdkAvailabilityStatus } from 'react-native-health-connect';
import { planThisWeek } from '../config/goals';
import { Meal, readMeals } from '../health/history';
import { readToday, TodayData } from '../health/today';
import { readWaterToday } from '../health/water';
import { waterTarget } from '../nutrition/water';
import { loadPlaceState } from './store';

import { t as tr } from '../i18n';
const DAY = 24 * 3600 * 1000;

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export interface Situation {
  /** Health Connect reachable and the critical read permissions granted */
  hcOk: boolean;
  hcProblem?: string;
  today: TodayData | null;
  meals: Meal[];
  weighedToday: boolean;
  /** Whole days since the last weigh-in, null if none in a year */
  daysSinceWeigh: number | null;
  /** Distinct days with a workout (Health Connect session or gym visit) this week, Sunday start */
  workoutDaysThisWeek: number;
  workedOutToday: boolean;
  daysSinceWorkout: number | null;
  lastStepsAt: Date | null;
  /** Steps recorded in the last 30 minutes: a sign he is up and moving */
  recentSteps: number;
  /** null when water cannot be read */
  waterMl: number | null;
  waterTarget: number;
  trainingDay: boolean;
}

const CRITICAL = ['Steps', 'SleepSession', 'Nutrition', 'Weight', 'ExerciseSession'];

async function checkHc(): Promise<string | null> {
  try {
    if ((await getSdkStatus()) !== SdkAvailabilityStatus.SDK_AVAILABLE) return tr('Health Connect לא זמין', 'Health Connect is not available');
    if (!(await initialize())) return tr('Health Connect לא מאותחל', 'Health Connect is not initialized');
    const granted = new Set((await getGrantedPermissions()).map((p) => `${p.accessType}:${p.recordType}`));
    const missing = CRITICAL.filter((t) => !granted.has(`read:${t}`));
    return missing.length ? tr(`חסרות הרשאות: ${missing.join(', ')}`, `Missing permissions: ${missing.join(', ')}`) : null;
  } catch (e: any) {
    return String(e?.message ?? tr('Health Connect לא מגיב', 'Health Connect is not responding'));
  }
}

export async function readSituation(now = new Date(), weightKg = 80): Promise<Situation> {
  const problem = await checkHc();
  const placeState = await loadPlaceState();
  const todayStart = startOfDay(now).getTime();
  const weekStart = todayStart - now.getDay() * DAY;
  const gymDays = (placeState.gymDays ?? []).filter((d) => d > todayStart - 14 * DAY);
  const trainingDay = planThisWeek(now).some((w) => w.day === now.getDay());

  if (problem) {
    const lastGym = gymDays.length ? Math.max(...gymDays) : null;
    return {
      hcOk: false,
      hcProblem: problem,
      today: null,
      meals: [],
      weighedToday: false,
      daysSinceWeigh: null,
      workoutDaysThisWeek: gymDays.filter((d) => d >= weekStart).length,
      workedOutToday: gymDays.includes(todayStart),
      daysSinceWorkout: lastGym === null ? null : Math.round((todayStart - lastGym) / DAY),
      lastStepsAt: null,
      recentSteps: 0,
      waterMl: null,
      waterTarget: waterTarget(weightKg, trainingDay),
      trainingDay,
    };
  }

  const safe = async <X,>(fn: () => Promise<X>, fb: X) => {
    try {
      return await fn();
    } catch {
      return fb;
    }
  };
  const range = (a: number, b: Date) => ({
    timeRangeFilter: { operator: 'between' as const, startTime: new Date(a).toISOString(), endTime: b.toISOString() },
  });

  const [today, meals, sessions, steps, water, recent] = await Promise.all([
    safe(() => readToday(now), null),
    safe(() => readMeals(now), [] as Meal[]),
    safe(async () => ((await readRecords('ExerciseSession', range(todayStart - 14 * DAY, now))) as any).records as any[], []),
    safe(async () => ((await readRecords('Steps', range(todayStart, now))) as any).records as any[], []),
    safe(() => readWaterToday(now), null as number | null),
    safe(async () => ((await readRecords('Steps', range(now.getTime() - 30 * 60000, now))) as any).records as any[], []),
  ]);

  const workoutDays = new Set<number>(gymDays);
  for (const r of workoutsOnly(sessions)) workoutDays.add(startOfDay(new Date(r.startTime)).getTime());
  const lastWorkout = workoutDays.size ? Math.max(...workoutDays) : null;

  const lastStepsAt = steps.length ? new Date(Math.max(...steps.map((r) => new Date(r.endTime).getTime()))) : null;

  const w = today?.weight ?? null;
  const kg = w?.kg ?? weightKg;

  return {
    hcOk: true,
    today,
    meals,
    weighedToday: !!w && startOfDay(w.at).getTime() === todayStart,
    daysSinceWeigh: w ? Math.round((todayStart - startOfDay(w.at).getTime()) / DAY) : null,
    workoutDaysThisWeek: [...workoutDays].filter((d) => d >= weekStart).length,
    workedOutToday: workoutDays.has(todayStart),
    daysSinceWorkout: lastWorkout === null ? null : Math.round((todayStart - lastWorkout) / DAY),
    lastStepsAt,
    recentSteps: recent.reduce((a: number, r: any) => a + (r.count ?? 0), 0),
    waterMl: water,
    waterTarget: waterTarget(kg, trainingDay),
    trainingDay,
  };
}
