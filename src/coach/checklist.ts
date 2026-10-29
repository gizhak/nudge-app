// Pure: what is done and what is missing today, for the top of the Today screen.
import { GOALS, pad2, planThisWeek } from '../config/goals';
import { SLOT_BY_ID, slotOf, SlotId } from '../nutrition/meals';
import { Container, waterBehind, waterExpectedByNow, waterProgress } from '../nutrition/water';
import { plannedSoFar } from './rules';

import { t as tr } from '../i18n';
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
      label: tr('חיבור לנתונים', 'Data connection'),
      done: false,
      detail: c.hcProblem ?? tr('אין גישה ל Health Connect', 'No access to Health Connect'),
      action: { key: 'readiness', label: tr('תקן', 'Fix') },
    });
  }

  out.push(
    c.weighedToday
      ? { key: 'weigh', label: tr('שקילה', 'Weigh-in'), done: true, detail: tr('נשקלת היום', 'Weighed today') }
      : {
          key: 'weigh',
          label: tr('שקילה', 'Weigh-in'),
          done: false,
          detail: c.daysSinceWeigh === null ? tr('אין שקילות בכלל', 'No weigh-ins at all') : c.daysSinceWeigh >= 2 ? tr(`לא נשקלת ${c.daysSinceWeigh} ימים`, `Not weighed for ${c.daysSinceWeigh} days`) : tr('עוד לא נשקלת היום', 'Not weighed today yet'),
          action: { key: 'weigh', label: tr('הזן משקל', 'Enter weight') },
        },
  );

  const plan = planThisWeek(c.now).find((w) => w.day === c.now.getDay());
  const due = plannedSoFar(c.now);
  const week = tr(`${c.workoutDaysThisWeek} מתוך ${GOALS.workoutsPerWeek} השבוע`, `${c.workoutDaysThisWeek} of ${GOALS.workoutsPerWeek} this week`);
  if (c.workedOutToday) {
    out.push({ key: 'train', label: tr('אימון', 'Workout'), done: true, detail: tr(`התאמנת היום, ${week}`, `Trained today, ${week}`) });
  } else if (plan) {
    const start = plan.hour * 60 + plan.minute;
    out.push({
      key: 'train',
      label: tr('אימון', 'Workout'),
      done: false,
      detail: m < start ? tr(`היום ב${pad2(plan.hour)}:${pad2(plan.minute)}, ${week}`, `Today at ${pad2(plan.hour)}:${pad2(plan.minute)}, ${week}`) : tr(`האימון של היום לא נרשם, ${week}`, `Today's workout was not logged, ${week}`),
      action: { key: 'training', label: tr('לאימון', 'To the workout') },
      extra: m >= start - 30 ? { key: 'trained', label: tr('התאמנתי', 'I trained') } : undefined,
    });
  } else {
    out.push({
      key: 'train',
      label: tr('אימון', 'Workout'),
      done: c.workoutDaysThisWeek >= due,
      detail: c.workoutDaysThisWeek >= due ? tr(`יום מנוחה, ${week}`, `Rest day, ${week}`) : tr(`מאחור: ${week}, תוכננו ${due} עד עכשיו`, `Behind: ${week}, ${due} planned so far`),
      action: c.workoutDaysThisWeek >= due ? undefined : { key: 'training', label: tr('לאימון', 'To the workout') },
    });
  }

  if (c.waterMl !== null) {
    const expected = waterExpectedByNow(c.waterTarget, m, c.wakeTime, c.bedTime);
    out.push({
      key: 'water',
      label: tr('מים', 'Water'),
      // Done only when the day's water is in; on pace is still open, behind says so
      done: c.waterMl >= c.waterTarget,
      detail: tr(`${waterProgress(c.waterMl, c.waterTarget, c.waterContainer)}${c.waterMl >= c.waterTarget ? '' : waterBehind(c.waterMl, expected) ? ' · מאחור' : ''}`, `${waterProgress(c.waterMl, c.waterTarget, c.waterContainer)}${c.waterMl >= c.waterTarget ? '' : waterBehind(c.waterMl, expected) ? ' · behind' : ''}`),
      action: { key: 'water', label: tr('שתיתי כוס', 'I drank a glass') },
    });
  }

  if (c.hcOk) {
    const passed = passedSlots(c.mealSlots, m);
    const unlogged = passed.filter((id) => c.unloggedSlots?.includes(id));
    const missing = passed.filter((id) => !c.mealTimes.some((t) => slotOf(t) === id) && !unlogged.includes(id));
    out.push({
      key: 'meals',
      label: tr('רישום ארוחות', 'Meal logging'),
      done: missing.length === 0,
      detail:
        (missing.length
          ? tr(`לא נרשמו: ${missing.map((id) => SLOT_BY_ID[id].label).join(', ')}`, `Not logged: ${missing.map((id) => SLOT_BY_ID[id].label).join(', ')}`)
          : c.mealTimes.length
            ? c.mealTimes.length === 1
              ? tr('ארוחה אחת נרשמה', 'One meal logged')
              : tr(`${c.mealTimes.length} ארוחות נרשמו`, `${c.mealTimes.length} meals logged`)
            : tr('עוד אין ארוחה שהייתה צריכה להירשם', 'No meal was due yet')) +
        (unlogged.length ? tr(`. בלי רישום: ${unlogged.map((id) => SLOT_BY_ID[id].label).join(', ')}, הקלוריות לא נספרו`, `. Not logged: ${unlogged.map((id) => SLOT_BY_ID[id].label).join(', ')}, the calories were not counted`) : ''),
      action: missing.length && c.foodAppName ? { key: 'zepp', label: tr(`פתח ${c.foodAppName}`, `Open ${c.foodAppName}`) } : undefined,
      extra: missing.length ? { key: 'ate', label: tr('אכלתי', 'I ate') } : undefined,
    });

    const problems: string[] = [];
    if (c.hasWatch !== false && c.sleepMinutes === null && m >= c.wakeTime + 60) problems.push(tr('אין שינה מהלילה', 'No sleep from last night'));
    if (m >= 11 * 60) {
      if (!c.lastStepsAt) problems.push(tr('אין צעדים היום', 'No steps today'));
      else if (c.now.getTime() - c.lastStepsAt.getTime() > 4 * 3600 * 1000) problems.push(tr(`צעדים לא סונכרנו מאז ${pad2(c.lastStepsAt.getHours())}:${pad2(c.lastStepsAt.getMinutes())}`, `Steps not synced since ${pad2(c.lastStepsAt.getHours())}:${pad2(c.lastStepsAt.getMinutes())}`));
    }
    out.push({
      key: 'sync',
      label: c.hasWatch === false ? tr('צעדים מהטלפון', 'Steps from the phone') : tr('סנכרון שעון', 'Watch sync'),
      done: problems.length === 0,
      detail: problems.length ? problems.join(', ') : c.hasWatch === false ? tr('צעדים מעודכנים', 'Steps up to date') : tr('שינה וצעדים מעודכנים', 'Sleep and steps up to date'),
      action: problems.length
        ? c.activityAppName
          ? { key: 'mifitness', label: tr(`פתח ${c.activityAppName}`, `Open ${c.activityAppName}`) }
          : { key: 'readiness', label: tr('בדיקה', 'Check') }
        : undefined,
    });
  }

  return out;
}
