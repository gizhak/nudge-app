// Learning the user from what he does, not from what he said at setup. Pure: plain inputs in,
// facts out, so every rule is tested without a phone.

import { t as tr } from '../i18n';
export interface Fact {
  key: string;
  title: string;
  /** The evidence, in words */
  detail: string;
  /** What the coach does differently because of it */
  effect: string;
  confidence: number;
  value: number;
  /** For per-topic facts: the topic it is about */
  topic?: string;
}

export interface Events {
  /** Weigh-ins */
  weights: number[];
  /** Water logged */
  water: number[];
  /** Food logged */
  meals: number[];
  /** Workout starts */
  workouts: number[];
  /** Main sleep: start and end */
  sleeps: { start: number; end: number }[];
}

export interface Sent {
  t: string;
  at: number;
}

const DAY = 86400000;
const WINDOW = 21 * DAY;
const minOfDay = (t: number) => {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
};
export const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const dayKey = (t: number) => new Date(t).toDateString();

/** The usual time of the first weigh-in of the day, on weekdays or on weekend days. */
export function weighTime(weights: number[], now: number, weekend: (day: number) => boolean, onWeekend: boolean): Fact | null {
  const firsts = new Map<string, number>();
  for (const t of weights.filter((x) => now - x < WINDOW).sort((a, b) => a - b)) {
    if (weekend(new Date(t).getDay()) !== onWeekend) continue;
    // Only morning weigh-ins say when his morning weigh-in is
    if (minOfDay(t) > 12 * 60) continue;
    if (!firsts.has(dayKey(t))) firsts.set(dayKey(t), minOfDay(t));
  }
  const n = firsts.size;
  const possible = Array.from({ length: 21 }, (_, i) => new Date(now - i * DAY).getDay()).filter((d) => weekend(d) === onWeekend).length;
  if (n < (onWeekend ? 3 : 6)) return null;
  const m = Math.round(median([...firsts.values()]) / 5) * 5;
  const when = onWeekend ? tr('בסוף השבוע', 'on weekends') : tr('באמצע השבוע', 'midweek');
  return {
    key: onWeekend ? 'weigh_time_weekend' : 'weigh_time_weekday',
    title: tr(`שוקל ${when} בסביבות ${hhmm(m)}`, `Weighs in ${when} around ${hhmm(m)}`),
    detail: tr(`${n} מתוך ${possible} בקרים ב 3 השבועות האחרונים.`, `${n} of ${possible} mornings in the last 3 weeks.`),
    effect: tr(`תזכורת השקילה ${when} תגיע ב ${hhmm(Math.max(0, m - 10))}, רגע לפני.`, `The weigh-in reminder ${when} will come at ${hhmm(Math.max(0, m - 10))}, just before.`),
    confidence: Math.min(1, n / possible),
    value: m,
  };
}

/** When he really wakes: the median end of the main sleep. */
export function wakeTime(sleeps: { start: number; end: number }[], now: number): Fact | null {
  const main = sleeps.filter((s) => now - s.end < WINDOW && s.end - s.start >= 3 * 3600000);
  const byDay = new Map<string, number>();
  for (const s of main) byDay.set(dayKey(s.end), Math.max(byDay.get(dayKey(s.end)) ?? 0, s.end));
  const ends = [...byDay.values()].map(minOfDay).filter((m) => m >= 4 * 60 && m <= 12 * 60);
  if (ends.length < 7) return null;
  const m = Math.round(median(ends) / 5) * 5;
  return {
    key: 'wake_time',
    title: tr(`קם בדרך כלל ב ${hhmm(m)}`, `Usually gets up at ${hhmm(m)}`),
    detail: tr(`לפי השעון, ${ends.length} בקרים ב 3 השבועות האחרונים.`, `By the watch, ${ends.length} mornings in the last 3 weeks.`),
    effect: tr('הודעות הבוקר מתחילות מהשעה הזו, ולא מהשעה שהוגדרה בהתחלה.', 'Morning messages start from this time, not the one set at the start.'),
    confidence: Math.min(1, ends.length / 18),
    value: m,
  };
}

/** Which action answers each kind of message, and how long it has to happen. */
export const ACTION_OF: Record<string, { kind: keyof Omit<Events, 'sleeps'> | 'sleep'; minutes: number; label: string }> = {
  water: { kind: 'water', minutes: 45, label: tr('תזכורת מים', 'Water reminder') },
  weigh_in: { kind: 'weights', minutes: 180, label: tr('תזכורת שקילה', 'Weigh-in reminder') },
  protein_evening: { kind: 'meals', minutes: 120, label: tr('השלמת חלבון בערב', 'Evening protein top-up') },
  leave_office_protein: { kind: 'meals', minutes: 120, label: tr('חלבון ביציאה מהעבודה', 'Protein when leaving work') },
  food_none: { kind: 'meals', minutes: 120, label: tr('עוד לא נרשם אוכל', 'No food logged yet') },
  pre_workout_snack: { kind: 'meals', minutes: 90, label: tr('ביניים לפני אימון', 'Snack before a workout') },
  workout_now: { kind: 'workouts', minutes: 240, label: tr('עכשיו אימון', 'Workout now') },
  missed_workout: { kind: 'workouts', minutes: 600, label: tr('פספסת אימון', 'Missed workout') },
  home_before_workout: { kind: 'workouts', minutes: 240, label: tr('הביתה לפני אימון', 'Home before a workout') },
  week_behind: { kind: 'workouts', minutes: 1440, label: tr('השבוע מאחור', 'Behind this week') },
  long_break: { kind: 'workouts', minutes: 1440, label: tr('הפסקה ארוכה', 'A long break') },
  go_to_sleep: { kind: 'sleep', minutes: 75, label: tr('הולכים לישון', 'Going to sleep') },
};

