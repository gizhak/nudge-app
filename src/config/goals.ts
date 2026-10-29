// Starting targets from the spec (46, 177 cm, 81 kg, recomposition).
// Recalibrate after 3 weeks of intake vs weight trend.
import { LANG } from '../i18n';
export const GOALS = {
  calories: 1925,
  proteinG: 140,
  steps: 8000,
  sleepHours: 7,
  workoutsPerWeek: 3,
};

export interface Exercise {
  name: string;
  sets: number;
  reps: string;
}

export interface Session {
  /** A, B, F for full body; A, B, C for a split; free text for others */
  id: string;
  title: string;
  minutes: number;
  exercises: Exercise[];
}

// Return program: weeks 1 and 2 at 60 to 70 percent of previous loads, full body, gym.
export const SESSIONS: Record<string, Session> = {
  A: {
    id: 'A',
    title: 'גוף מלא A',
    minutes: 45,
    exercises: [
      { name: 'סקוואט', sets: 3, reps: '8' },
      { name: 'לחיצת חזה במוט', sets: 3, reps: '8' },
      { name: 'חתירה בכבל', sets: 3, reps: '10' },
      { name: 'לחיצת כתפיים במשקולות', sets: 3, reps: '10' },
      { name: 'פלאנק', sets: 3, reps: '40 שניות' },
    ],
  },
  B: {
    id: 'B',
    title: 'גוף מלא B',
    minutes: 45,
    exercises: [
      { name: 'דדליפט רומני', sets: 3, reps: '8' },
      { name: 'לחיצת חזה בשיפוע במשקולות', sets: 3, reps: '10' },
      { name: 'פולי עליון', sets: 3, reps: '10' },
      { name: 'לאנג׳ים', sets: 3, reps: '10 לכל רגל' },
      { name: 'כפיפת מרפקים', sets: 2, reps: '12' },
    ],
  },
  F: {
    id: 'F',
    title: 'האימון המרכזי',
    minutes: 60,
    exercises: [
      { name: 'סקוואט', sets: 4, reps: '6' },
      { name: 'לחיצת חזה במוט', sets: 4, reps: '6' },
      { name: 'חתירה במוט', sets: 4, reps: '8' },
      { name: 'לחיצת כתפיים במשקולות', sets: 3, reps: '8' },
      { name: 'חבל, אינטרוולים', sets: 1, reps: '8 דקות' },
    ],
  },
};

export const MINIMUM_WORKOUT: Exercise[] = [
  { name: 'סקוואטים', sets: 3, reps: '15' },
  { name: 'שכיבות סמיכה', sets: 3, reps: '10' },
  { name: 'לאנג׳ים', sets: 2, reps: '10 לכל רגל' },
  { name: 'פלאנק', sets: 2, reps: '30 שניות' },
];

export interface PlannedWorkout {
  /** 0 = Sunday ... 6 = Saturday */
  day: number;
  hour: number;
  minute: number;
  session: Session['id'];
  /** Set when this week's plan differs from the base plan */
  moved?: boolean;
  short?: boolean;
  /** For a moved workout: the day it was planned on */
  origDay?: number;
}

export const WEEKLY_PLAN: PlannedWorkout[] = [
  { day: 0, hour: 20, minute: 30, session: 'A' },
  { day: 3, hour: 20, minute: 30, session: 'B' },
  { day: 5, hour: 8, minute: 0, session: 'F' },
];

/** The weekend: Friday and Saturday in Israel, Saturday and Sunday elsewhere, or what he set. */
export const WEEKEND: number[] = [5, 6];
export const setWeekend = (days: number[]) => WEEKEND.splice(0, WEEKEND.length, ...days);
export const isWeekend = (day: number) => WEEKEND.includes(day);
/** How the weekend is treated; set from the profile with the plan */
export const WEEKEND_MODE: { style: 'same' | 'normal' | 'flex' } = { style: 'normal' };
/** Flexible weekend: this much less on each work day, banked for the weekend */
export const FLEX_WEEKDAY_LESS = 150;
/** Today's calorie target. With a flexible weekend: a little less on work days, more on the weekend, same week total. */
export function caloriesFor(date: Date = new Date(), base: number = GOALS.calories, days: number[] = WEEKEND, style = WEEKEND_MODE.style): number {
  if (style !== 'flex' || !days.length || days.length >= 7) return base;
  const workDays = 7 - days.length;
  return days.includes(date.getDay()) ? Math.round((base + (FLEX_WEEKDAY_LESS * workDays) / days.length) / 25) * 25 : base - FLEX_WEEKDAY_LESS;
}
export function defaultWeekend(): number[] {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    return tz === 'Asia/Jerusalem' || tz === 'Asia/Tel_Aviv' ? [5, 6] : [6, 0];
  } catch {
    return [5, 6];
  }
}
/** The day the weekend starts: the weekend day whose day before is a work day. */
export const weekendStart = (days = WEEKEND) => days.find((d) => !days.includes((d + 6) % 7)) ?? days[0];

