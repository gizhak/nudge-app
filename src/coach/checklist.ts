// Pure: what is done and what is missing today, for the top of the Today screen.
import { GOALS, pad2, planThisWeek } from '../config/goals';
import { SLOT_BY_ID, slotOf, SlotId } from '../nutrition/meals';
import { Container, waterBehind, waterExpectedByNow, waterProgress } from '../nutrition/water';
import { plannedSoFar } from './rules';

export type CheckAction = 'weigh' | 'water' | 'zepp' | 'readiness' | 'training' | 'mifitness' | 'ate' | 'trained';

export interface CheckItem {
  key: string;
  label: string;
  done: boolean;
  detail: string;
  action?: { key: CheckAction; label: string };
  /** A second button: "done" for things the data cannot see */
  extra?: { key: CheckAction; label: string };
}

export interface ChecklistInput {
  now: Date;
  hcOk: boolean;
  hcProblem?: string;
  weighedToday: boolean;
  daysSinceWeigh: number | null;
  workedOutToday: boolean;
  workoutDaysThisWeek: number;
  waterMl: number | null;
  waterTarget: number;
  wakeTime: number;
  bedTime: number;
  mealTimes: Date[];
  mealSlots: SlotId[];
  sleepMinutes: number | null;
  lastStepsAt: Date | null;
  waterContainer?: Container;
  activityAppName?: string | null;
  foodAppName?: string | null;
  hasWatch?: boolean;
  /** Meal slots marked "ate, did not log" today */
  unloggedSlots?: string[];
}

const mins = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** Meal slots whose time window is already over (the night slot never is during the day). */
const passedSlots = (slots: SlotId[], m: number) =>
  slots.filter((id) => {
    const s = SLOT_BY_ID[id];
    return s.to > s.from ? m >= s.to : false;
  });

/** Meals that should have been logged by now and were not: what "I ate" marks. */
export function missingMeals(now: Date, mealTimes: Date[], slots: SlotId[], unlogged: string[] = []): SlotId[] {
  return passedSlots(slots, mins(now)).filter((id) => !mealTimes.some((t) => slotOf(t) === id) && !unlogged.includes(id));
}

export function checklist(c: ChecklistInput): CheckItem[] {
  const m = mins(c.now);
  const out: CheckItem[] = [];

  if (!c.hcOk) {
    out.push({
      key: 'hc',
      label: 'חיבור לנתונים',
      done: false,
      detail: c.hcProblem ?? 'אין גישה ל Health Connect',
      action: { key: 'readiness', label: 'תקן' },
    });
  }

  out.push(
    c.weighedToday
      ? { key: 'weigh', label: 'שקילה', done: true, detail: 'נשקלת היום' }
      : {
          key: 'weigh',
          label: 'שקילה',
          done: false,
          detail: c.daysSinceWeigh === null ? 'אין שקילות בכלל' : c.daysSinceWeigh >= 2 ? `לא נשקלת ${c.daysSinceWeigh} ימים` : 'עוד לא נשקלת היום',
          action: { key: 'weigh', label: 'הזן משקל' },
        },
  );

  const plan = planThisWeek(c.now).find((w) => w.day === c.now.getDay());
  const due = plannedSoFar(c.now);
  const week = `${c.workoutDaysThisWeek} מתוך ${GOALS.workoutsPerWeek} השבוע`;
  if (c.workedOutToday) {
    out.push({ key: 'train', label: 'אימון', done: true, detail: `התאמנת היום, ${week}` });
  } else if (plan) {
    const start = plan.hour * 60 + plan.minute;
    out.push({
      key: 'train',
      label: 'אימון',
      done: false,
      detail: m < start ? `היום ב${pad2(plan.hour)}:${pad2(plan.minute)}, ${week}` : `האימון של היום לא נרשם, ${week}`,
      action: { key: 'training', label: 'לאימון' },
      extra: m >= start - 30 ? { key: 'trained', label: 'התאמנתי' } : undefined,
    });
  } else {
    out.push({
      key: 'train',
      label: 'אימון',
      done: c.workoutDaysThisWeek >= due,
      detail: c.workoutDaysThisWeek >= due ? `יום מנוחה, ${week}` : `מאחור: ${week}, תוכננו ${due} עד עכשיו`,
      action: c.workoutDaysThisWeek >= due ? undefined : { key: 'training', label: 'לאימון' },
    });
  }

  if (c.waterMl !== null) {
    const expected = waterExpectedByNow(c.waterTarget, m, c.wakeTime, c.bedTime);
    out.push({
      key: 'water',
      label: 'מים',
      // Done only when the day's water is in; on pace is still open, behind says so
      done: c.waterMl >= c.waterTarget,
      detail: `${waterProgress(c.waterMl, c.waterTarget, c.waterContainer)}${c.waterMl >= c.waterTarget ? '' : waterBehind(c.waterMl, expected) ? ' · מאחור' : ''}`,
      action: { key: 'water', label: 'שתיתי כוס' },
    });
  }

  if (c.hcOk) {
    const passed = passedSlots(c.mealSlots, m);
    const unlogged = passed.filter((id) => c.unloggedSlots?.includes(id));
    const missing = passed.filter((id) => !c.mealTimes.some((t) => slotOf(t) === id) && !unlogged.includes(id));
    out.push({
      key: 'meals',
      label: 'רישום ארוחות',
      done: missing.length === 0,
      detail:
        (missing.length
          ? `לא נרשמו: ${missing.map((id) => SLOT_BY_ID[id].label).join(', ')}`
          : c.mealTimes.length
            ? c.mealTimes.length === 1
              ? 'ארוחה אחת נרשמה'
              : `${c.mealTimes.length} ארוחות נרשמו`
            : 'עוד אין ארוחה שהייתה צריכה להירשם') +
        (unlogged.length ? `. בלי רישום: ${unlogged.map((id) => SLOT_BY_ID[id].label).join(', ')}, הקלוריות לא נספרו` : ''),
      action: missing.length && c.foodAppName ? { key: 'zepp', label: `פתח ${c.foodAppName}` } : undefined,
      extra: missing.length ? { key: 'ate', label: 'אכלתי' } : undefined,
    });

    const problems: string[] = [];
    if (c.hasWatch !== false && c.sleepMinutes === null && m >= c.wakeTime + 60) problems.push('אין שינה מהלילה');
    if (m >= 11 * 60) {
      if (!c.lastStepsAt) problems.push('אין צעדים היום');
      else if (c.now.getTime() - c.lastStepsAt.getTime() > 4 * 3600 * 1000) problems.push(`צעדים לא סונכרנו מאז ${pad2(c.lastStepsAt.getHours())}:${pad2(c.lastStepsAt.getMinutes())}`);
    }
    out.push({
      key: 'sync',
      label: c.hasWatch === false ? 'צעדים מהטלפון' : 'סנכרון שעון',
      done: problems.length === 0,
      detail: problems.length ? problems.join(', ') : c.hasWatch === false ? 'צעדים מעודכנים' : 'שינה וצעדים מעודכנים',
      action: problems.length
        ? c.activityAppName
          ? { key: 'mifitness', label: `פתח ${c.activityAppName}` }
          : { key: 'readiness', label: 'בדיקה' }
        : undefined,
    });
  }

  return out;
}
