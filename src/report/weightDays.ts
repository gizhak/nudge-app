// The weight's story for the progress screen: the explanation the home screen shows, with every
// reason, and a row per day (weigh-in, food, sleep, workout) to see which day moved the scale.
import { readRecords } from 'react-native-health-connect';
import { GOALS } from '../config/goals';
import { sourceLabel } from '../config/sources';
import { loadPlaceState } from '../coach/store';
import { readNutritionByEatingDay, readSleepByNight } from '../health/history';
import { workoutsOnly } from '../health/isWorkout';
import { derive } from '../profile/derive';
import { loadProfile } from '../profile/profile';
import { explainWeight, merge, WeightWhy } from './weightWhy';

import { t as tr } from '../i18n';
const DAY = 24 * 3600 * 1000;

export interface DayRow {
  /** Start of the day, ms */
  day: number;
  /** The day's weigh-in on the main scale, the last one that day */
  kg: number | null;
  kcal: number;
  meals: number;
  /** Enough meals and calories that the day says something */
  logged: boolean;
  sleepMin: number | null;
  workout: boolean;
  /** The day's meals, to check the total */
  list?: { name: string; time: Date; kcal: number }[];
}

export interface WeightStory {
  why: WeightWhy | null;
  /** Oldest first */
  rows: DayRow[];
  target: number;
}

const sod = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export async function readWeightStory(days = 14): Promise<WeightStory> {
  const safe = async <X,>(fn: () => Promise<X>, fb: X) => {
    try {
      return await fn();
    } catch {
      return fb;
    }
  };
  const now = Date.now();
  const range = (n: number) => ({
    timeRangeFilter: { operator: 'between' as const, startTime: new Date(now - n * DAY).toISOString(), endTime: new Date(now).toISOString() },
  });
  const [nut, sleep, weightRecs, sessions, place, profile] = await Promise.all([
    safe(() => readNutritionByEatingDay(days), [] as Awaited<ReturnType<typeof readNutritionByEatingDay>>),
    safe(() => readSleepByNight(days), [] as Awaited<ReturnType<typeof readSleepByNight>>),
    safe(async () => ((await readRecords('Weight', range(days))) as any).records ?? [], [] as any[]),
    safe(async () => workoutsOnly(((await readRecords('ExerciseSession', range(days))) as any).records), [] as any[]),
    safe(() => loadPlaceState(), { place: null, since: 0 } as Awaited<ReturnType<typeof loadPlaceState>>),
    safe(() => loadProfile(), null),
  ]);
  const trained = new Set<number>([...sessions.map((r: any) => sod(new Date(r.startTime).getTime())), ...(place.gymDays ?? [])]);
  const lite = nut.map((d) => {
    const day = sod(d.date.getTime());
    const sl = sleep.find((x) => sod(x.date.getTime()) === day);
    return { day, kcal: d.kcal, meals: d.meals, sleepMin: sl?.minutes ?? null, workout: trained.has(day), list: d.list };
  });
  const points = weightRecs
    .map((r: any) => ({ time: new Date(r.time).getTime(), kg: r.weight?.inKilograms, source: r.metadata?.dataOrigin }))
    .filter((p: any) => p.kg > 0);
  const usable = profile && profile.completed && profile.heightCm > 0 && profile.weightKg > 0;
  const why = explainWeight(points, lite, { target: GOALS.calories, maintenance: usable ? derive(profile!).maintenance : undefined, label: sourceLabel, now });

  // The day's number on the scale of the latest weigh-in, as the explanation measures it
  const merged = merge(points, []);
  const main = merged[merged.length - 1]?.source;
  const kgOf = (day: number) => {
    const same = merged.filter((p) => sod(p.time) === day && p.source === main);
    return same.length ? same[same.length - 1].kg : null;
  };
  const target = GOALS.calories;
  const rows: DayRow[] = lite.map((d) => ({ ...d, kg: kgOf(d.day), logged: d.meals >= 2 && d.kcal >= target * 0.45 }));
  return { why, rows, target };
}

/**
 * The weekly average and the latest weigh-in can point different ways (the average up because
 * the start of the week was high, while the scale already falls). One sentence that joins them.
 */
