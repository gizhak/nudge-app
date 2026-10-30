// Pure: what happens after "got it" on something that was not done yet.
// "Got it" postpones a task, it does not close it. When the time is up and the data
// still shows it open, the coach comes back, louder each time.
import { SLOT_BY_ID, SlotId } from '../nutrition/meals';

import { t as tr } from '../i18n';
export type Family = 'weigh' | 'water' | 'meal' | 'workout' | 'sync' | 'hc' | 'food';

/** Which topics can be checked in the data, and so come back after "got it". */
export function familyOf(topic: string): Family | null {
  const t = topic.split('@')[0];
  if (t === 'weigh_in' || t === 'weigh_reminder') return 'weigh';
  if (t === 'water' || t === 'water_morning') return 'water';
  if (/^meal_reminder_/.test(t)) return 'meal';
  if (t === 'workout_today' || t === 'workout_now' || t === 'missed_workout' || t === 'workout_reminder' || t === 'outing_workout') return 'workout';
  if (t === 'sync_steps' || t === 'sync_sleep') return 'sync';
  if (t === 'hc_broken') return 'hc';
  if (t === 'food_none') return 'food';
  return null;
}

/** The key a follow-up is stored under: one per family, one per meal. */
export function followKey(topic: string): string | null {
  const f = familyOf(topic);
  if (!f) return null;
  return f === 'meal' ? topic.split('@')[0] : f;
}

const DELAY_MIN: Record<Family, number> = { weigh: 20, water: 45, meal: 60, workout: 45, sync: 30, hc: 30, food: 60 };

export interface FollowUp {
  key: string;
  /** The topic he answered, for the buttons of the follow-up */
  topic: string;
  ackAt: number;
  dueAt: number;
  /** How many times he said "got it" on this today */
  count: number;
  /** Scheduled notification, cancelled when the data shows it done */
  notifId?: string;
}

export interface FollowPrefs {
  quietStart: number;
  quietEnd: number;
}

const mins = (d: Date) => d.getHours() * 60 + d.getMinutes();
const inQuiet = (m: number, p: FollowPrefs) => (p.quietStart <= p.quietEnd ? m >= p.quietStart && m < p.quietEnd : m >= p.quietStart || m < p.quietEnd);

/**
 * When to come back. A workout waits for its start time; anything that would land in
 * quiet hours moves to the morning.
 */
export function dueTime(topic: string, now: Date, prefs: FollowPrefs, workoutStart?: number | null): Date | null {
  const f = familyOf(topic);
  if (!f) return null;
  let due = new Date(now.getTime() + DELAY_MIN[f] * 60000);
  if (f === 'workout' && workoutStart != null && workoutStart > mins(now)) {
    due = new Date(now);
    due.setHours(Math.floor(workoutStart / 60), workoutStart % 60, 0, 0);
  }
  if (inQuiet(mins(due), prefs)) {
    const morning = new Date(due);
    if (mins(due) >= prefs.quietStart && prefs.quietStart > prefs.quietEnd) morning.setDate(morning.getDate() + 1);
    morning.setHours(Math.floor(prefs.quietEnd / 60), prefs.quietEnd % 60, 0, 0);
    // A task of today that only comes back tomorrow is not a follow-up anymore
    if (morning.toDateString() !== now.toDateString()) return null;
    due = morning;
  }
  return due;
}

/** What the data says right now, enough to tell if a task got done. */
export interface Facts {
  weighedToday?: boolean;
  waterMl?: number | null;
  waterExpected?: number;
  /** Slots with a logged meal, or marked "ate, did not log" */
  mealSlotsDone?: string[];
  workedOutToday?: boolean;
  stepsFresh?: boolean;
  sleepKnown?: boolean;
  hcOk?: boolean;
  meals?: number;
}

