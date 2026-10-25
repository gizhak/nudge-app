import { blockText, deficitBlock, safeGoal } from './safety';
// Turns the questionnaire answers into targets, a weekly plan and coach settings.
// Pure functions: no storage, no React, so the math is easy to test.
import type { Exercise, PlannedWorkout, Session } from '../config/goals';
import { defaultWeekend, GOALS, MINIMUM_WORKOUT, SESSIONS, setWeekend, WEEKEND_MODE, WEEKLY_PLAN } from '../config/goals';
import { Pain, Profile, SplitKind } from './profile';
import { checklistOf, exercisesOf, gearFor, pickKey } from '../train/library';

export interface Derived {
  bmr: number;
  maintenance: number;
  goals: typeof GOALS;
  plan: PlannedWorkout[];
  sessions: Record<Session['id'], Session>;
  minimum: Exercise[];
  weeklyRateKg: number;
  weeksToTarget: number | null;
  notes: string[];
  weekend: number[];
  weekendStyle: 'same' | 'normal' | 'flex';
}

const round = (n: number, step: number) => Math.round(n / step) * step;

export function bmrMifflin(p: Pick<Profile, 'sex' | 'age' | 'heightCm' | 'weightKg'>) {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
}

function activityFactor(workoutsPerWeek: number, workLoad: Profile['workLoad'] = 'desk') {
  const base = workoutsPerWeek <= 1 ? 1.3 : workoutsPerWeek <= 3 ? 1.375 : 1.5;
  // A job on your feet burns more than the workouts do
  return base + (workLoad === 'physical' ? 0.15 : workLoad === 'mixed' ? 0.075 : 0);
}

const CALORIE_DELTA: Record<Profile['goal'], Record<Profile['pace'], number>> = {
  lose: { moderate: -500, fast: -750 },
  recomp: { moderate: -400, fast: -400 },
  gain: { moderate: 250, fast: 400 },
  maintain: { moderate: 0, fast: 0 },
};

const PROTEIN_PER_KG: Record<Profile['goal'], number> = { lose: 1.7, recomp: 1.7, gain: 1.8, maintain: 1.4 };

const WEEKLY_RATE: Record<Profile['goal'], Record<Profile['pace'], number>> = {
  lose: { moderate: 0.5, fast: 0.75 },
  recomp: { moderate: 0.3, fast: 0.3 },
  gain: { moderate: 0.25, fast: 0.4 },
  maintain: { moderate: 0, fast: 0 },
};

const ex = (name: string, sets: number, reps: string): Exercise => ({ name, sets, reps });

function library(p: Profile): Record<'A' | 'B', Exercise[]> {
  if (p.trainPlace === 'gym') {
    return {
      A: [ex('סקוואט', 3, '8'), ex('לחיצת חזה במוט', 3, '8'), ex('חתירה בכבל', 3, '10'), ex('לחיצת כתפיים במשקולות', 3, '10'), ex('פלאנק', 3, '40 שניות')],
      B: [ex('דדליפט רומני', 3, '8'), ex('לחיצת חזה בשיפוע במשקולות', 3, '10'), ex('פולי עליון', 3, '10'), ex('לאנג׳ים', 3, '10 לכל רגל'), ex('כפיפת מרפקים', 2, '12')],
    };
  }
  if (p.homeEquipment) {
    return {
      A: [ex('גובלט סקוואט', 3, '10'), ex('לחיצת חזה במשקולות על הרצפה', 3, '10'), ex('חתירה במשקולת', 3, '10 לכל יד'), ex('לחיצת כתפיים', 3, '10'), ex('פלאנק', 3, '40 שניות')],
      B: [ex('דדליפט רומני במשקולות', 3, '10'), ex('שכיבות סמיכה', 3, '10'), ex('חתירה עם גומייה', 3, '12'), ex('לאנג׳ים עם משקולות', 3, '10 לכל רגל'), ex('כפיפת מרפקים', 2, '12')],
    };
  }
  return {
    A: [ex('סקוואט במשקל גוף', 3, '15'), ex('שכיבות סמיכה', 3, '10'), ex('חתירה הפוכה מתחת לשולחן', 3, '10'), ex('לאנג׳ים', 3, '10 לכל רגל'), ex('פלאנק', 3, '40 שניות')],
    B: [ex('גשר ישבן', 3, '15'), ex('שכיבות סמיכה צרות', 3, '8'), ex('סופרמן', 3, '12'), ex('סקוואט בולגרי', 3, '8 לכל רגל'), ex('פלאנק צד', 2, '30 שניות')],
  };
}

