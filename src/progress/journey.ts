// Pure: the progress journey. A checkpoint every four weeks: photos, waist, and the numbers
// the app already knows. The scale alone hides recomposition; photos and waist show it.

import { t as tr } from '../i18n';
export const CHECKPOINT_DAYS = 28;
/** Comparing earlier than this mostly shows noise and discourages */
export const COMPARE_MIN_DAYS = 28;
const DAY = 24 * 3600 * 1000;

export interface Checkpoint {
  id: string;
  at: number;
  /** file:// paths inside the app's private storage */
  front?: string;
  side?: string;
  back?: string;
  waistCm?: number;
  /** Just below the larynx; with waist and height it gives a body fat estimate */
  neckCm?: number;
  /** Extended, optional: chest at the nipples, right arm relaxed at mid upper arm, right thigh midway */
  chestCm?: number;
  armCm?: number;
  thighCm?: number;
  /** 7-day average weight at the time, kg */
  weightAvg?: number;
  proteinAvg?: number;
  sleepAvgH?: number;
  /** Workouts in the 28 days before this checkpoint */
  workouts?: number;
}

export function sorted(list: Checkpoint[]): Checkpoint[] {
  return [...list].sort((a, b) => a.at - b.at);
}

/** Day 1 is the starting checkpoint. */
export function dayNumber(list: Checkpoint[], now = Date.now()): number | null {
  const first = sorted(list)[0];
  if (!first) return null;
  return Math.floor((startOfDay(now) - startOfDay(first.at)) / DAY) + 1;
}

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** When the next checkpoint is due; null before the first one. */
export function nextDue(list: Checkpoint[]): number | null {
  const last = sorted(list).slice(-1)[0];
  return last ? startOfDay(last.at) + CHECKPOINT_DAYS * DAY : null;
}

export function isDue(list: Checkpoint[], now = Date.now()): boolean {
  const due = nextDue(list);
  return due !== null && now >= due;
}

export function daysUntilDue(list: Checkpoint[], now = Date.now()): number | null {
  const due = nextDue(list);
  return due === null ? null : Math.max(0, Math.ceil((due - startOfDay(now)) / DAY));
}

export interface Diff {
  days: number;
  weight?: number;
  waist?: number;
  chest?: number;
  arm?: number;
  thigh?: number;
  workouts: number;
}

/** First against latest. Workouts are counted across every checkpoint after the first. */
export function diff(list: Checkpoint[]): Diff | null {
  const s = sorted(list);
  if (s.length < 2) return null;
  const a = s[0];
  const b = s[s.length - 1];
  const delta = (x?: number, y?: number) => (x != null && y != null ? Math.round((y - x) * 10) / 10 : undefined);
  return {
    days: Math.round((startOfDay(b.at) - startOfDay(a.at)) / DAY),
    weight: delta(a.weightAvg, b.weightAvg),
    waist: delta(a.waistCm, b.waistCm),
    chest: delta(a.chestCm, b.chestCm),
    arm: delta(a.armCm, b.armCm),
    thigh: delta(a.thighCm, b.thighCm),
    workouts: s.slice(1).reduce((n, c) => n + (c.workouts ?? 0), 0),
  };
}

/** "-1.2" or "+0.4", for the cards. */
export const signed = (n: number, unit: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)} ${unit}`;

/** What the coach says about a comparison: the waist matters more than the scale. */
export function verdict(d: Diff): string {
  const sig = muscleSignal(d);
  if (sig) return sig;
  if (d.waist != null && d.waist <= -1 && (d.weight == null || d.weight > -0.5)) return tr('המשקל כמעט לא זז, אבל המותן ירדה. זה בדיוק איך שבניית שריר וירידה בשומן נראות.', 'The weight barely moved, but the waist went down. That is exactly what building muscle and losing fat look like.');
  if (d.waist != null && d.waist <= -1) return tr('המותן יורדת. השומן הולך, תמשיך בדיוק ככה.', 'The waist is going down. The fat is going, keep doing exactly this.');
  if (d.waist != null && d.waist >= 1) return tr('המותן עלתה. נבדוק יחד קלוריות ושינה בחודש הקרוב.', 'The waist went up. We will look at calories and sleep together this coming month.');
  if (d.weight != null && d.weight <= -1) return tr('ירידה יפה במשקל. שמור על החלבון כדי שזה יהיה שומן ולא שריר.', 'A nice drop in weight. Keep the protein up so it is fat and not muscle.');
  return tr('יציב. תסתכל על התמונות, לא רק על המספרים.', 'Steady. Look at the photos, not just the numbers.');
}

/**
 * The waist against the limbs. Waist down while arm, chest and thigh hold or grow: fat is
 * going and muscle is staying or coming. Limbs shrinking with the waist: some of it is muscle.
 */
export function muscleSignal(d: { waist?: number; chest?: number; arm?: number; thigh?: number }): string | null {
  if (d.waist == null || d.waist > -1) return null;
  const limbs = [d.arm, d.chest, d.thigh].filter((x): x is number => x != null);
  if (!limbs.length) return null;
  const grew = (d.arm ?? 0) >= 0.5 || (d.chest ?? 0) >= 1 || (d.thigh ?? 0) >= 1;
  const shrank = (d.arm ?? 0) <= -1 || (d.chest ?? 0) <= -2 || (d.thigh ?? 0) <= -2;
  if (grew && !shrank) return tr('סימן לבניית שריר: המותן ירדה בזמן שהזרוע, החזה או הירך גדלו. זה בדיוק חיטוב.', 'A sign of muscle building: the waist went down while the arm, chest or thigh grew. That is exactly toning.');
  if (shrank) return tr('המותן ירדה, אבל גם הזרוע או החזה. ייתכן שחלק מהירידה היא שריר: הקפד על חלבון ועל אימוני כוח.', 'The waist went down, but so did the arm or chest. Part of the loss may be muscle: keep up protein and strength training.');
  return tr('המותן ירדה והזרוע, החזה והירך נשמרו. הירידה היא בעיקר שומן.', 'The waist went down and the arm, chest and thigh held. The loss is mostly fat.');
}
