import { daysBack, LIGHT_IDS, onVacation } from './vacation';
// Pure decision logic: given the situation, which messages should the coach send?
// No I/O here, so every rule can be tested with plain inputs.
import { GOALS, MINIMUM_WORKOUT, pad2, planThisWeek, sessionOf, weekendStart, caloriesFor } from '../config/goals';
import { judgeMeal, MealLike, plateMeal, plates, SLOT_BY_ID, slotBudgets, slotOf } from '../nutrition/meals';
import { drinkNow, waterBehind, waterExpectedByNow, waterProgress, waterText } from '../nutrition/water';
import { graceEnd, nightMinutes, OUTING_LABEL, OUTING_TIP, OutingPlan } from './outing';
import { CoachPrefs, hhmm, NagLevel, PlaceId } from './store';

import { t } from '../i18n';
import { moveName } from '../i18n/moves';
/** 1 = sent at every level, 2 = normal and close, 3 = close only */
export type Priority = 1 | 2 | 3;

export interface CoachMessage {
  id: string;
  priority: Priority;
  title: string;
  body: string;
  /** Overrides the default importance for this one message */
  level?: Importance;
  /** Meal feedback: what was eaten, so several items can be told as one meal */
  meal?: { name: string; kcal: number; protein: number; good: boolean };
  /** Other message ids folded into this one */
  also?: string[];
}

export type Importance = 'urgent' | 'normal' | 'info';

// What must not be missed: it stands out with sound, vibration and a pop-up
const URGENT = new Set([
  'workout_now', 'missed_workout', 'go_to_sleep', 'hc_broken', 'outing_prep', 'outing_workout', 'week_behind', 'long_break',
]);
// Encouragement and summaries: silent, only in the list
const INFO = new Set(['gym_arrive', 'status']);

/** How loudly a message arrives. Bad meal feedback is urgent; good feedback is quiet. */
export function importanceOf(m: CoachMessage): Importance {
  if (m.level) return m.level;
  if (/^meal_\d+$/.test(m.id)) return m.priority === 1 ? 'urgent' : 'info';
  if (/^status_\d+$/.test(m.id)) return 'normal';
  const base = baseId(m.id);
  if (URGENT.has(base)) return 'urgent';
  if (INFO.has(base)) return 'info';
  return 'normal';
}

export interface CoachContext {
  now: Date;
  place: PlaceId | null;
  event?: { type: 'enter' | 'exit'; place: PlaceId };
  gymToday: boolean;
  /** A watch, or a gym place the phone knows: a missed workout can be told, not only asked */
  canDetect?: boolean;
  meals: number;
  lastMealAt: Date | null;
  kcal: number;
  protein: number;
  steps: number;
  sleepMinutes: number | null;
  workoutLogged: boolean;
  prefs: CoachPrefs;
  /** Today's meals, oldest first */
  mealList?: MealLike[];
  /** Meal slots he marked "ate, did not log" today */
  unloggedSlots?: string[];
  /** Four weeks since the last progress checkpoint */
  checkpointDue?: boolean;
  /** Days since the last waist measurement; null when never */
  waistDaysAgo?: number | null;
  vegetarian?: boolean;
  /** Everything below is optional: undefined means unknown, and the related rules stay silent */
  hcOk?: boolean;
  weighedToday?: boolean;
  daysSinceWeigh?: number | null;
  workoutDaysThisWeek?: number;
  daysSinceWorkout?: number | null;
  lastStepsAt?: Date | null;
  waterMl?: number | null;
  waterTarget?: number;
  /** He is using the phone right now: opened the app or pressed "run now" */
  active?: boolean;
  /** He just unlocked the phone (the morning listener): a nudge can come again sooner */
  unlocked?: boolean;
  /** Steps in the last 30 minutes */
  recentSteps?: number;
  /** He pressed "I know, it's fine" tonight */
  nightAcked?: boolean;
  /** Last night was marked as broken (baby, kids, or waking up) */
  brokenNight?: boolean;
  /** How to call that night, from the family questionnaire */
  brokenNightLabel?: string;
  // From the user file
  whyNow?: string;
  stopReason?: 'work' | 'family' | 'injury' | 'motivation' | 'never';
  kidsToday?: boolean;
  hardTimes?: ('evening' | 'stress' | 'boredom' | 'weekend')[];
  chronicCare?: boolean;
  /** Tonight's plan, if he said he is going out */
  outingPlan?: OutingPlan;
  /** Last night he was out */
  outingLastNight?: boolean;
  /** The apps this user actually has, for the wording */
  activityAppName?: string | null;
  foodAppName?: string | null;
  hasWatch?: boolean;
}

/**
 * repeat: whether a nag that is still unresolved may come back later the same day
 * (ids of the form base@bucket). Without it each base id is sent once a day.
 */
export const LEVEL_RULES: Record<NagLevel, { maxPriority: Priority; maxPerDay: number; perRun: number; repeat: boolean }> = {
  quiet: { maxPriority: 1, maxPerDay: 3, perRun: 1, repeat: false },
  normal: { maxPriority: 2, maxPerDay: 6, perRun: 2, repeat: false },
  close: { maxPriority: 3, maxPerDay: 12, perRun: 2, repeat: true },
  drill: { maxPriority: 3, maxPerDay: 22, perRun: 3, repeat: true },
};

export const baseId = (id: string) => id.split('@')[0];


/** Planned sessions whose time (plus an hour) has already passed this week, Sunday start. */
export function plannedSoFar(now: Date): number {
  const m = minutesOfDayOf(now);
  return planThisWeek(now).filter((w) => w.day < now.getDay() || (w.day === now.getDay() && w.hour * 60 + w.minute + 60 <= m)).length;
}

const dayOfYear = (d: Date) => Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
const minutesOfDayOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
const between = (m: number, from: number, to: number) => m >= from && m < to;
const at = (h: number, m = 0) => h * 60 + m;

export function isQuietTime(now: Date, prefs: CoachPrefs): boolean {
  const m = minutesOfDay(now);
  const { quietStart: s, quietEnd: e } = prefs;
  return s <= e ? between(m, s, e) : m >= s || m < e;
}

function todaysPlan(now: Date) {
  const w = planThisWeek(now).find((p) => p.day === now.getDay());
  return w ? { ...w, session: sessionOf(w.session), start: at(w.hour, w.minute) } : null;
}