// Swaps that keep the movement pattern while easing the painful joint
const SWAPS: Record<Pain, Record<string, string>> = {
  knees: {
    'סקוואט': 'לחיצת רגליים בטווח חלקי',
    'לאנג׳ים': 'גשר ישבן',
    'סקוואט במשקל גוף': 'גשר ישבן',
    'סקוואט בולגרי': 'הרמת אגן ברגל אחת',
    'גובלט סקוואט': 'גשר ישבן עם משקולת',
    'לאנג׳ים עם משקולות': 'גשר ישבן עם משקולת',
  },
  back: {
    'דדליפט רומני': 'פשיטת ירך במכונה',
    'דדליפט רומני במשקולות': 'גשר ישבן',
    'חתירה במוט': 'חתירה בכבל בישיבה',
    'סקוואט': 'לחיצת רגליים',
    'סופרמן': 'ציפור כלב',
  },
  shoulders: {
    'לחיצת כתפיים במשקולות': 'הרחקה לצדדים, משקל קל',
    'לחיצת כתפיים': 'הרחקה לצדדים, משקל קל',
    'לחיצת חזה במוט': 'לחיצת חזה במשקולות, אחיזה ניטרלית',
    'לחיצת חזה בשיפוע במשקולות': 'לחיצת חזה במכונה',
    'שכיבות סמיכה': 'שכיבות סמיכה על קיר',
    'שכיבות סמיכה צרות': 'שכיבות סמיכה על קיר',
  },
};

function adapt(list: Exercise[], p: Profile): Exercise[] {
  return list.map((e) => {
    let name = e.name;
    for (const pain of p.pains) name = SWAPS[pain][name] ?? name;
    const sets = p.experience === 'beginner' ? Math.max(2, e.sets - 1) : e.sets;
    return { ...e, name, sets };
  });
}

// ---------- Splits: how the week's workouts are divided ----------

export const SPLITS: { key: SplitKind; label: string; hint: string; minDays: number }[] = [
  { key: 'full', label: 'גוף מלא', hint: 'כל אימון עובד על כל הגוף. כל שריר מקבל עבודה בכל אימון.', minDays: 1 },
  { key: 'split3', label: 'פיצול לשלושה', hint: 'חזה ויד אחורית, גב ויד קדמית, רגליים וכתפיים.', minDays: 3 },
  { key: 'ppl', label: 'דחיפה, משיכה, רגליים', hint: 'חזה כתפיים ויד אחורית, גב ויד קדמית, רגליים.', minDays: 3 },
  { key: 'upper_lower', label: 'עליון ותחתון', hint: 'פלג גוף עליון, פלג גוף תחתון, לסירוגין.', minDays: 2 },
];

/** What the coach recommends, and why, from the number of days and the experience. */
export function recommendSplit(p: Pick<Profile, 'slots' | 'experience' | 'trainPlace'>): { split: SplitKind; why: string } {
  const days = p.slots.length;
  if (p.trainPlace !== 'gym') return { split: 'full', why: 'באימון בבית או בחוץ, גוף מלא מנצל הכי טוב את הציוד שיש.' };
  if (days <= 3 || p.experience === 'beginner')
    return { split: 'full', why: `ב${days || 'עד 3'} אימונים בשבוע, גוף מלא נותן לכל שריר עבודה 2 עד 3 פעמים בשבוע. בפיצול כל שריר עובד פעם בשבוע, וזה מאט את בניית השריר.` };
  if (days === 4) return { split: 'upper_lower', why: 'ב4 ימים, עליון ותחתון נותן לכל שריר עבודה פעמיים בשבוע.' };
  return { split: 'ppl', why: 'ב5 ימים ומעלה, דחיפה, משיכה ורגליים עובר על כל שריר פעמיים בשבוע.' };
}

