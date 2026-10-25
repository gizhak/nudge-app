// Meal slots, classification by time, and a verdict on each meal.
// Pure logic: used by the nutrition screen, the coach, and the tests.

export type SlotId = 'breakfast' | 'snack_am' | 'lunch' | 'snack_pm' | 'dinner' | 'night';

export interface Slot {
  id: SlotId;
  label: string;
  /** Window used to classify a meal, minutes after midnight; night wraps past midnight */
  from: number;
  to: number;
  /** When the coach checks whether this meal was logged */
  remindAt: number;
  /** Share of the daily calories, before normalizing over the enabled slots */
  share: number;
}

const h = (hh: number, mm = 0) => hh * 60 + mm;

export const SLOTS: Slot[] = [
  { id: 'breakfast', label: 'ארוחת בוקר', from: h(4), to: h(10), remindAt: h(8, 30), share: 0.25 },
  { id: 'snack_am', label: 'ביניים בבוקר', from: h(10), to: h(12), remindAt: h(10, 45), share: 0.1 },
  { id: 'lunch', label: 'ארוחת צהריים', from: h(12), to: h(15, 30), remindAt: h(13, 30), share: 0.35 },
  { id: 'snack_pm', label: 'ביניים אחר הצהריים', from: h(15, 30), to: h(18), remindAt: h(16, 45), share: 0.1 },
  { id: 'dinner', label: 'ארוחת ערב', from: h(18), to: h(22), remindAt: h(20), share: 0.3 },
  { id: 'night', label: 'ארוחת לילה', from: h(22), to: h(4), remindAt: h(22, 30), share: 0.08 },
];

export const SLOT_BY_ID = Object.fromEntries(SLOTS.map((s) => [s.id, s])) as Record<SlotId, Slot>;

/** Default slots from the number of meals a day in the profile. */
export function defaultSlots(mealsPerDay: number): SlotId[] {
  if (mealsPerDay >= 5) return ['breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner'];
  if (mealsPerDay === 4) return ['breakfast', 'lunch', 'snack_pm', 'dinner'];
  return ['breakfast', 'lunch', 'dinner'];
}

const minutes = (d: Date) => d.getHours() * 60 + d.getMinutes();

export function slotOf(time: Date): SlotId {
  const m = minutes(time);
  for (const s of SLOTS) {
    if (s.from < s.to ? m >= s.from && m < s.to : m >= s.from || m < s.to) return s.id;
  }
  return 'night';
}

/** Calorie budget per slot, normalized over the slots the user eats. */
export function slotBudgets(dailyKcal: number, enabled: SlotId[]): Record<SlotId, number> {
  const total = enabled.reduce((a, id) => a + SLOT_BY_ID[id].share, 0) || 1;
  const out = {} as Record<SlotId, number>;
  for (const s of SLOTS) out[s.id] = Math.round((dailyKcal * (enabled.includes(s.id) ? s.share : 0.1)) / total);
  return out;
}

export type Verdict = 'protein_rich' | 'balanced' | 'low_protein' | 'sweet' | 'heavy' | 'late_heavy' | 'light';

export interface MealVerdict {
  verdict: Verdict;
  good: boolean;
  label: string;
  /** One coach sentence about this meal */
  message: string;
}

export interface MealLike {
  name: string;
  time: Date;
  kcal: number;
  protein: number;
  /** Grams of sugar, when the food app reports it */
  sugar?: number;
}