export function evaluate(c: CoachContext): CoachMessage[] {
  const out: CoachMessage[] = [];
  const m = minutesOfDay(c.now);
  const trained = c.workoutLogged || c.gymToday;
  // The week's target already reached (workouts moved to other days count too): no push for
  // the sessions left in the plan, they are a bonus, not a debt
  const weekDone = c.workoutDaysThisWeek !== undefined && GOALS.workoutsPerWeek > 0 && c.workoutDaysThisWeek >= GOALS.workoutsPerWeek;
  const plan = weekDone && !trained ? null : todaysPlan(c.now);
  const proteinLeft = Math.max(0, Math.round(GOALS.proteinG - c.protein));

  // The first morning back from a vacation: what the scale will say, before it says it
  if (daysBack(c.now, c.prefs.vacation) === 1 && between(m, c.prefs.wakeTime + 15, at(12))) {
    out.push({
      id: 'vacation_back',
      priority: 1,
      title: t('ברוך השב', 'Welcome back'),
      body: t('היום שקילה. המספר יהיה כנראה גבוה ב 1 עד 2 ק"ג, בעיקר מים ומלח מהחופשה, וזה יורד תוך כמה ימים. האימון הראשון: הגרסה הקצרה. חוזרים לאט, אבל חוזרים.', 'Weigh-in today. The number will probably be 1 to 2 kg higher, mostly water and salt from the trip, and it drops within a few days. First workout: the short version. Coming back slowly, but coming back.'),
    });
  }

  // ---------- Places: arriving and leaving, each once a day, with something useful to say ----------
  const places = c.prefs.placeMessages !== false;
  const pick = (lines: string[]) => lines[dayOfYear(c.now) % lines.length];

  // Arriving at the gym
  if (c.event?.type === 'enter' && c.event.place === 'gym') {
    const session = plan?.session ?? sessionOf('A');
    out.push({
      id: 'gym_arrive',
      priority: 1,
      title: t(`${pick(['בהצלחה', 'קדימה, בכל הכוח', 'יאללה, זה הזמן'])}: ${session.title}`, `${pick(['Good luck', 'Go, full power', 'Come on, this is the time'])}: ${session.title}`),
      body: session.exercises.map((e) => `${e.name} ${e.sets}×${e.reps}`).join(' · ') + (c.chronicCare ? t('. דופק מתון, בלי להגיע לקוצר נשימה.', '. A moderate heart rate, without getting out of breath.') : ''),
    });
  }

  // Leaving the gym: the workout is in, now protein
  if (places && c.event?.type === 'exit' && c.event.place === 'gym' && c.gymToday) {
    out.push({
      id: 'gym_leave',
      priority: 2,
      level: 'info',
      title: pick([t('כל הכבוד, האימון בפנים', 'Well done, the workout is in'), t('עוד אימון בבנק', 'Another workout in the bank'), t('עשית את זה', 'You did it')]),
      body: t(`רשמתי את האימון. עכשיו חלבון בשעה הקרובה${proteinLeft > 0 ? `, חסרים ${proteinLeft} גרם להיום` : ''}, וכוס מים גדולה.`, `I logged the workout. Now protein within the hour${proteinLeft > 0 ? `, ${proteinLeft} grams still to go today` : ''}, and a big glass of water.`),
    });
  }

  // Leaving home in the morning
  if (places && c.event?.type === 'exit' && c.event.place === 'home' && m < at(12)) {
    const noWeigh = c.weighedToday === false;
    out.push({
      id: 'place_home_out',
      priority: 2,
      level: noWeigh ? 'normal' : 'info',
      title: noWeigh ? t('יצאת בלי להישקל', 'You left without weighing in') : pick([t('יום טוב', 'Have a good day'), t('יוצאים לדרך', 'Off we go'), t('בוקר של אלופים', 'A champion\'s morning')]),
      body:
        (noWeigh ? t('מחר שקילה לפני שיוצאים, זה לוקח 10 שניות. ', 'Tomorrow, weigh in before you leave, it takes 10 seconds. ') : t('נשקלת, מצוין. ', 'Weighed in, excellent. ')) +
        (plan && !trained ? t(`היום ${plan.session.title} ב${pad2(plan.hour)}:${pad2(plan.minute)}.`, `Today ${plan.session.title} at ${pad2(plan.hour)}:${pad2(plan.minute)}.`) : t('קח בקבוק מים לדרך.', 'Take a bottle of water with you.')),
    });
  }

  // Arriving at work
  if (places && c.event?.type === 'enter' && c.event.place === 'office' && m < at(14)) {
    const lunch = c.prefs.mealSlots.includes('lunch') ? t(` ארוחת צהריים בין ${hhmm(SLOT_BY_ID.lunch.from)} ל${hhmm(SLOT_BY_ID.lunch.to)}, עם חלבון.`, ` Lunch between ${hhmm(SLOT_BY_ID.lunch.from)} and ${hhmm(SLOT_BY_ID.lunch.to)}, with protein.`) : '';
    const water = (c.prefs.waterContainer ?? 250) === 250 ? t('כוס מים עכשיו, ועוד אחת כל שעה.', 'A glass of water now, and another every hour.') : t('מלא בקבוק עכשיו, וסיים אותו עד 11:00.', 'Fill a bottle now, and finish it by 11:00.');
    out.push({
      id: 'place_office_in',
      priority: 2,
      level: c.weighedToday === false ? 'normal' : 'info',
      title: c.weighedToday === false ? t('הגעת לעבודה, בלי שקילה', 'At work, without a weigh-in') : pick([t('הגעת לעבודה', 'You got to work'), t('יום עבודה טוב', 'Have a good workday'), t('בעבודה', 'At work')]),
      body: t(`${c.weighedToday === false ? 'מחר שקילה לפני שיוצאים. ' : ''}${water}${lunch}`, `${c.weighedToday === false ? 'Tomorrow, weigh in before you leave. ' : ''}${water}${lunch}`),
    });
  }

  // Leaving work: what is still open today
  if (places && c.event?.type === 'exit' && c.event.place === 'office' && m >= at(13)) {
    const parts: string[] = [];
    if (c.meals > 0) parts.push(t(`נשארו ${Math.max(0, Math.round(caloriesFor(c.now) - c.kcal))} קלוריות ו${proteinLeft} גרם חלבון`, `${Math.max(0, Math.round(caloriesFor(c.now) - c.kcal))} calories and ${proteinLeft} grams of protein left`));
    if (plan && !trained) parts.push(t(`${plan.session.title} ב${pad2(plan.hour)}:${pad2(plan.minute)}`, `${plan.session.title} at ${pad2(plan.hour)}:${pad2(plan.minute)}`));
    out.push({
      id: 'place_office_out',
      priority: 2,
      level: plan && !trained ? 'normal' : 'info',
      title: pick([t('סיימת יום עבודה', 'Workday done'), t('בדרך הביתה', 'On the way home'), t('יום העבודה מאחוריך', 'The workday is behind you')]),
      body: parts.length ? parts.join('. ') + '.' : t('יום טוב. ערב רגוע וארוחת ערב עם חלבון.', 'A good day. A calm evening and a dinner with protein.'),
    });
  }

  // Home after work on an evening workout day
  if (
    c.event?.type === 'enter' &&
    c.event.place === 'home' &&
    plan &&
    plan.start >= at(17) &&
    !trained &&
    between(m, at(16), plan.start - 30)
  ) {
    out.push({
      id: 'home_before_workout',
      priority: 1,
      title: t('הגעת הביתה', 'You got home'),
      body: t(`${plan.session.title} ב${pad2(plan.hour)}:${pad2(plan.minute)}. כדאי לאכול משהו קל עכשיו, לא ארוחה כבדה.`, `${plan.session.title} at ${pad2(plan.hour)}:${pad2(plan.minute)}. Eat something light now, not a heavy meal.`),
    });
  }

  // Home in the evening, when the workout message did not already cover it
  if (
    places &&
    c.event?.type === 'enter' &&
    c.event.place === 'home' &&
    m >= at(15) &&
    !out.some((x) => x.id === 'home_before_workout')
  ) {
    const parts: string[] = [];
    const o = c.outingPlan;
    if (o && o.leaveAt > m) {
      // Going out tonight: no dinner plan and no bedtime, the evening belongs to the outing
      parts.push(t(`יוצא ב${hhmm(o.leaveAt)}: ${OUTING_LABEL[o.kind]}`, `Going out at ${hhmm(o.leaveAt)}: ${OUTING_LABEL[o.kind]}`));
      if (proteinLeft > 20) parts.push(t(`משהו קטן עם חלבון לפני, חסרים ${proteinLeft} גרם`, `Something small with protein before, ${proteinLeft} grams to go`));
    } else {
      if (c.meals > 0 && proteinLeft > 20) parts.push(t(`לארוחת ערב: חלבון, חסרים ${proteinLeft} גרם`, `For dinner: protein, ${proteinLeft} grams to go`));
      else parts.push(t('ארוחת ערב טובה, בלי נשנושים אחריה', 'A good dinner, no snacking after it'));
      if (plan && !trained && plan.start > m) parts.push(t(`אימון ב${pad2(plan.hour)}:${pad2(plan.minute)}`, `Workout at ${pad2(plan.hour)}:${pad2(plan.minute)}`));
      if (!o) parts.push(t(`לישון עד ${hhmm(c.prefs.bedTime)}`, `In bed by ${hhmm(c.prefs.bedTime)}`));
    }
    out.push({
      id: 'place_home_in',
      priority: 2,
      level: 'info',
      title: pick([t('הגעת הביתה', 'You got home'), t('ערב טוב', 'Good evening'), t('בבית', 'At home')]),
      body: parts.join('. ') + '.',
    });
  }

  // Leaving the office with protein far behind
  // The general "left work" message already says what is missing; this one is for when those are off
  if (!places && c.event?.type === 'exit' && c.event.place === 'office' && m >= at(15, 30) && c.meals > 0 && c.protein < GOALS.proteinG * 0.5) {
    out.push({
      id: 'leave_office_protein',
      priority: 2,
      title: t('בדרך הביתה', 'On the way home'),
      body: t(`חסרים ${proteinLeft} גרם חלבון. ארוחת ערב עם עוף, ביצים, קוטג' או טונה תסגור את הפער.`, `${proteinLeft} grams of protein to go. A dinner with chicken, eggs, cottage cheese or tuna closes the gap.`),
    });
  }

  // Protein check in the evening
  if (c.meals > 0 && between(m, at(18), at(20)) && c.protein < GOALS.proteinG * 0.6) {
    out.push({
      id: 'protein_evening',
      priority: 2,
      title: t(`חסרים ${proteinLeft} גרם חלבון`, `${proteinLeft} grams of protein to go`),
      body: t('כדאי שארוחת הערב תהיה עשירה בחלבון.', 'Make dinner rich in protein.'),
    });
  }

  // Calories at the end of the day, only when meals were logged
  if (c.meals > 0 && between(m, at(20), at(22)) && c.kcal > caloriesFor(c.now) + 150) {
    out.push({
      id: 'evening_over',
      priority: 1,
      title: t('עברת את יעד הקלוריות', 'You passed the calorie goal'),
      body: t(`${Math.round(c.kcal - caloriesFor(c.now))} קלוריות מעל היעד. יום אחד לא משנה מגמה; מחר חוזרים לקצב.`, `${Math.round(c.kcal - caloriesFor(c.now))} calories over the goal. One day does not change a trend; tomorrow we are back on pace.`),
    });
  }
  if (c.meals >= 2 && between(m, at(20), at(21, 30)) && c.kcal < caloriesFor(c.now) * 0.6) {
    out.push({
      id: 'evening_under',
      priority: 2,
      title: t('אכלת מעט היום', 'You ate little today'),
      body: t(`${Math.round(c.kcal)} מתוך ${caloriesFor(c.now)} קלוריות. גירעון גדול מדי פוגע בשריר. כדאי ארוחה קטנה עם חלבון.`, `${Math.round(c.kcal)} of ${caloriesFor(c.now)} calories. Too big a deficit hurts muscle. Have a small meal with protein.`),
    });
  }

  // Planned evening workout that did not happen
  // Not while he is at the gym. With nothing that could see the workout, it is a question, never a verdict.
  if (plan && !trained && c.place !== 'gym' && between(m, plan.start + 45, plan.start + (plan.start >= at(17) ? 105 : 180))) {
    out.push(
      c.canDetect === false
        ? {
            id: 'missed_workout',
            priority: 1,
            title: t('התאמנת היום?', 'Did you train today?'),
            body: t(`אם כן, לחץ "התאמנתי". אם עוד לא: אפשר להזיז לשעה אחרת או למחר, או 10 דקות בבית: ${MINIMUM_WORKOUT.map((e) => e.name).join(', ')}.`, `If so, tap "I trained". If not yet: you can move it to another time or to tomorrow, or 10 minutes at home: ${MINIMUM_WORKOUT.map((e) => moveName(e.name)).join(', ')}.`),
          }
        : {
            id: 'missed_workout',
            priority: 1,
            title: t('נראה שעוד לא התאמנת', 'Looks like you have not trained yet'),
            body: t(`להזיז לשעה מאוחרת יותר, למחר, או לוותר היום? ואם כן התאמנת, לחץ "התאמנתי". אפשר גם 10 דקות בבית: ${MINIMUM_WORKOUT.map((e) => e.name).join(', ')}.`, `Move it later, to tomorrow, or skip today? And if you did train, tap "I trained". There is also 10 minutes at home: ${MINIMUM_WORKOUT.map((e) => moveName(e.name)).join(', ')}.`),
          },
    );
  }

  // Short night
  if (c.sleepMinutes !== null && c.sleepMinutes < 360 && between(m, at(7), at(11))) {
    const h = `${Math.floor(c.sleepMinutes / 60)}:${pad2(Math.round(c.sleepMinutes % 60))}`;
    out.push(
      c.outingLastNight
        ? { id: 'short_sleep', priority: 2, title: t(`לילה ארוך, ${h} שעות`, `A long night, ${h} hours`), body: t('היום מים, חלבון והליכה. אימון רק אם הוא קל.', 'Today water, protein and a walk. A workout only if it is light.') }
        : c.brokenNight
        ? {
            id: 'short_sleep',
            priority: 2,
            title: t(`${c.brokenNightLabel ?? 'לילה קטוע'}, ${h} שעות`, `${c.brokenNightLabel ?? 'A broken night'}, ${h} hours`),
            body: plan
              ? t('אימון קל היום: 2 סטים במקום 3. מים וחלבון חשובים היום יותר מתמיד.', 'A light workout today: 2 sets instead of 3. Water and protein matter more than ever today.')
              : t('אם אפשר, נמנום של 20 דקות בצהריים. הלילה במיטה מוקדם.', 'If you can, a 20 minute nap at midday. Early to bed tonight.'),
          }
        : plan
          ? { id: 'short_sleep', priority: 1, title: t(`ישנת ${h} שעות`, `You slept ${h} hours`), body: t('היום אימון קל: 2 סטים במקום 3, ובלי אינטרוולים.', 'A light workout today: 2 sets instead of 3, and no intervals.') }
          : { id: 'short_sleep', priority: 3, title: t(`ישנת ${h} שעות`, `You slept ${h} hours`), body: t('נסה ללכת לישון מוקדם יותר הלילה.', 'Try to go to bed earlier tonight.') },
    );
  }

  // Bedtime: half an hour before the bedtime set in the profile
  const remind = (c.prefs.bedTime - 30 + 1440) % 1440;
  // Not on a night out: the outing has its own return time and grace
  if (!c.outingPlan && between(m, remind, remind + 40)) {
    out.push({
      id: 'bedtime',
      priority: 2,
      title: t('זמן להתארגן לשינה', 'Time to get ready for bed'),
      body: t(`במיטה ב${hhmm(c.prefs.bedTime)} נותן ${GOALS.sleepHours} שעות עד ${hhmm(c.prefs.wakeTime)}.`, `In bed at ${hhmm(c.prefs.bedTime)} gives ${GOALS.sleepHours} hours until ${hhmm(c.prefs.wakeTime)}.`),
    });
  }

  // Low steps in the afternoon
  if (between(m, at(16), at(18)) && c.steps < GOALS.steps * 0.4) {
    out.push({
      id: 'steps_afternoon',
      priority: 3,
      title: t(`${Math.round(c.steps)} צעדים עד עכשיו`, `${Math.round(c.steps)} steps so far`),
      body: t('הליכה של 15 דקות תוסיף כ1,500 צעדים.', 'A 15 minute walk adds about 1,500 steps.'),
    });
  }

  // Meal reminders: only for meals the user eats, and only when nothing was logged in that slot
  const meals = c.mealList ?? [];
  if (c.prefs.mealReminders) {
    for (const id of c.prefs.mealSlots) {
      const slot = SLOT_BY_ID[id];
      // On an evening workout day dinner comes after training, not before it
      const eveningWorkout = id === 'dinner' && plan && plan.start >= at(17) && !c.workoutLogged;
      const remindAt = eveningWorkout ? plan!.start + plan!.session.minutes + 20 : slot.remindAt;
      const end = eveningWorkout || slot.to < slot.remindAt ? remindAt + 90 : Math.min(slot.to, remindAt + 90);
      if (!between(m, remindAt, end) || c.place === 'gym') continue;
      if (meals.some((x) => slotOf(x.time) === id)) continue;
      if (c.unloggedSlots?.includes(id)) continue;
      const atOffice = c.place === 'office' && id === 'lunch';
      out.push({
        id: `meal_reminder_${id}`,
        priority: 2,
        title: atOffice ? t('אל תשכח לאכול', 'Don\'t forget to eat') : `${slot.label}?`,
        body: t(`${atOffice ? 'אתה במשרד ועוד לא נרשמה ארוחת צהריים. ' : 'עוד לא נרשמה. '}${MEAL_IDEAS(id, !!c.vegetarian)} ${c.foodAppName === 'Zepp' ? 'צלם ב Zepp' : c.foodAppName ? `רשום ב ${c.foodAppName}` : 'רשום באפליקציית האוכל'} כשאתה אוכל.`, `${atOffice ? 'You are at the office and no lunch is logged yet. ' : 'Not logged yet. '}${MEAL_IDEAS(id, !!c.vegetarian)} ${c.foodAppName === 'Zepp' ? 'Snap it in Zepp' : c.foodAppName ? `Log it in ${c.foodAppName}` : 'Log it in the food app'} when you eat.`),
      });
    }
  }

  // A small meal 1 to 2 hours before an evening workout, if the last meal was long ago
  if (plan && plan.start >= at(17) && !trained && between(m, plan.start - 120, plan.start - 60)) {
    const last = meals[meals.length - 1];
    const sinceLast = last ? m - minutesOfDay(last.time) : Infinity;
    if (sinceLast > 180) {
      out.push({
        id: 'pre_workout_snack',
        priority: 2,
        title: t('ביניים לפני האימון', 'A snack before the workout'),
        body: t(`האימון ב${pad2(plan.hour)}:${pad2(plan.minute)}. משהו קטן עכשיו, כמו פרי ויוגורט, ייתן אנרגיה בלי כבדות.`, `The workout is at ${pad2(plan.hour)}:${pad2(plan.minute)}. Something small now, like fruit and yogurt, gives energy without heaviness.`),
      });
    }
  }

  // Feedback on each meal logged in the last 3 hours
  if (c.prefs.mealFeedback) {
    const budgets = slotBudgets(caloriesFor(c.now), c.prefs.mealSlots);
    // One message per plate, judged as a whole: granola is fine when it came with the yogurt.
    // A plate that grew gets a new message (the id follows its latest item).
    for (const plate of plates(meals)) {
      const meal = plateMeal(plate);
      const age = c.now.getTime() - meal.time.getTime();
      if (age < 0 || age > 3 * 3600 * 1000) continue;
      const v = judgeMeal(meal, budgets[slotOf(meal.time)]);
      out.push({
        id: `meal_${meal.time.getTime()}`,
        priority: v.good ? 2 : 1,
        title: v.good
          ? v.verdict === 'protein_rich'
            ? t('כל הכבוד', 'Well done')
            : v.verdict === 'light'
              ? t('נשנוש קל', 'A light snack')
              : t('ארוחה מאוזנת', 'A balanced meal')
          : v.verdict === 'sweet'
            ? t('לא בשביל המטרה שלך', 'Not for your goal')
            : t('על הארוחה האחרונה', 'About the last meal'),
        body: v.message,
        meal: { name: meal.name, kcal: meal.kcal, protein: meal.protein, good: v.good },
      });
    }
  }

  // ---------- Accountability: weigh-in, training, data, water ----------
  const bucket = (size: number) => Math.floor(m / size);
  const wake = c.prefs.wakeTime;
  const bed = c.prefs.bedTime < wake ? c.prefs.bedTime + 1440 : c.prefs.bedTime;

  // Weigh-in, every morning until it happens; the first unlock after waking asks at once, and again every half hour
  if (c.weighedToday === false && between(m, c.unlocked ? wake - 30 : wake + 15, at(12))) {
    const d = c.daysSinceWeigh ?? null;
    out.push({
      id: c.unlocked ? `weigh_in@${bucket(40)}` : `weigh_in@${bucket(120)}`,
      priority: 1,
      level: d === null || d >= 2 ? 'urgent' : 'normal',
      title: d === null ? t('אין לי אף שקילה שלך', 'I don\'t have a single weigh-in from you') : d >= 2 ? t(`לא נשקלת ${d} ימים`, `Not weighed for ${d} days`) : t('עוד לא נשקלת היום', 'Not weighed today yet'),
      body: c.outingLastNight
        ? t('אחרי יציאה השקילה לא מייצגת, אבל נשקלים בכל זאת. הרצף חשוב יותר מהמספר.', 'After a night out the weigh-in is not representative, but weigh in anyway. The streak matters more than the number.')
        : t('עלה על המשקל לפני אוכל ושתייה, ולחץ כאן כדי להזין. מיד אחרי זה חצי ליטר מים, לפני הקפה.', 'Step on the scale before food and drink, and tap here to enter it. Right after, half a liter of water, before coffee.'),
    });
  }
  // Right after the weigh-in: half a liter of water before coffee, the body comes out of a night without drinking
  if (c.prefs.waterReminders && c.weighedToday !== false && c.waterMl != null && c.waterMl < 500 && between(m, c.unlocked ? wake - 30 : wake, at(11))) {
    out.push({
      // One id for the unlock and the background check, so the same half hour never sends it twice
      id: `water_morning@${bucket(40)}`,
      priority: 1,
      level: 'urgent',
      title: c.weighedToday ? t('נשקלת. עכשיו מים, לפני הקפה', 'Weighed in. Now water, before coffee') : t('מים לפני הקפה', 'Water before coffee'),
      body: t(`${drinkNow(500, c.prefs.waterContainer)} עכשיו, לפני הקפה והאוכל. הגוף יוצא מלילה שלם בלי שתייה, והקפה רק מייבש עוד. לחץ על הכפתור כשסיימת.`, `${drinkNow(500, c.prefs.waterContainer)} now, before coffee and food. The body comes out of a whole night without drinking, and coffee only dries it more. Tap the button when you are done.`),
    });
  }
  // Every four weeks, Sunday morning after the weigh-in: photos and waist
  if (c.checkpointDue && c.now.getDay() === 0 && c.weighedToday !== false && between(m, wake + 15, at(12))) {
    out.push({
      id: 'checkpoint_due',
      priority: 2,
      title: t('ביקורת 4 שבועות', '4-week check-in'),
      body: t('שתי תמונות באותו מקום ובאותה תאורה כמו בפעם הקודמת, והיקף מותן. 3 דקות. לחץ כאן.', 'Two photos in the same place and light as last time, and your waist. 3 minutes. Tap here.'),
    });
  }
  // Once a week, Sunday morning after the weigh-in, when the checkpoint is not asking for it anyway
  if (!c.checkpointDue && c.waistDaysAgo !== undefined && (c.waistDaysAgo === null || c.waistDaysAgo >= 6) && c.now.getDay() === 0 && c.weighedToday !== false && between(m, wake + 15, at(12))) {
    out.push({
      id: 'waist_week',
      priority: 2,
      title: t('היקף מותניים, 30 שניות', 'Waist, 30 seconds'),
      body: t('סרט מדידה בגובה הטבור, אחרי נשיפה רגילה, צמוד ולא לוחץ. כמו בפעם הקודמת. לחץ כאן כדי לרשום.', 'A tape measure at navel height, after a normal breath out, snug, not tight. As last time. Tap here to log it.'),
    });
  }
  if (c.weighedToday === false && between(m, at(19), at(21))) {
    out.push({ id: 'weigh_tomorrow', priority: 2, title: t('לא נשקלת היום', 'Not weighed today'), body: t('מחר בבוקר, ראשון דבר אחרי השירותים ולפני הקפה.', 'Tomorrow morning, first thing after the toilet and before coffee.') });
  }

  // Training day: tell him in the morning, and push at start time
  if (plan && !trained && plan.start >= at(10) && between(m, wake + 30, Math.min(plan.start - 120, at(11)))) {
    out.push({
      id: 'workout_today',
      priority: 2,
      title: t(`היום אימון ב${pad2(plan.hour)}:${pad2(plan.minute)}`, `Workout today at ${pad2(plan.hour)}:${pad2(plan.minute)}`),
      body:
        t(`${plan.session.title}, ${plan.session.minutes} דקות. תכנן את היום סביבו, זה לא אופציונלי.`, `${plan.session.title}, ${plan.session.minutes} minutes. Plan the day around it, it is not optional.`) +
        (c.kidsToday ? t(' הילדים אצלך היום: אם לא מסתדר, 20 דקות בבית אחרי שהם נרדמים.', ' The kids are with you today: if it does not work out, 20 minutes at home after they fall asleep.') : ''),
    });
  }
  if (plan && !trained && c.place !== 'gym' && c.event?.place !== 'gym' && between(m, plan.start - 15, plan.start + 30)) {
    out.push({
      id: 'workout_now',
      priority: 1,
      title: t('זמן אימון', 'Workout time'),
      body: t(`${plan.session.title} מתחיל ב${pad2(plan.hour)}:${pad2(plan.minute)}. נעליים, בקבוק מים, יוצאים.`, `${plan.session.title} starts at ${pad2(plan.hour)}:${pad2(plan.minute)}. Shoes, a bottle of water, out the door.`),
    });
  }

  // Behind on the week
  if (c.workoutDaysThisWeek !== undefined && between(m, at(12), at(14))) {
    const due = plannedSoFar(c.now);
    if (c.workoutDaysThisWeek < due) {
      const left = planThisWeek(c.now).filter((w) => w.day > c.now.getDay() || (w.day === c.now.getDay() && w.hour * 60 + w.minute > m)).length;
      out.push({
        id: 'week_behind',
        priority: 1,
        title: t(`השבוע ${c.workoutDaysThisWeek} אימונים מתוך ${due} שתוכננו עד עכשיו`, `This week ${c.workoutDaysThisWeek} workouts of ${due} planned so far`),
        body: (left
          ? t(`נשארו ${left} אימונים בתוכנית. כדי להשלים, הוסף אימון קצר ביום פנוי.`, `${left} workouts left in the plan. To catch up, add a short workout on a free day.`)
          : t('לא נשארו אימונים בתוכנית השבוע. אימון בית של 20 דקות היום יציל את השבוע.', 'No workouts left in this week\'s plan. A 20 minute home workout today will save the week.')) + quote(c.whyNow),
      });
    }
  }

  // Long break, on a day with no planned session
  const breakDays = c.daysSinceWorkout === undefined ? undefined : c.daysSinceWorkout ?? 14;
  if (breakDays !== undefined && breakDays >= 3 && !plan && !trained && between(m, at(10), at(20))) {
    out.push({
      id: `long_break@${bucket(240)}`,
      priority: 1,
      title: breakDays >= 14 ? t('שבועיים בלי אימון', 'Two weeks without a workout') : t(`${breakDays} ימים בלי אימון`, `${breakDays} days without a workout`),
      body: t(`${STOP_LINES[c.stopReason ?? 'never'] ?? ''}20 דקות היום עדיפות על כלום: ${MINIMUM_WORKOUT.map((e) => e.name).join(', ')}.${quote(c.whyNow)}`, `${STOP_LINES[c.stopReason ?? 'never'] ?? ''}20 minutes today beats nothing: ${MINIMUM_WORKOUT.map((e) => moveName(e.name)).join(', ')}.${quote(c.whyNow)}`),
    });
  }

  // Data and connections
  if (c.hcOk === false && between(m, at(8), at(22))) {
    out.push({
      id: `hc_broken@${bucket(240)}`,
      priority: 1,
      title: t('אני עיוור: אין חיבור לנתונים', 'I am blind: no data connection'),
      body: t('המאמן לא מצליח לקרוא מ Health Connect. פתח את האפליקציה, לשונית מאמן, בדיקת מוכנות.', 'The coach cannot read from Health Connect. Open the app, the coach tab, readiness check.'),
    });
  }
  if (c.hcOk && c.lastStepsAt !== undefined && between(m, at(11), at(22))) {
    const stale = c.lastStepsAt === null ? true : c.now.getTime() - c.lastStepsAt.getTime() > 4 * 3600 * 1000;
    if (stale) {
      out.push({
        id: `sync_steps@${bucket(240)}`,
        priority: 2,
        title: c.hasWatch === false ? t('הטלפון לא סופר צעדים', 'The phone is not counting steps') : t('השעון לא מסנכרן', 'The watch is not syncing'),
        body:
          (c.lastStepsAt ? t(`אין צעדים חדשים מאז ${hhmm(minutesOfDay(c.lastStepsAt))}. `, `No new steps since ${hhmm(minutesOfDay(c.lastStepsAt))}. `) : t('לא הגיעו צעדים היום. ', 'No steps arrived today. ')) +
          (c.hasWatch === false
            ? t('בדוק בהגדרות Health Connect שספירת הצעדים בטלפון פעילה.', 'Check in the Health Connect settings that step counting on the phone is on.')
            : t(`פתח את ${c.activityAppName ?? 'אפליקציית השעון'} ובדוק שהשעון מחובר.`, `Open ${c.activityAppName ?? 'the watch app'} and check the watch is connected.`)),
      });
    }
  }
  if (c.hcOk && c.hasWatch !== false && c.sleepMinutes === null && between(m, wake + 60, at(11, 30))) {
    out.push({
      id: 'sync_sleep',
      priority: 2,
      title: t('אין נתוני שינה מהלילה', 'No sleep data from last night'),
      body: t(`ישנת עם השעון? פתח את ${c.activityAppName ?? 'אפליקציית השעון'} כדי לסנכרן. בלי שינה אני לא יודע כמה לדחוף היום.`, `Did you sleep with the watch? Open ${c.activityAppName ?? 'the watch app'} to sync. Without sleep I don't know how hard to push today.`),
    });
  }
  if (c.hcOk && c.meals === 0 && between(m, at(14), at(21))) {
    out.push({
      id: `food_none@${bucket(180)}`,
      priority: 1,
      title: t('לא נרשמה אף ארוחה היום', 'No meal logged today'),
      body: t(`${c.foodAppName ? `בלי רישום ב ${c.foodAppName}` : 'בלי רישום ארוחות'} אני לא יכול לאמן אותך בתזונה. רשום את הארוחה הבאה, גם אם היא קטנה.`, `${c.foodAppName ? `Without logging in ${c.foodAppName}` : 'Without logging meals'} I cannot coach your food. Log the next meal, even a small one.`),
    });
  }

  // Water: sharper as the gap grows, and one last call two and a half hours before bed
  if (c.prefs.waterReminders && c.waterMl != null && c.waterTarget) {
    const mm = m < wake ? m + 1440 : m;
    const expected = waterExpectedByNow(c.waterTarget, m, wake, c.prefs.bedTime);
    const gap = expected - c.waterMl;
    const left = c.waterTarget - c.waterMl;
    const cupNow = t(`${drinkNow(250, c.prefs.waterContainer)} עכשיו`, `${drinkNow(250, c.prefs.waterContainer)} now`);
    if (between(mm, bed - 150, bed - 90) && left > 500) {
      out.push({
        id: 'water@close',
        priority: 1,
        title: t(`חסרים ${waterText(left, c.prefs.waterContainer)} להיום`, `${waterText(left, c.prefs.waterContainer)} still to go today`),
        body: t(`זו ההזדמנות האחרונה, אחר כך זה כבר קימות בלילה. ${drinkNow(500, c.prefs.waterContainer)} עכשיו, ולחץ על הכפתור כאן.`, `This is the last chance, after that it means getting up at night. ${drinkNow(500, c.prefs.waterContainer)} now, and tap the button here.`),
      });
    } else if (between(mm, wake + 60, bed - 150) && waterBehind(c.waterMl, expected)) {
      const far = gap >= 750;
      out.push({
        id: `water@${bucket(120)}`,
        priority: far ? 1 : 2,
        title: c.waterMl === 0 ? t('עוד לא שתית היום', 'You have not drunk anything today') : far ? t(`חסרים לך ${waterText(gap, c.prefs.waterContainer)} מים`, `You are ${waterText(gap, c.prefs.waterContainer)} of water behind`) : t(`שתית ${waterText(c.waterMl, c.prefs.waterContainer)}`, `You drank ${waterText(c.waterMl, c.prefs.waterContainer)}`),
        body: t(`עד עכשיו היית צריך ${waterProgress(expected, c.waterTarget, c.prefs.waterContainer)}. ${far ? 'לא לדחות לערב, ' : ''}${cupNow}, ולחץ על הכפתור כאן.`, `By now you should have had ${waterProgress(expected, c.waterTarget, c.prefs.waterContainer)}. ${far ? 'Do not leave it for the evening, ' : ''}${cupNow}, and tap the button here.`),
      });
    }
  }

  // Going out tonight: get ready for it
  if (c.outingPlan) {
    const o = c.outingPlan;
    if (between(m, o.leaveAt - 90, o.leaveAt - 30)) {
      out.push({
        id: 'outing_prep',
        priority: 1,
        title: t(`יוצא ב${hhmm(o.leaveAt)}: ${OUTING_LABEL[o.kind]}`, `Going out at ${hhmm(o.leaveAt)}: ${OUTING_LABEL[o.kind]}`),
        body: OUTING_TIP[o.kind],
      });
    }
    // Leaving before tonight's workout would end
    if (plan && !trained && plan.start >= at(17) && o.leaveAt < plan.start + plan.session.minutes && between(m, at(12), o.leaveAt - 60)) {
      const early = o.leaveAt - plan.session.minutes - 30;
      out.push({
        id: 'outing_workout',
        priority: 1,
        title: t('היציאה מתנגשת באימון', 'The outing clashes with the workout'),
        body:
          early >= at(16)
            ? t(`האימון ב${pad2(plan.hour)}:${pad2(plan.minute)} והיציאה ב${hhmm(o.leaveAt)}. הקדם את האימון ל${hhmm(early)}, או 20 דקות בבית לפני שיוצאים.`, `The workout is at ${pad2(plan.hour)}:${pad2(plan.minute)} and you leave at ${hhmm(o.leaveAt)}. Move the workout up to ${hhmm(early)}, or 20 minutes at home before you go.`)
            : t(`האימון ב${pad2(plan.hour)}:${pad2(plan.minute)} והיציאה ב${hhmm(o.leaveAt)}. 20 דקות בבית לפני שיוצאים: ${MINIMUM_WORKOUT.map((e) => e.name).join(', ')}.`, `The workout is at ${pad2(plan.hour)}:${pad2(plan.minute)} and you leave at ${hhmm(o.leaveAt)}. 20 minutes at home before you go: ${MINIMUM_WORKOUT.map((e) => moveName(e.name)).join(', ')}.`),
      });
    }
  }

  // The hours he said are hardest for him
  if (c.hardTimes?.includes('evening') && !c.outingPlan && between(m, at(20, 30), at(21, 30))) {
    const left = Math.round(caloriesFor(c.now) - c.kcal);
    out.push({
      id: 'evening_guard',
      priority: 2,
      title: t('זו השעה שהכי קשה לך', 'This is your hardest hour'),
      body: t(`${left > 0 ? `נשארו ${left} קלוריות. ` : ''}אם רעב, משהו עם חלבון, לא מהמזווה. המטבח נסגר ב${hhmm((c.prefs.bedTime - 120 + 1440) % 1440)}.`, `${left > 0 ? `${left} calories left. ` : ''}If you are hungry, something with protein, not from the pantry. The kitchen closes at ${hhmm((c.prefs.bedTime - 120 + 1440) % 1440)}.`),
    });
  }
  if (c.hardTimes?.includes('weekend') && c.now.getDay() === (weekendStart() + 6) % 7 && between(m, at(18), at(20))) {
    out.push({
      id: 'weekend_guard',
      priority: 2,
      title: t('סוף השבוע מתחיל', 'The weekend begins'),
      body: t('אמרת שזה הזמן הכי קשה לך. ארוחה חופשית אחת, לא שלושה ימים. ומים כרגיל.', 'You said this is your hardest time. One free meal, not three days. And water as usual.'),
    });
  }

  // Awake after bedtime: he opened the app, pressed run, or is walking around
  const sinceBed = (m - c.prefs.bedTime + 1440) % 1440;
  const awake = c.active || (c.recentSteps ?? 0) >= 40;
  // Going out tonight: no sleep nags until half an hour after the planned return
  const outingGrace = !!c.outingPlan && nightMinutes(m) < graceEnd(c.outingPlan);
  if (awake && !c.nightAcked && !outingGrace && sinceBed < 5 * 60 && minutesUntil(m, c.prefs.wakeTime) > 60) {
    const left = minutesUntil(m, c.prefs.wakeTime);
    const hrs = `${Math.floor(left / 60)}:${pad2(left % 60)}`;
    const tomorrow = planThisWeek(c.now).find((w) => w.day === (c.now.getDay() + (m < at(12) ? 0 : 1)) % 7);
    const short = left < GOALS.sleepHours * 60;
    out.push({
      id: `go_to_sleep@${bucket(30)}`,
      priority: 1,
      title: c.outingPlan ? t('חזרת? לך לישון', 'Back? Go to sleep') : sinceBed < 5 ? t('זמן לישון', 'Time to sleep') : t(`עברו ${fmtLate(sinceBed)} משעת השינה`, `${fmtLate(sinceBed)} past your bedtime`),
      body:
        t(`אם תירדם עכשיו תישן ${hrs} שעות עד ${hhmm(c.prefs.wakeTime)}`, `If you fall asleep now you will sleep ${hrs} hours until ${hhmm(c.prefs.wakeTime)}`) +
        (short ? t(`, פחות מהיעד של ${GOALS.sleepHours}.`, `, less than the ${GOALS.sleepHours} hour goal.`) : '.') +
        (tomorrow && short ? t(` ${m < at(12) ? 'היום' : 'מחר'} ${sessionOf(tomorrow.session).title}, ועייפות תפגע בו.`, ` ${m < at(12) ? 'Today' : 'Tomorrow'} is ${sessionOf(tomorrow.session).title}, and tiredness will hurt it.`) : '') +
        t(' הנח את הטלפון.', ' Put the phone down.'),
    });
  }

  return out;
}