export const DAY_NAMES = LANG === 'en' ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] : ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const DAY_LETTERS = LANG === 'en' ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

export const pad2 = (n: number) => String(n).padStart(2, '0');

// ---------- This week's changes: moved, shortened or skipped workouts ----------

export interface WeekOverrides {
  /** dayKey of the Sunday that starts the week these changes belong to */
  week: string;
  /** count: how many times this workout was moved this week */
  moves: { fromDay: number; toDay: number; time: number; session: string; count?: number }[];
  skips: number[];
  shorts: number[];
  /** Which session is trained on which day, when the order changed: the missed one first, or his own swap */
  sessionAt?: Record<number, string>;
  /** The whole week as he laid it out in the week planner; skips and short versions still apply on top */
  plan?: PlannedWorkout[];
}

export const EMPTY_OVERRIDES: WeekOverrides = { week: '', moves: [], skips: [], shorts: [] };
let OVERRIDES: WeekOverrides = EMPTY_OVERRIDES;
export const setWeekOverrides = (o: WeekOverrides) => {
  OVERRIDES = o;
};
export const getWeekOverrides = () => OVERRIDES;

/** The short home session that replaces a workout he cannot make. */
export const SHORT_SESSION_ID = 'MIN';

export const weekStartKey = (now: Date) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** The plan for the week that contains `now`, with this week's changes applied. */
export function planThisWeek(now = new Date(), base: PlannedWorkout[] = WEEKLY_PLAN, ov: WeekOverrides = OVERRIDES): PlannedWorkout[] {
  if (ov.week !== weekStartKey(now)) return [...base].sort(byTime);
  const out: PlannedWorkout[] = [];
  if (ov.plan) {
    for (const w of ov.plan) {
      if (ov.skips.includes(w.day)) continue;
      out.push(ov.shorts.includes(w.day) ? { ...w, session: SHORT_SESSION_ID, short: true } : { ...w });
    }
    return out.sort(byTime);
  }
  for (const w of base) {
    const move = ov.moves.find((m) => m.fromDay === w.day && m.session === w.session);
    if (ov.skips.includes(w.day) && !move) continue;
    if (move) {
      out.push({ day: move.toDay, hour: Math.floor(move.time / 60), minute: move.time % 60, session: w.session, moved: true, origDay: w.day });
    } else if (ov.shorts.includes(w.day)) {
      out.push({ ...w, session: SHORT_SESSION_ID, short: true });
    } else out.push(w);
  }
  // The order of the sessions, when it was changed
  for (const w of out) {
    const s = ov.sessionAt?.[w.day];
    if (s && !w.short) w.session = s;
  }
  return out.sort(byTime);
}

const byTime = (a: PlannedWorkout, b: PlannedWorkout) => a.day - b.day || a.hour * 60 + a.minute - (b.hour * 60 + b.minute);

/** The session to train, including the short home version. */
export function sessionOf(id: string): Session {
  if (id === SHORT_SESSION_ID) return { id, title: 'אימון קצר בבית', minutes: 20, exercises: MINIMUM_WORKOUT };
  return SESSIONS[id] ?? Object.values(SESSIONS)[0];
}

/** The next planned workout. Once he trained today, today's slot is done even if its hour is still ahead
 *  (trained at 17:00 for a 20:30 slot), so the next one is the following planned day. */
export function nextWorkout(now = new Date(), doneToday = false): { workout: PlannedWorkout; session: Session; label: string; at?: Date } {
  for (let offset = doneToday ? 1 : 0; offset < 8; offset++) {
    const d = new Date(now);
    d.setDate(now.getDate() + offset);
    const hit = planThisWeek(d).filter((w) => w.day === d.getDay())
      .map((w) => {
        const at = new Date(d);
        at.setHours(w.hour, w.minute, 0, 0);
        return { w, at };
      })
      .find(({ at }) => at > now);
    if (hit) {
      const when = offset === 0 ? 'היום' : offset === 1 ? 'מחר' : `יום ${DAY_NAMES[hit.at.getDay()]}`;
      return {
        workout: hit.w,
        session: sessionOf(hit.w.session),
        label: `${when} ב${pad2(hit.w.hour)}:${pad2(hit.w.minute)}`,
        at: hit.at,
      };
    }
  }
  const w = WEEKLY_PLAN[0] ?? { day: 0, hour: 20, minute: 0, session: 'A' };
  return { workout: w, session: sessionOf(w.session), label: '' };
}