// Sweet snacks by name, for when the food app does not report sugar
const SWEET_WORDS = /(קינדר|שוקולד|וופל|עוגה|עוגיה|עוגיות|במבה|ביסלי|צ'יפס|גלידה|ממתק|סוכריה|קרמבו|בורקס|דונאט|סופגני|kinder|choco|snickers|mars|twix|oreo|nutella|cookie|wafer|chips|candy|donut|cake)/i;

const NEXT_TIME = 'בפעם הבאה: יוגורט חלבון, או פרי עם קומץ אגוזים.';

/**
 * Judges one meal. Protein share of calories is the main signal for a
 * recomposition goal; size is judged against the slot's budget.
 */
/**
 * Items logged within 10 minutes of each other are one plate: yogurt with granola and honey.
 * Oldest first, as the input.
 */
export function plates<M extends MealLike>(meals: M[], gapMin = 10): M[][] {
  const sorted = [...meals].sort((a, b) => a.time.getTime() - b.time.getTime());
  const out: M[][] = [];
  for (const m of sorted) {
    const last = out[out.length - 1];
    if (last && m.time.getTime() - last[last.length - 1].time.getTime() <= gapMin * 60000) last.push(m);
    else out.push([m]);
  }
  return out;
}

/** A plate as one meal: the sums, under the names of its items. */
export function plateMeal(items: MealLike[]): MealLike {
  const hasSugar = items.some((i) => i.sugar !== undefined);
  return {
    name: items.map((i) => i.name).join(', '),
    time: items[items.length - 1].time,
    kcal: items.reduce((a, i) => a + i.kcal, 0),
    protein: items.reduce((a, i) => a + i.protein, 0),
    sugar: hasSugar ? items.reduce((a, i) => a + (i.sugar ?? 0), 0) : undefined,
  };
}

/** The verdict for one item, judged with what it was eaten with. */
export function judgeInPlate(item: MealLike, all: MealLike[], slotBudget: number): MealVerdict {
  const plate = plates(all).find((p) => p.includes(item));
  return judgeMeal(plate && plate.length > 1 ? plateMeal(plate) : item, slotBudget);
}

export function judgeMeal(meal: MealLike, slotBudget: number): MealVerdict {
  const kcal = Math.max(0, meal.kcal);
  const proteinPct = kcal > 0 ? (meal.protein * 4 * 100) / kcal : 0;
  const slot = slotOf(meal.time);
  const name = meal.name;

  if (slot === 'night' && kcal > 300) {
    return {
      verdict: 'late_heavy',
      good: false,
      label: 'מאוחר וכבד',
      message: `${name} בשעה מאוחרת, ${Math.round(kcal)} קלוריות. ארוחה כבדה לפני שינה פוגעת באיכות השינה; עדיף משהו קטן עם חלבון, כמו יוגורט.`,
    };
  }
  if (kcal > slotBudget * 1.6 && kcal > 450) {
    return {
      verdict: 'heavy',
      good: false,
      label: 'כבדה',
      message: `${name}: ${Math.round(kcal)} קלוריות, הרבה מעבר לתקציב של הארוחה (כ${Math.round(slotBudget)}). לא נורא, אבל שאר היום צריך להיות קל יותר.`,
    };
  }
  // A sweet snack: mostly sugar, or a known sweet by name, with little protein
  const sugarShare = meal.sugar !== undefined && kcal > 0 ? (meal.sugar * 4) / kcal : 0;
  if (kcal >= 80 && proteinPct < 15 && (sugarShare >= 0.3 || SWEET_WORDS.test(name))) {
    return {
      verdict: 'sweet',
      good: false,
      label: 'חטיף מתוק',
      message: `זו לא מנה שאתה צריך. ${name}: ${Math.round(kcal)} קלוריות, ${Math.round(meal.protein)} גרם חלבון${
        meal.sugar ? ` ו${Math.round(meal.sugar)} גרם סוכר` : ''
      }. ${NEXT_TIME}`,
    };
  }
  if (proteinPct >= 28 && meal.protein >= 15) {
    return {
      verdict: 'protein_rich',
      good: true,
      label: 'עשירה בחלבון',
      message: `כל הכבוד: ${name} עם ${Math.round(meal.protein)} גרם חלבון. בדיוק מה שצריך לבניית שריר.`,
    };
  }
  if (proteinPct < 12 && kcal >= 150) {
    return {
      verdict: 'low_protein',
      good: false,
      label: 'דלת חלבון',
      message: `זו לא מנה שמקדמת את המטרה. ${name}: ${Math.round(kcal)} קלוריות ורק ${Math.round(meal.protein)} גרם חלבון. בפעם הבאה הוסף מקור חלבון.`,
    };
  }
  if (kcal < 120) {
    return { verdict: 'light', good: true, label: 'קלה', message: `${name}: נשנוש קל, ${Math.round(kcal)} קלוריות.` };
  }
  return {
    verdict: 'balanced',
    good: true,
    label: 'מאוזנת',
    message: `${name}: ארוחה מאוזנת, ${Math.round(meal.protein)} גרם חלבון ב${Math.round(kcal)} קלוריות.`,
  };
}