const minutesUntil = (m: number, target: number) => (target - m + 1440) % 1440;
const quote = (why?: string) => (why?.trim() ? t(` אמרת: "${why.trim()}".`, ` You said: "${why.trim()}".`) : '');
const STOP_LINES: Record<string, string> = {
  work: t('בפעם הקודמת עומס בעבודה הפיל אותך. לא הפעם. ', 'Last time a heavy workload knocked you off. Not this time. '),
  family: t('בפעם הקודמת המשפחה דחקה את האימונים. ', 'Last time family pushed the workouts aside. '),
  motivation: t('בפעם הקודמת המוטיבציה נגמרה. היא לא חוזרת לבד, היא חוזרת מאימון. ', 'Last time the motivation ran out. It does not come back by itself, it comes back from a workout. '),
  injury: t('אם משהו כואב, אימון ניידות קל עדיף על הפסקה. ', 'If something hurts, a light mobility workout beats a break. '),
};
const fmtLate = (min: number) => (min < 60 ? t(`${min} דקות`, `${min} minutes`) : t(`${Math.floor(min / 60)}:${pad2(min % 60)} שעות`, `${Math.floor(min / 60)}:${pad2(min % 60)} hours`));

function MEAL_IDEAS(id: string, vegetarian: boolean): string {
  const protein = vegetarian ? t('ביצים, קוטג\', טופו או עדשים', 'eggs, cottage cheese, tofu or lentils') : t('ביצים, קוטג\', עוף או טונה', 'eggs, cottage cheese, chicken or tuna');
  switch (id) {
    case 'breakfast':
      return t('רעיון: ביצים או יוגורט עם לחם מלא וירק.', 'Idea: eggs or yogurt with whole-grain bread and a vegetable.');
    case 'snack_am':
    case 'snack_pm':
      return t('רעיון: יוגורט חלבון, פרי עם קומץ אגוזים, או חטיף חלבון.', 'Idea: protein yogurt, fruit with a handful of nuts, or a protein bar.');
    case 'night':
      return t('אם רעב: משהו קטן עם חלבון, כמו יוגורט או קוטג\'.', 'If hungry: something small with protein, like yogurt or cottage cheese.');
    default:
      return t(`רעיון: חלבון (${protein}), פחמימה ומנת ירקות.`, `Idea: protein (${protein}), a carb and a portion of vegetables.`);
  }
}

