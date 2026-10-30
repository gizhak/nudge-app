// Workouts as the watch recorded them: duration, and what happened in that time window
// (active calories, heart rate, steps, distance). Only what the watch app actually writes.
import { aggregateRecord, readRecords } from 'react-native-health-connect';

import { t } from '../i18n';
const DAY = 24 * 3600 * 1000;

export interface WorkoutDetail {
  start: Date;
  end: Date;
  minutes: number;
  /** Health Connect exercise type number */
  type: number;
  title?: string;
  /** App that wrote it */
  source?: string;
  activeKcal?: number;
  avgHr?: number;
  maxHr?: number;
  steps?: number;
  distanceKm?: number;
}

const TYPE_LABEL: Record<number, string> = {
  0: t('אימון', 'Workout'),
  13: t('קליסתניקס', 'Calisthenics'),
  36: t('אינטרוולים', 'Intervals'),
  41: t('קפיצות בחבל', 'Jump rope'),
  56: t('ריצה', 'Running'),
  57: t('ריצה על הליכון', 'Treadmill run'),
  70: t('אימון כוח', 'Strength training'),
  79: t('הליכה', 'Walking'),
  81: t('הרמת משקולות', 'Weightlifting'),
  8: t('אופניים', 'Cycling'),
  9: t('אופני כושר', 'Exercise bike'),
  10: t('בוט קאמפ', 'Boot camp'),
  25: t('אליפטיקל', 'Elliptical'),
};

export const workoutLabel = (w: WorkoutDetail) => w.title?.trim() || TYPE_LABEL[w.type] || t('אימון', 'Workout');

const safe = async <X,>(fn: () => Promise<X>): Promise<X | null> => {
  try {
    return await fn();
  } catch {
    return null;
  }
};

/** The last workouts, newest first, each with what happened during it. */
export async function readWorkoutDetails(days = 21, limit = 6, now = new Date()): Promise<WorkoutDetail[]> {
  const filter = { timeRangeFilter: { operator: 'between' as const, startTime: new Date(now.getTime() - days * DAY).toISOString(), endTime: now.toISOString() } };
  const res: any = await safe(() => readRecords('ExerciseSession', filter) as Promise<any>);
  const sessions: any[] = (res?.records ?? [])
    .sort((a: any, b: any) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, limit);
  return Promise.all(
    sessions.map(async (r) => {
      const start = new Date(r.startTime);
      const end = new Date(r.endTime);
      const win = { timeRangeFilter: { operator: 'between' as const, startTime: r.startTime, endTime: r.endTime } };
      const [kcal, hr, steps, dist]: any[] = await Promise.all([
        safe(() => aggregateRecord({ recordType: 'ActiveCaloriesBurned', ...win }) as Promise<any>),
        safe(() => aggregateRecord({ recordType: 'HeartRate', ...win }) as Promise<any>),
        safe(() => aggregateRecord({ recordType: 'Steps', ...win }) as Promise<any>),
        safe(() => aggregateRecord({ recordType: 'Distance', ...win }) as Promise<any>),
      ]);
      const pos = (n: number | undefined) => (n && n > 0 ? n : undefined);
      return {
        start,
        end,
        minutes: Math.round((end.getTime() - start.getTime()) / 60000),
        type: r.exerciseType ?? 0,
        title: r.title,
        source: r.metadata?.dataOrigin,
        activeKcal: pos(Math.round(kcal?.ACTIVE_CALORIES_TOTAL?.inKilocalories ?? 0)),
        avgHr: pos(Math.round(hr?.BPM_AVG ?? 0)),
        maxHr: pos(Math.round(hr?.BPM_MAX ?? 0)),
        steps: pos(Math.round(steps?.COUNT_TOTAL ?? 0)),
        distanceKm: pos(Math.round(((dist?.DISTANCE?.inMeters ?? 0) / 1000) * 10) / 10),
      };
    }),
  );
}
