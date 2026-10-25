// Pure: a vacation. Silent, or light upkeep; the days do not count in the reports, and the
// first day back gets one honest message about the scale.

const DAY = 24 * 3600 * 1000;

export type VacationMode = 'silent' | 'light';

export interface Vacation {
  /** First day, start of day (ms) */
  from: number;
  /** Last day, start of day (ms), inclusive */
  to: number;
  mode: VacationMode;
}

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Is this moment inside the vacation (its last day included)? */
export const onVacation = (now: Date | number, v?: Vacation | null): boolean => {
  if (!v) return false;
  const d = startOfDay(typeof now === 'number' ? now : now.getTime());
  return d >= v.from && d <= v.to;
};

/** Days since he came back: 1 on the first day after, 0 or less during or before it. */
export const daysBack = (now: Date | number, v?: Vacation | null): number => {
  if (!v) return 0;
  const d = startOfDay(typeof now === 'number' ? now : now.getTime());
  return Math.round((d - v.to) / DAY);
};

/** Only these may come during light upkeep, and only one a day. */
export const LIGHT_IDS = ['water', 'steps_afternoon', 'protein_evening'];

export function makeVacation(startInDays: number, length: number, mode: VacationMode, now = Date.now()): Vacation {
  const from = startOfDay(now) + Math.max(0, startInDays) * DAY;
  // Through daylight saving: back to the start of the day
  return { from: startOfDay(from + 3 * 3600 * 1000), to: startOfDay(from + (Math.max(1, length) - 1) * DAY + 3 * 3600 * 1000), mode };
}

export const dm = (t: number) => {
  const d = new Date(t);
  return `${d.getDate()}.${d.getMonth() + 1}`;
};
