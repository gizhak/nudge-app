// Which success, if any, earns a moment on the screen now. Rare on purpose: each one is shown
// once (its key is remembered), at most one per opening, the biggest first.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { caloriesFor, GOALS, planThisWeek } from '../config/goals';
import { readWeights, readWorkoutsByWeek } from '../health/history';
import { t as tr } from '../i18n';

const KEY = 'celebrate.seen.v1';
const DAY = 86400000;

export type CelebrationKind = 'workout' | 'day' | 'low' | 'streak';
export interface Celebration {
  kind: CelebrationKind;
  key: string;
  title: string;
  sub: string;
}

export interface TodayFacts {
  now: Date;
  workoutsToday: number;
  workoutMinutes: number;
  steps: number;
  kcal: number;
  protein: number;
  meals: number;
  waterMl: number;
  waterTarget: number;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const fmt1 = (n: number) => n.toFixed(1);

/** All four targets of the day met: steps, protein and water reached, calories logged and within the target */
export function dayClosed(f: TodayFacts): boolean {
  const target = caloriesFor(f.now);
  return f.steps >= GOALS.steps && f.protein >= GOALS.proteinG && f.waterTarget > 0 && f.waterMl >= f.waterTarget && f.meals >= 2 && f.kcal >= target * 0.8 && f.kcal <= target * 1.05;
}

/**
 * The 7-day average now against every earlier 7-day window: a new lowest one, by at least 0.1 kg.
 * Needs 3 weigh-ins in the week and 3 weeks of history before it, so one good morning is not a record.
 */
export function newLow(weights: { date: Date; kg: number }[], now: Date): { avg: number } | null {
  const avgAt = (end: number) => {
    const w = weights.filter((p) => p.date.getTime() > end - 7 * DAY && p.date.getTime() <= end);
    return w.length >= 3 ? w.reduce((a, p) => a + p.kg, 0) / w.length : null;
  };
  const cur = avgAt(now.getTime());
  if (cur == null || !weights.length) return null;
  const first = weights[0].date.getTime();
  if (now.getTime() - first < 21 * DAY) return null;
  let best = Infinity;
  for (let end = now.getTime() - DAY; end - 7 * DAY >= first - DAY; end -= DAY) {
    const a = avgAt(end);
    if (a != null && a < best) best = a;
  }
  return best !== Infinity && cur <= best - 0.1 ? { avg: Math.round(cur * 10) / 10 } : null;
}

async function seen(): Promise<string[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
  } catch {
    return [];
  }
}
export async function markSeen(key: string) {
  const s = await seen();
  await AsyncStorage.setItem(KEY, JSON.stringify([...s.filter((k) => k !== key), key].slice(-60))).catch(() => undefined);
}

export async function dueCelebration(f: TodayFacts): Promise<Celebration | null> {
  const done = new Set(await seen());
  const today = dayKey(f.now);
  const out: Celebration[] = [];

  const weights = await readWeights(90, f.now).catch(() => [] as { date: Date; kg: number }[]);
  const low = newLow(weights, f.now);
  if (low) {
    out.push({ kind: 'low', key: `low@${low.avg}`, title: tr(`${fmt1(low.avg)} ק"ג`, `${fmt1(low.avg)} kg`), sub: tr('הממוצע השבועי הכי נמוך עד היום', 'Your lowest weekly average yet') });
  }

  const plan = planThisWeek(f.now);
  if (plan.length) {
    const wk = await readWorkoutsByWeek(1, f.now).catch(() => [] as { weekStart: Date; count: number }[]);
    const w = wk[wk.length - 1];
    if (w && w.count >= plan.length) {
      out.push({ kind: 'streak', key: `streak@${dayKey(w.weekStart)}`, title: tr('שבוע שלם', 'A full week'), sub: tr(`${plan.length} מתוך ${plan.length} אימונים`, `${plan.length} of ${plan.length} workouts`) });
    }
  }

  if (dayClosed(f)) out.push({ kind: 'day', key: `day@${today}`, title: tr('יום מלא', 'A full day'), sub: tr('כל ארבעת היעדים נסגרו', 'All four targets met') });

  if (f.workoutsToday > 0) {
    out.push({ kind: 'workout', key: `workout@${today}@${f.workoutsToday}`, title: tr('אימון בפנים', 'Workout in'), sub: f.workoutMinutes > 0 ? tr(`${f.workoutMinutes} דקות`, `${f.workoutMinutes} minutes`) : tr('כל הכבוד', 'Well done') });
  }

  return out.find((c) => !done.has(c.key)) ?? null;
}