const ABS_PAIRS: Exercise[][] = [
  [ex('פלאנק', 3, '40 שניות'), ex('הרמות ברכיים בתלייה', 3, '12')],
  [ex('כפיפות בטן בכבל', 3, '15'), ex('פלאנק צד', 2, '30 שניות לכל צד')],
  [ex('גלגל בטן', 3, '10'), ex('הרמות רגליים בשכיבה', 3, '12')],
];

/** Gym exercise lists per split day, most important first so shorter sessions keep the core. */
const SPLIT_DAYS: Record<Exclude<SplitKind, 'full'>, { id: string; title: string; list: Exercise[] }[]> = {
  split3: [
    { id: 'A', title: 'A: חזה ויד אחורית', list: [ex('לחיצת חזה במוט', 4, '6 עד 8'), ex('מקבילים או לחיצת חזה צרה', 3, '8 עד 10'), ex('לחיצת חזה בשיפוע במשקולות', 3, '8 עד 10'), ex('פשיטת מרפקים בכבל', 3, '12'), ex('פרפר בכבלים', 3, '12'), ex('פשיטת מרפקים מעל הראש', 2, '12')] },
    { id: 'B', title: 'B: גב ויד קדמית', list: [ex('מתח או פולי עליון', 4, '8'), ex('כפיפת מרפקים במוט', 3, '10'), ex('חתירה במוט', 4, '8'), ex('כפיפת פטישים', 3, '12'), ex('חתירה בכבל בישיבה', 3, '10'), ex('פייס פול', 3, '15')] },
    { id: 'C', title: 'C: רגליים וכתפיים', list: [ex('סקוואט', 4, '6 עד 8'), ex('לחיצת כתפיים במשקולות', 3, '8 עד 10'), ex('דדליפט רומני', 3, '8'), ex('הרחקה לצדדים', 3, '12 עד 15'), ex('לחיצת רגליים', 3, '10'), ex('תאומים', 3, '15')] },
  ],
  ppl: [
    { id: 'push', title: 'דחיפה: חזה, כתפיים ויד אחורית', list: [ex('לחיצת חזה במוט', 4, '6 עד 8'), ex('לחיצת כתפיים במשקולות', 3, '8 עד 10'), ex('לחיצת חזה בשיפוע במשקולות', 3, '8 עד 10'), ex('פשיטת מרפקים בכבל', 3, '12'), ex('הרחקה לצדדים', 3, '12 עד 15'), ex('פרפר בכבלים', 3, '12')] },
    { id: 'pull', title: 'משיכה: גב ויד קדמית', list: [ex('מתח או פולי עליון', 4, '8'), ex('חתירה במוט', 4, '8'), ex('כפיפת מרפקים במוט', 3, '10'), ex('פייס פול', 3, '15'), ex('חתירה בכבל בישיבה', 3, '10'), ex('כפיפת פטישים', 3, '12')] },
    { id: 'legs', title: 'רגליים', list: [ex('סקוואט', 4, '6 עד 8'), ex('דדליפט רומני', 3, '8'), ex('לחיצת רגליים', 3, '10'), ex('תאומים', 3, '15'), ex('לאנג׳ים', 2, '10 לכל רגל'), ex('כפיפת ברכיים במכונה', 3, '12')] },
  ],
  upper_lower: [
    { id: 'upper', title: 'פלג גוף עליון', list: [ex('לחיצת חזה במוט', 4, '6 עד 8'), ex('חתירה במוט', 4, '8'), ex('לחיצת כתפיים במשקולות', 3, '8 עד 10'), ex('מתח או פולי עליון', 3, '10'), ex('פשיטת מרפקים בכבל', 2, '12'), ex('כפיפת מרפקים במוט', 2, '12')] },
    { id: 'lower', title: 'פלג גוף תחתון', list: [ex('סקוואט', 4, '6 עד 8'), ex('דדליפט רומני', 3, '8'), ex('לחיצת רגליים', 3, '10'), ex('לאנג׳ים', 2, '10 לכל רגל'), ex('תאומים', 3, '15'), ex('כפיפת ברכיים במכונה', 3, '12')] },
  ],
};