export function reconcile(points: { date: Date; kg: number }[], now = Date.now()): string | null {
  const wk = points.filter((p) => now - p.date.getTime() < 7 * DAY);
  const prev = points.filter((p) => now - p.date.getTime() >= 7 * DAY && now - p.date.getTime() < 14 * DAY);
  if (wk.length < 2 || !prev.length) return null;
  const mean = (xs: typeof wk) => xs.reduce((a, p) => a + p.kg, 0) / xs.length;
  const a1 = mean(wk);
  const delta = a1 - mean(prev);
  const last = wk[wk.length - 1];
  const names = [tr('ראשון', 'Sunday'), tr('שני', 'Monday'), tr('שלישי', 'Tuesday'), tr('רביעי', 'Wednesday'), tr('חמישי', 'Thursday'), tr('שישי', 'Friday'), tr('שבת', 'Saturday')];
  const f = (n: number) => (Math.round(Math.abs(n) * 10) / 10).toFixed(1);
  if (delta >= 0.2 && last.kg <= a1 - 0.3) {
    const peak = wk.reduce((a, p) => (p.kg > a.kg ? p : a));
    return tr(`הממוצע עלה ${f(delta)} ק"ג בגלל ימים גבוהים השבוע, עם שיא של ${peak.kg.toFixed(1)} ביום ${names[peak.date.getDay()]}. השקילה האחרונה, ${last.kg.toFixed(1)}, כבר מתחת לממוצע, אז אם זה יימשך הממוצע של השבוע הבא יירד.`, `The average went up ${f(delta)} kg because of high days this week, with a peak of ${peak.kg.toFixed(1)} on ${names[peak.date.getDay()]}. The last weigh-in, ${last.kg.toFixed(1)}, is already below the average, so if it holds, next week's average will go down.`);
  }
  if (delta <= -0.2 && last.kg >= a1 + 0.3) {
    return tr(`הממוצע ירד ${f(delta)} ק"ג, אבל השקילה האחרונה, ${last.kg.toFixed(1)}, מעל הממוצע. קפיצה של יום או יומיים היא בדרך כלל מים, והממוצע הוא מה שקובע.`, `The average went down ${f(delta)} kg, but the last weigh-in, ${last.kg.toFixed(1)}, is above the average. A jump of a day or two is usually water, and the average is what counts.`);
  }
  return null;
}

/** One thing to do next week, from the strongest reason */
export function nextStep(reasons: string[]): string | null {
  const r = reasons.find((x) => !/^(המגמה התהפכה|The trend turned)/.test(x)) ?? reasons[0];
  if (!r) return null;
  if (/שתי שקילות|two weigh-ins/i.test(r)) return tr('שקילה אחת בבוקר, לבד על המשקל, כדי שהמספרים לא יתערבבו.', 'One weigh-in in the morning, alone on the scale, so the numbers do not mix.');
  if (/ישנת|you slept/i.test(r)) return tr('השבוע: לישון חצי שעה מוקדם יותר. זה הצעד הכי קל שיוריד את המשקל של הבוקר.', 'This week: go to sleep half an hour earlier. It is the easiest step to lower the morning weight.');
  if (/ארוחה גדולה|קלוריות. ארוחה|calories\. A big meal/i.test(r)) return tr('אחרי יום גדול לא מפצים ברעב: חוזרים ליעד הקלוריות ושותים יותר מים. תוך יומיים זה יורד.', 'After a big day, do not make up for it by going hungry: back to the calorie target and drink more water. Within two days it goes down.');
  if (/מאוחר|מוקדם|later than usual|earlier than usual/i.test(r)) return tr('להישקל כל יום באותה שעה, אחרי שירותים ולפני אוכל ושתייה.', 'Weigh in every day at the same time, after the bathroom and before food and drink.');
  if (/לא נרשם|not fully logged/i.test(r)) return tr('לרשום את כל הארוחות השבוע, גם את הקטנות. בלי זה אי אפשר לדעת מה הזיז את המשקל.', 'Log every meal this week, the small ones too. Without that there is no way to know what moved the weight.');
  if (/אימון|workout/i.test(r)) return tr('להמשיך באימונים. המים שהשריר מחזיק יורדים כשהגוף מתרגל.', 'Keep training. The water the muscles hold goes down as the body gets used to it.');
  if (/אכלת מעט|you ate little/i.test(r)) return tr('לא להוריד עוד: יום עם מעט אוכל מחזיר את המשקל אחרי יומיים. להישאר קרוב ליעד הקלוריות.', 'Do not cut more: a day of little food brings the weight back after two days. Stay close to the calorie target.');
  if (/קצב|a pace/i.test(r)) return tr('להמשיך בדיוק כך. זה הקצב שמחזיק לאורך זמן.', 'Keep going exactly like this. This is the pace that lasts.');
  return null;
}