/** True when the data shows the task done. Unknown data never counts as done. */
export function isResolved(f: FollowUp, x: Facts): boolean {
  const fam = familyOf(f.topic);
  switch (fam) {
    case 'weigh':
      return x.weighedToday === true;
    case 'water':
      return x.waterMl != null && x.waterExpected != null && x.waterMl >= x.waterExpected - 250; // same line as waterBehind
    case 'meal':
      return !!x.mealSlotsDone?.includes(f.key.replace('meal_reminder_', ''));
    case 'workout':
      return x.workedOutToday === true;
    case 'sync':
      return f.topic.startsWith('sync_sleep') ? x.sleepKnown === true : x.stepsFresh === true;
    case 'hc':
      return x.hcOk === true;
    case 'food':
      return (x.meals ?? 0) > 0;
    default:
      return true;
  }
}

const WHAT: Record<Family, string> = {
  weigh: tr('שקילה', 'a weigh-in'),
  water: tr('שתייה', 'drinking'),
  meal: tr('רישום ארוחה', 'a logged meal'),
  workout: tr('אימון', 'a workout'),
  sync: tr('סנכרון מהשעון', 'a sync from the watch'),
  hc: tr('חיבור תקין לנתונים', 'a working data connection'),
  food: tr('ארוחה רשומה', 'a logged meal'),
};

const DO_NOW: Record<Family, string> = {
  weigh: tr('עלה על המשקל עכשיו, זה 10 שניות.', 'Step on the scale now, it is 10 seconds.'),
  water: tr('כוס מים עכשיו, לא אחר כך.', 'A glass of water now, not later.'),
  meal: tr('רשום את הארוחה עכשיו, או סמן "אכלתי".', 'Log the meal now, or tap "I ate".'),
  workout: tr('תחליט עכשיו: מתאמן, 20 דקות בבית, או "לא מסתדר".', 'Decide now: training, 20 minutes at home, or "can\'t make it".'),
  sync: tr('פתח את אפליקציית השעון ותן לה לסנכרן.', 'Open the watch app and let it sync.'),
  hc: tr('פתח את בדיקת המוכנות ותקן.', 'Open the readiness check and fix it.'),
  food: tr('רשום מה אכלת היום.', 'Log what you ate today.'),
};

const hhmm = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** The message that comes back. count is how many times he already said "got it". */
export function followUpMessage(f: FollowUp): { title: string; body: string; level: 'normal' | 'urgent' } {
  const fam = familyOf(f.topic)!;
  let what = WHAT[fam];
  if (fam === 'meal') {
    const slot = SLOT_BY_ID[f.key.replace('meal_reminder_', '') as SlotId];
    if (slot) what = tr(`רישום של ${slot.label}`, `logging of ${slot.label.toLowerCase()}`);
  }
  if (f.count <= 1) {
    return { title: tr('הבנתי, אבל לא בוצע', 'Got it, but not done'), body: tr(`לחצת הבנתי ב${hhmm(f.ackAt)}, ואני עדיין לא רואה ${what}. ${DO_NOW[fam]}`, `You tapped got it at ${hhmm(f.ackAt)}, and I still don't see ${what}. ${DO_NOW[fam]}`), level: 'normal' };
  }
  if (f.count === 2) {
    return { title: tr(`פעם שנייה: עדיין אין ${what}`, `Second time: still no ${what}`), body: tr(`שתי פעמים "הבנתי" מאז הבוקר, ועדיין כלום. ${DO_NOW[fam]}`, `Twice "got it" since the morning, and still nothing. ${DO_NOW[fam]}`), level: 'urgent' };
  }
  return {
    title: tr(`${f.count} פעמים "הבנתי", אפס ביצוע`, `${f.count} times "got it", zero done`),
    body: tr(`"הבנתי" לא עושה את זה במקומך. ${DO_NOW[fam]} אני לא מוותר.`, `"Got it" does not do it for you. ${DO_NOW[fam]} I am not giving up.`),
    level: 'urgent',
  };
}

/** Checklist row that a follow-up belongs to, to mark it with a red sign in the app. */
export function checklistKeyOf(key: string): string | null {
  if (key === 'weigh') return 'weigh';
  if (key === 'water') return 'water';
  if (key === 'workout') return 'train';
  if (key.startsWith('meal_reminder_') || key === 'food') return 'meals';
  if (key === 'sync') return 'sync';
  if (key === 'hc') return 'hc';
  return null;
}