/** Meal feedback is a direct reply to something the user did, so it does not use up the daily cap. */
// Not counted in the daily cap: answers to what he did, and water, which is short and comes every two hours at most
/**
 * Everything counted, replies included: a coach that speaks 19 times a day is not heard.
 * Within it, water at most twice a day and places at most three times.
 */
export const TOTAL_PER_DAY: Record<NagLevel, number> = { quiet: 5, normal: 9, close: 13, drill: 22 };
const WATER_PER_DAY: Record<NagLevel, number> = { quiet: 2, normal: 2, close: 3, drill: 4 };
const PLACES_PER_DAY = 3;
const isWater = (id: string) => baseId(id) === 'water';
/** The evening last call: the last chance to drink, so no cap stops it. */
const isLastCall = (id: string) => id === 'water@close' || id === 'day_summary';
/** Replies to a meal he logged: he started it, so they do not use up what the coach may say. */
const isReply = (id: string) => /^(meal|status)_\d+$/.test(id);
const isPlace = (id: string) => /^(place_|gym_)/.test(id);

const isFeedback = (id: string) => /^(meal|status)_\d+$/.test(id) || /^(place_|gym_|water@)/.test(id);

/**
 * Several food items logged together (a plate of peas, sweet potato and an egg)
 * become one message instead of one notification per item.
 */