/** How many main exercises fit: about 9 minutes each, after about 6 minutes per finisher. */
const mainCount = (minutes: number, finishers: number) => Math.max(3, Math.min(6, Math.round((minutes - finishers * 6) / 9)));

function finishers(p: Profile, i: number): Exercise[] {
  const out: Exercise[] = [];
  if (p.rope) {
    out.push(p.chronic?.length ? ex('הליכה מהירה, דופק מתון', 1, '8 דקות') : ex('קפיצות חבל, אינטרוולים', 1, p.sessionMinutes >= 60 ? '8 דקות' : '5 דקות'));
  }
  if (p.abs) out.push(...ABS_PAIRS[i % ABS_PAIRS.length]);
  return out;
}

// No choice saved: the recommendation, which is also what the settings show as chosen
export const effectiveSplit = (p: Profile): SplitKind => {
  const s = p.split ?? recommendSplit(p).split;
  if (s === 'full' || p.trainPlace !== 'gym') return 'full';
  const min = SPLITS.find((x) => x.key === s)!.minDays;
  return p.slots.length >= min ? s : 'full';
};

export interface EditableSession {
  id: string;
  title: string;
  key: string;
  minutes: number;
  /** Minutes the finishers (rope, abs) take from the session */
  finisherMinutes: number;
  recommended: Exercise[];
  picked?: string[];
}

/** The sessions whose moves can be picked, with what the coach recommends for each */
export function editableSessions(p: Profile): EditableSession[] {
  const split = effectiveSplit(p);
  const fin = (p.rope ? 1 : 0) + (p.abs ? 1 : 0);
  const base = { minutes: p.sessionMinutes, finisherMinutes: fin * 6 };
  const days: { id: string; title: string; list: Exercise[] }[] =
    split !== 'full'
      ? SPLIT_DAYS[split].map((d) => ({ ...d, list: d.list.slice(0, mainCount(p.sessionMinutes, fin)) }))
      : (() => {
          const lib = library(p);
          return [
            { id: 'A', title: 'גוף מלא A', list: lib.A },
            { id: 'B', title: 'גוף מלא B', list: lib.B },
          ];
        })();
  return days.map((d) => {
    const key = pickKey(split, p.trainPlace, d.id);
    return { ...base, id: d.id, title: d.title, key, recommended: d.list, picked: p.picks?.[key] };
  });
}

/** A session's main moves: the user's picks when there are any, else the recommendation */
function mainMoves(p: Profile, s: EditableSession): Exercise[] {
  if (!s.picked?.length) return s.recommended;
  const list = exercisesOf(s.picked, checklistOf(s.recommended, gearFor(p.trainPlace, p.homeEquipment)));
  return list.length ? list : s.recommended;
}

