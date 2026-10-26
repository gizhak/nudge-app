// The week's one focus, the way a real coach works: from the last two weeks, the habit that moves the
// goal most and is off; a daily measure of it; and at the end of the week, how it went.
// Chosen once per week (Sunday, or the first run of the week) and kept for the week.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { weekStartKey } from '../config/goals';
import { collectDays } from '../report/collect';
import { addDays } from '../health/history';
import { DayData, isLogged, metrics, Targets } from '../report/compute';
import { context } from '../report/run';
import { safeGoal } from '../profile/safety';

const KEY = 'coach.focus.v1';
const DAY = 86400000;

export type FocusKey = 'kcal' | 'protein' | 'workouts' | 'sleep' | 'steps' | 'logging';

export interface Focus {
  week: string;
  key: FocusKey;
  title: string;
  why: string;
  /** Days that must hit the measure this week */
  need: number;
  chosenAt: number;
  /** How last week's focus ended, for the Sunday message */
  last?: { title: string; hit: number; need: number };
}

const startOfWeek = (now: Date) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
};

/** Whether one day hit the focus; null when the day says nothing (no data, or a day with no workout planned) */
export function dayHit(key: FocusKey, d: DayData, t: Targets): boolean | null {
  const kcal = t.dayCalories?.[new Date(d.day).getDay()] ?? t.calories;
  switch (key) {
    case 'kcal':
      return isLogged(d, t) ? d.kcal <= kcal * 1.1 && d.kcal >= kcal * 0.7 : false;
    case 'protein':
      return d.meals > 0 ? d.protein >= t.proteinG * 0.9 : false;
    case 'sleep':
      return d.sleepMin == null ? null : d.sleepMin >= t.sleepHours * 60 - 30;
    case 'steps':
      return d.steps == null ? null : d.steps >= t.steps;
    case 'logging':
      return isLogged(d, t);
    case 'workouts':
      return d.workout ? true : null;
  }
}

function titleOf(key: FocusKey, t: Targets): string {
  switch (key) {
    case 'kcal':
      return `קלוריות ביעד, סביב ${Math.round(t.calories / 50) * 50} ביום`;
    case 'protein':
      return `${t.proteinG} גרם חלבון ביום`;
    case 'sleep':
      return `${t.sleepHours} שעות שינה בלילה`;
    case 'steps':
      return `${t.steps.toLocaleString('en-US')} צעדים ביום`;
    case 'logging':
      return 'לרשום כל ארוחה, כל יום';
    case 'workouts':
      return `${t.workoutsPerWeek} אימונים השבוע`;
  }
}

const NEED: Record<FocusKey, (t: Targets) => number> = {
  kcal: () => 5,
  protein: () => 5,
  sleep: () => 5,
  steps: () => 5,
  logging: () => 6,
  workouts: (t) => Math.max(1, t.workoutsPerWeek),
};

/** The focus for a week from the two weeks before it; null when everything is on target */
export function chooseFocus(last: DayData[], before: DayData[], t: Targets, goal: string): { key: FocusKey; why: string } | null {
  const m = metrics(last, before, t, 'week');
  if (m.logged < 4) return { key: 'logging', why: `רק ${m.logged} מתוך 7 ימים נרשמו במלואם. בלי רישום אי אפשר לדעת מה עובד, אז זה בא קודם.` };
  const order: FocusKey[] = goal === 'recomp' || goal === 'gain' ? ['protein', 'workouts', 'kcal', 'sleep', 'steps'] : ['kcal', 'protein', 'workouts', 'sleep', 'steps'];
  const get = (k: FocusKey) => m.list.find((x) => x.key === k);
  const pick = order.find((k) => get(k)?.status === 'bad') ?? order.find((k) => get(k)?.status === 'ok');
  if (!pick) return null;
  const x = get(pick)!;
  return { key: pick, why: `בשבוע שעבר: ${x.value}. ${x.detail}.` };
}

export async function loadFocus(): Promise<Focus | null> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null');
  } catch {
    return null;
  }
}

/** This week's focus, chosen if the week is new. Returns it, or null when there is nothing to work on */
export async function ensureFocus(now = new Date()): Promise<Focus | null> {
  const week = weekStartKey(now);
  const cur = await loadFocus();
  if (cur?.week === week) return cur;
  const start = startOfWeek(now);
  const { profile, targets } = await context();
  if (!profile.completed) return null;
  const [last, before] = await Promise.all([collectDays(addDays(start, -7).getTime(), start), collectDays(addDays(start, -14).getTime(), addDays(start, -7).getTime())]);
  // How last week's focus went, measured on last week's days
  let lastResult: Focus['last'];
  if (cur && cur.week !== week && cur.need > 0 && cur.title) {
    const hit = last.map((d) => dayHit(cur.key, d, targets)).filter((x) => x === true).length;
    lastResult = { title: cur.title, hit, need: cur.need };
  }
  const pick = chooseFocus(last, before, targets, safeGoal(profile));
  const next: Focus | null = pick
    ? { week, key: pick.key, title: titleOf(pick.key, targets), why: pick.why, need: NEED[pick.key](targets), chosenAt: now.getTime(), last: lastResult }
    : null;
  await AsyncStorage.setItem(KEY, JSON.stringify(next ?? { week, key: 'logging', title: '', why: '', need: 0, chosenAt: now.getTime(), last: lastResult })).catch(() => undefined);
  return next;
}