export function combineMeals(candidates: CoachMessage[], sentIds: string[]): CoachMessage[] {
  const fresh = candidates.filter((c) => c.meal && !sentIds.includes(c.id));
  const rest = candidates.filter((c) => !c.meal || sentIds.includes(c.id));
  if (fresh.length < 2) return [...rest, ...fresh];
  fresh.sort((a, b) => Number(b.id.slice(5)) - Number(a.id.slice(5)));
  const kcal = Math.round(fresh.reduce((a, c) => a + c.meal!.kcal, 0));
  const protein = Math.round(fresh.reduce((a, c) => a + c.meal!.protein, 0));
  const names = fresh.map((c) => c.meal!.name).join(', ');
  const bad = fresh.filter((c) => !c.meal!.good);
  const sum = t(`${names}: ${kcal} קלוריות, ${protein} גרם חלבון.`, `${names}: ${kcal} calories, ${protein} grams of protein.`);
  const merged: CoachMessage = {
    id: fresh[0].id,
    also: fresh.slice(1).map((c) => c.id),
    priority: Math.min(...fresh.map((c) => c.priority)) as Priority,
    title: bad.length ? bad[0].title : protein >= 25 ? t('כל הכבוד', 'Well done') : t('נרשם', 'Logged'),
    body: bad.length ? `${sum} ${bad[0].body}` : sum,
  };
  return [...rest, merged];
}