function buildSessions(p: Profile): Record<Session['id'], Session> {
  const split = effectiveSplit(p);
  const editable = editableSessions(p);
  if (split !== 'full') {
    return Object.fromEntries(
      editable.map((d, i) => [d.id, { id: d.id, title: d.title, minutes: p.sessionMinutes, exercises: [...adapt(mainMoves(p, d), p), ...finishers(p, i)] }]),
    );
  }
  const full = buildFullBody(p);
  // Finishers on full body: rope on A and B (F already ends with it), abs on all three
  const add = (id: string, extra: Exercise[]) => (full[id] = { ...full[id], exercises: [...full[id].exercises, ...extra] });
  if (p.rope && !p.chronic?.length) ['A', 'B'].forEach((id) => add(id, [ex('קפיצות חבל, אינטרוולים', 1, '5 דקות')]));
  if (p.abs) (['A', 'B', 'F'] as const).forEach((id, i) => add(id, ABS_PAIRS[(i + 1) % ABS_PAIRS.length]));
  return full;
}

function buildFullBody(p: Profile): Record<Session['id'], Session> {
  const [eA, eB] = editableSessions(p);
  const A = adapt(mainMoves(p, eA), p);
  const B = adapt(mainMoves(p, eB), p);
  const long = Math.min(75, p.sessionMinutes + 15);
  // The long session: the first half of A and B with heavier sets, plus conditioning
  const F = [
    ...A.slice(0, 2).map((e) => ({ ...e, sets: e.sets + 1, reps: /^\d+$/.test(e.reps) ? String(Math.max(5, Number(e.reps) - 2)) : e.reps })),
    ...B.slice(0, 2),
    p.chronic?.length
      ? ex('הליכה מהירה, דופק מתון', 1, '10 דקות')
      : p.trainPlace === 'outdoor'
        ? ex('ריצה, אינטרוולים', 1, '10 דקות')
        : ex('חבל, אינטרוולים', 1, '8 דקות'),
  ];
  return {
    A: { id: 'A', title: 'גוף מלא A', minutes: p.sessionMinutes, exercises: p.trainPlace === 'outdoor' ? [ex('ריצה קלה', 1, '15 דקות'), ...A] : A },
    B: { id: 'B', title: 'גוף מלא B', minutes: p.sessionMinutes, exercises: p.trainPlace === 'outdoor' ? [ex('ריצה קלה', 1, '15 דקות'), ...B] : B },
    F: { id: 'F', title: 'האימון המרכזי', minutes: long, exercises: F },
  };
}

function buildPlan(p: Profile): PlannedWorkout[] {
  const slots = [...p.slots].sort((a, b) => a.day - b.day || a.time - b.time);
  const split = effectiveSplit(p);
  if (split !== 'full') {
    const ids = SPLIT_DAYS[split].map((d) => d.id);
    return slots.map((s, i) => ({ day: s.day, hour: Math.floor(s.time / 60), minute: s.time % 60, session: s.session && ids.includes(s.session) ? s.session : ids[i % ids.length] }));
  }
  // The weekend morning slot, if any, becomes the long session
  const weekend = p.weekendDays?.length ? p.weekendDays : defaultWeekend();
  const longIdx = p.sessionMinutes >= 45 ? slots.findIndex((s) => weekend.includes(s.day) && s.time < 12 * 60) : -1;
  let alt = 0;
  return slots.map((s, i) => ({
    day: s.day,
    hour: Math.floor(s.time / 60),
    minute: s.time % 60,
    session: s.session && ['A', 'B', 'F'].includes(s.session) ? s.session : i === longIdx ? 'F' : alt++ % 2 === 0 ? 'A' : 'B',
  }));
}