export const bucketOf = (t: number) => {
  const h = new Date(t).getHours();
  return h < 12 ? 'morning' : h < 17 ? 'noon' : 'evening';
};
const BUCKET_LABEL: Record<string, string> = { morning: tr('בבוקר', 'in the morning'), noon: tr('בצהריים', 'at midday'), evening: tr('בערב', 'in the evening') };

export interface Effect {
  topic: string;
  n: number;
  acted: number;
  rate: number;
  byBucket: Record<string, { n: number; acted: number }>;
}

/** For each kind of message: how often he did the thing after it. */
export function effectiveness(sent: Sent[], ev: Events, now: number): Effect[] {
  const acts = (kind: string): number[] => (kind === 'sleep' ? ev.sleeps.map((s) => s.start) : (ev as any)[kind] ?? []);
  const out = new Map<string, Effect>();
  for (const s of sent) {
    const a = ACTION_OF[s.t];
    if (!a || now - s.at > WINDOW) continue;
    // Too early to know
    if (now - s.at < a.minutes * 60000) continue;
    // Nothing of this kind at all in three weeks means the data did not arrive, not that he ignored it
    if (!acts(a.kind).length) continue;
    const did = acts(a.kind).some((t) => t > s.at && t - s.at <= a.minutes * 60000);
    const e = out.get(s.t) ?? { topic: s.t, n: 0, acted: 0, rate: 0, byBucket: {} };
    e.n++;
    if (did) e.acted++;
    const b = bucketOf(s.at);
    e.byBucket[b] = e.byBucket[b] ?? { n: 0, acted: 0 };
    e.byBucket[b].n++;
    if (did) e.byBucket[b].acted++;
    out.set(s.t, e);
  }
  return [...out.values()].map((e) => ({ ...e, rate: e.n ? e.acted / e.n : 0 }));
}

export function effectFacts(effects: Effect[]): Fact[] {
  const out: Fact[] = [];
  for (const e of effects) {
    if (e.n < 4) continue;
    const label = ACTION_OF[e.topic].label;
    const pct = Math.round(e.rate * 100);
    // A time of day that works clearly better than another
    const buckets = Object.entries(e.byBucket).filter(([, v]) => v.n >= 3);
    const best = buckets.sort((a, b) => b[1].acted / b[1].n - a[1].acted / a[1].n)[0];
    const worst = buckets[buckets.length - 1];
    let effect: string;
    if (e.rate >= 0.5) effect = tr('עובד עליך: ההודעה הזו מקבלת עדיפות, ותחזור אם לא בוצע.', 'Works on you: this message gets priority, and comes back if not done.');
    else if (e.rate < 0.15 && e.n >= 6) effect = tr('כמעט לא עובד עליך: ההודעה הזו תבוא פחות, כדי שלא תתרגל להתעלם מהמאמן.', 'Barely works on you: this message will come less, so you don\'t get used to ignoring the coach.');
    else effect = tr('בינוני: נשאר כמו שהוא.', 'Medium: stays as it is.');
    if (best && worst && best !== worst && best[1].acted / best[1].n - worst[1].acted / worst[1].n >= 0.35) {
      effect += tr(` עובד יותר ${BUCKET_LABEL[best[0]]} מאשר ${BUCKET_LABEL[worst[0]]}, אז ${BUCKET_LABEL[worst[0]]} היא תבוא פחות.`, ` Works better ${BUCKET_LABEL[best[0]]} than ${BUCKET_LABEL[worst[0]]}, so ${BUCKET_LABEL[worst[0]]} it will come less.`);
    }
    out.push({
      key: `eff_${e.topic}`,
      topic: e.topic,
      title: tr(`${label}: פעלת אחריה ב ${pct}% מהפעמים`, `${label}: you acted on it ${pct}% of the time`),
      detail: tr(`${e.acted} מתוך ${e.n} פעמים ב 3 השבועות האחרונים.`, `${e.acted} of ${e.n} times in the last 3 weeks.`),
      effect,
      confidence: Math.min(1, e.n / 10),
      value: e.rate,
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

/**
 * How a message's priority moves with what was learned. 1 is the most urgent.
 * Works on him: one step up. Almost never works, or not at this time of day: one step down.
 */
export function adjustPriority(priority: number, effect: Effect | undefined, at: number): number {
  if (!effect || effect.n < 4) return priority;
  const b = effect.byBucket[bucketOf(at)];
  const here = b && b.n >= 3 ? b.acted / b.n : effect.rate;
  if (effect.rate >= 0.5 && here >= 0.4) return Math.max(1, priority - 1);
  if ((effect.rate < 0.15 && effect.n >= 6) || (b && b.n >= 3 && here < 0.15 && effect.rate >= 0.3)) return Math.min(3, priority + 1);
  return priority;
}

export function learnAll(ev: Events, sent: Sent[], now: number, weekend: (day: number) => boolean): { facts: Fact[]; effects: Effect[] } {
  const effects = effectiveness(sent, ev, now);
  const facts = [weighTime(ev.weights, now, weekend, false), weighTime(ev.weights, now, weekend, true), wakeTime(ev.sleeps, now)].filter(
    (f): f is Fact => !!f,
  );
  return { facts: [...facts, ...effectFacts(effects)], effects };
}