const SAME_MESSAGE = [
  ['home_before_workout', 'place_home_in'],
  ['leave_office_protein', 'place_office_out'],
];

/** Applies nag level, quiet hours, daily cap and once-per-day dedup. */
export function select(
  candidates: CoachMessage[],
  opts: { now: Date; prefs: CoachPrefs; sentTodayIds: string[] },
): CoachMessage[] {
  if (!opts.prefs.enabled) return [];
  // Quiet hours exist so the coach does not wake him. If he is up, telling him to sleep is the point.
  // Vacation: silent, or one light reminder a day about water, steps or protein
  if (onVacation(opts.now, opts.prefs.vacation)) {
    if (opts.prefs.vacation!.mode === 'silent' || opts.sentTodayIds.length >= 1) return [];
    candidates = candidates.filter((c) => LIGHT_IDS.includes(baseId(c.id))).slice(0, 1);
  }
  if (isQuietTime(opts.now, opts.prefs)) candidates = candidates.filter((c) => baseId(c.id) === 'go_to_sleep');
  const rules = LEVEL_RULES[opts.prefs.level] ?? LEVEL_RULES.normal;
  const { maxPriority, maxPerDay, perRun, repeat } = rules;
  const used = opts.sentTodayIds.filter((id) => !isFeedback(id)).length;
  let room = Math.max(0, maxPerDay - used);
  let total = Math.max(0, (TOTAL_PER_DAY[opts.prefs.level] ?? TOTAL_PER_DAY.normal) - opts.sentTodayIds.filter((id) => !isReply(id) && !isLastCall(id)).length);
  let water = Math.max(0, (WATER_PER_DAY[opts.prefs.level] ?? 2) - opts.sentTodayIds.filter((id) => isWater(id) && !isLastCall(id)).length);
  let places = Math.max(0, PLACES_PER_DAY - opts.sentTodayIds.filter(isPlace).length);
  const sentBases = new Set(opts.sentTodayIds.map(baseId));
  // Two messages that say the same thing in different words: once one went out, not the other
  const sameAs = (id: string) => SAME_MESSAGE.find((g) => g.includes(baseId(id)))?.filter((b) => b !== baseId(id)) ?? [];
  const alreadySent = (id: string) =>
    opts.sentTodayIds.includes(id) || (!repeat && sentBases.has(baseId(id))) || sameAs(id).some((b) => sentBases.has(b));
  const out: CoachMessage[] = [];
  for (const c of candidates
    .filter((x) => x.priority <= maxPriority && !alreadySent(x.id))
    .sort((a, b) => a.priority - b.priority)) {
    // A reply to a meal he just logged always comes: it is the point of logging
    const meal = /^meal_\d+$/.test(c.id);
    if (isLastCall(c.id)) {
      out.push(c);
      continue;
    }
    // A reply to a meal never waits for room in this run; the rest share it
    if (meal) {
      out.push(c);
      continue;
    }
    if (out.filter((x) => !isLastCall(x.id) && !/^meal_\d+$/.test(x.id)).length >= perRun || total <= 0) break;
    if (isWater(c.id) && water <= 0) continue;
    if (isPlace(c.id) && places <= 0) continue;
    if (isFeedback(c.id) || room > 0) {
      out.push(c);
      if (!isReply(c.id)) total--;
      if (!isFeedback(c.id)) room--;
      if (isWater(c.id)) water--;
      if (isPlace(c.id)) places--;
    }
  }
  return out;
}