export function derive(input: Profile): Derived {
  // Under 18 or under a healthy weight there is no deficit, whatever was chosen
  const p: Profile = { ...input, goal: safeGoal(input) };
  const blocked = p.goal !== input.goal;
  const bmr = bmrMifflin(p);
  const workouts = p.slots.length;
  const maintenance = bmr * activityFactor(workouts, p.workLoad);
  const floor = bmr * 1.05;
  const calories = round(Math.max(floor, maintenance + CALORIE_DELTA[p.goal][p.pace]), 25);
  const proteinG = round(p.weightKg * PROTEIN_PER_KG[p.goal], 5);
  const weeklyRateKg = WEEKLY_RATE[p.goal][p.pace];
  const toTarget = p.targetWeightKg ? Math.abs(p.weightKg - p.targetWeightKg) : 0;
  const weeksToTarget = p.targetWeightKg && weeklyRateKg > 0 ? Math.ceil(toTarget / weeklyRateKg) : null;

  const notes: string[] = [];
  if (blocked) notes.push(blockText(deficitBlock(input)) ?? 'המטרה הוחלפה בשמירה על המשקל.');
  if (p.medicalLimit) notes.push('ציינת מגבלה רפואית. מומלץ לעבור על התוכנית עם הרופא לפני שמתחילים.');
  if (p.experience === 'returning') notes.push('חזרה אחרי הפסקה: שבועיים ראשונים ב60 עד 70 אחוז מהמשקלים שהרמת בעבר.');
  if (p.experience === 'beginner') notes.push('מתחילים: מתמקדים בטכניקה, עם סט פחות בכל תרגיל בשבועות הראשונים.');
  if (p.pains.length) notes.push('תרגילים שמעמיסים על האזורים שציינת הוחלפו בחלופות. כאב חד בזמן תרגיל: עוצרים.');
  if (p.nightWakeups) notes.push('עם התעוררויות בלילה, יעד השינה הוא סך כל השינה. גם תנומה קצרה נחשבת.');
  if (calories <= round(floor, 25) && CALORIE_DELTA[p.goal][p.pace] < 0) notes.push('הגירעון הוגבל כדי לא לרדת מתחת לחילוף החומרים הבסיסי.');
  if (p.chronic?.length) notes.push('ציינת מצב רפואי. האימונים יהיו בעצימות מתונה, בלי אינטרוולים. לפני שמתחילים, אישור מהרופא.');
  if (p.shiftWork) notes.push('עבודה במשמרות: שעות השקט ושומר הלילה כבויים, כי הלילה שלך לא קבוע.');
  if (p.relationship === 'separated' && p.kidsDays?.length) notes.push('בימים שהילדים אצלך המאמן יציע אימון קצר בבית במקום חדר כושר, אם צריך.');
  if (workouts === 0) notes.push('לא נבחרו ימי אימון. המאמן יתמקד בתזונה, צעדים ושינה.');

  return {
    bmr: Math.round(bmr),
    maintenance: round(maintenance, 25),
    goals: { calories, proteinG, steps: p.workLoad === 'physical' ? 10000 : 8000, sleepHours: 7, workoutsPerWeek: workouts },
    plan: buildPlan(p),
    sessions: buildSessions(p),
    minimum: [ex('סקוואטים', 3, '15'), ex('שכיבות סמיכה', 3, '10'), ex('לאנג׳ים', 2, '10 לכל רגל'), ex('פלאנק', 2, '30 שניות')].map((e) =>
      p.pains.includes('knees') && /סקוואט|לאנג/.test(e.name) ? { ...e, name: 'גשר ישבן' } : e,
    ),
    weeklyRateKg,
    // 'Like any day': no weekend at all
    weekend: p.weekendStyle === 'same' ? [] : p.weekendDays?.length ? p.weekendDays : defaultWeekend(),
    weekendStyle: p.weekendStyle ?? 'normal',
    weeksToTarget,
    notes,
  };
}

/** Makes the derived plan the one the whole app uses (screens, coach, reminders). */
export function applyDerived(d: Derived) {
  Object.assign(GOALS, d.goals);
  setWeekend(d.weekend);
  WEEKEND_MODE.style = d.weekendStyle;
  WEEKLY_PLAN.splice(0, WEEKLY_PLAN.length, ...d.plan);
  for (const k of Object.keys(SESSIONS)) delete SESSIONS[k];
  Object.assign(SESSIONS, d.sessions);
  MINIMUM_WORKOUT.splice(0, MINIMUM_WORKOUT.length, ...d.minimum);
}