/** This week's days against the focus: true, false, or null (no data yet, future, or not a training day),
 *  with each day's numbers for the day detail */
export async function focusProgress(f: Focus, now = new Date()): Promise<{ days: (boolean | null)[]; hit: number; rows: (DayData | null)[]; targets: Targets }> {
  const start = startOfWeek(now);
  const { targets } = await context();
  const days = await collectDays(start, now.getTime() + 1);
  const out: (boolean | null)[] = Array(7).fill(null);
  const rows: (DayData | null)[] = Array(7).fill(null);
  const today = now.getDay();
  for (const d of days) {
    const i = new Date(d.day).getDay();
    const h = dayHit(f.key, d, targets);
    rows[i] = d;
    // Today counts once it is hit; a miss is only a miss when the day is over.
    // Sleep is the exception: last night is over by the morning, so today is already final.
    out[i] = i === today && f.key !== 'sleep' ? (h === true ? true : null) : h;
  }
  return { days: out, hit: out.filter((x) => x === true).length, rows, targets };
}

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const n = (x: number) => Math.round(x).toLocaleString('en-US');
const hm = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} דקות`;
  return m ? `${h} שעות ו ${m} דקות` : `${h} שעות`;
};

/** One day of the focus, in a line or two: what happened and how far from the target */
export function dayLine(key: FocusKey, i: number, d: DayData | null, t: Targets, now = new Date()): { title: string; body: string } {
  const today = now.getDay();
  // A night is named by the morning it ends: Monday's circle is the night from Sunday to Monday
  const title =
    key === 'sleep'
      ? `הלילה שבין ${DAY_NAMES[(i + 6) % 7]} ל${DAY_NAMES[i]}${i === today ? ', הלילה האחרון' : ''}`
      : `יום ${DAY_NAMES[i]}${i === today ? ', היום' : ''}`;
  if (i > today) return { title, body: 'עוד לא הגיע.' };
  const open = i === today && key !== 'sleep' ? ' היום עוד לא נגמר.' : '';
  if (!d) return { title, body: 'אין נתונים ליום הזה.' };
  const kcal = t.dayCalories?.[i] ?? t.calories;
  switch (key) {
    case 'sleep': {
      if (d.sleepMin == null) return { title, body: 'אין נתון. השעון לא רשם את הלילה, אז הוא לא נספר כפספוס. אם לא ענדת, אפשר להכניס אותו ידנית.' };
      const goal = t.sleepHours * 60;
      const gap = goal - d.sleepMin;
      return { title, body: `ישנת ${hm(d.sleepMin)}${d.sleepManual ? ' (הזנה ידנית)' : ''}. ${gap <= 30 ? 'ביעד.' : `חסרות ${hm(gap)} ליעד של ${t.sleepHours} שעות.`}` };
    }
    case 'protein':
      if (!d.meals) return { title, body: `לא נרשמו ארוחות.${open}` };
      return { title, body: `${n(d.protein)} גרם חלבון מתוך ${t.proteinG}.${d.protein >= t.proteinG * 0.9 ? ' ביעד.' : ` חסרים ${n(t.proteinG - d.protein)} גרם.`}${open}` };
    case 'kcal':
      if (!isLogged(d, t)) return { title, body: `היום לא נרשם במלואו (${n(d.kcal)} קלוריות ב ${d.meals} ארוחות), אז אי אפשר לדעת.${open}` };
      return {
        title,
        body: `${n(d.kcal)} קלוריות מול יעד ${n(kcal)}.${d.kcal > kcal * 1.1 ? ` ${n(d.kcal - kcal)} מעל.` : d.kcal < kcal * 0.7 ? ' נמוך מדי, זה לא עוזר.' : ' ביעד.'}${open}`,
      };
    case 'steps':
      if (d.steps == null) return { title, body: 'אין נתון צעדים מהשעון.' };
      return { title, body: `${n(d.steps)} צעדים מתוך ${n(t.steps)}.${d.steps >= t.steps ? ' ביעד.' : ` חסרים ${n(t.steps - d.steps)}.`}${open}` };
    case 'logging':
      return { title, body: isLogged(d, t) ? `נרשם במלואו: ${d.meals} ארוחות, ${n(d.kcal)} קלוריות.` : `נרשמו ${d.meals} ארוחות, ${n(d.kcal)} קלוריות. זה לא מספיק כדי לדעת מה אכלת.${open}` };
    case 'workouts':
      return { title, body: d.workout ? 'היה אימון.' : `לא היה אימון.${open}` };
  }
}

/** Empty focus records (an on-target week) are stored too, so the choice is not made again */
export const isRealFocus = (f: Focus | null): f is Focus => !!f && f.need > 0 && !!f.title;