// Encouraging tone: same facts, softer framing
const ENCOURAGE: Record<string, string> = {
  gym_arrive: t('כל הכבוד שהגעת. ', 'Well done for getting here. '),
  home_before_workout: t('יום טוב לאימון. ', 'A good day for a workout. '),
  missed_workout: t('קורה לכולם, העיקר לא לשבור את הרצף. ', 'It happens to everyone, the main thing is not to break the streak. '),
  evening_over: t('לא נורא בכלל. ', 'Not a big deal at all. '),
  evening_under: t('שמתי לב שאכלת מעט היום. ', 'I noticed you ate little today. '),
  short_sleep: t('לילה קשה, זה בסדר. ', 'A hard night, that is OK. '),
  weigh_in: t('בוקר טוב. ', 'Good morning. '),
  long_break: t('הכי קשה זה לחזור, ואתה יכול. ', 'Coming back is the hardest part, and you can. '),
  week_behind: t('עוד אפשר להציל את השבוע. ', 'The week can still be saved. '),
  water: t('תזכורת קטנה. ', 'A small reminder. '),
  go_to_sleep: t('יום ארוך, מגיע לך לנוח. ', 'A long day, you deserve a rest. '),
  food_none: t('רק תזכורת. ', 'Just a reminder. '),
  protein_evening: t('אתה קרוב. ', 'You are close. '),
};

export function applyTone(m: CoachMessage, tone: CoachPrefs['tone']): CoachMessage {
  const key = baseId(m.id);
  if (tone !== 'encouraging' || !ENCOURAGE[key]) return m;
  return { ...m, body: ENCOURAGE[key] + m.body };
}
