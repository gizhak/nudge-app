// Pure: the coach's own read of the day. A check-in at midday and late afternoon,
// and a summary an hour before bed told as a story: how it started, the middle, how it ends.

import { t } from '../i18n';
export interface DayFacts {
  now: Date;
  /** Minutes after midnight */
  wake: number;
  bed: number;
  weighed: boolean;
  stepsByHour: number[];
  stepsGoal: number;
  waterByHour: number[];
  waterTarget: number;
  meals: { time: Date; kcal: number; protein: number }[];
  kcalTarget: number;
  proteinGoal: number;
  plannedToday: boolean;
  trainedToday: boolean;
  /** "1.4 ליטר" in his unit */
  waterText: (ml: number) => string;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const hourOf = (d: Date) => d.getHours() + d.getMinutes() / 60;

/** The longest run of hours (3 or more) with almost no steps, between two hours after waking and the given hour. */
export function stillestStretch(stepsByHour: number[], from: number, to: number, perHour = 250): { from: number; to: number; steps: number } | null {
  let best: { from: number; to: number; steps: number } | null = null;
  let start = -1;
  for (let h = from; h <= to; h++) {
    const quiet = h < to && stepsByHour[h] < perHour;
    if (quiet && start < 0) start = h;
    if (!quiet && start >= 0) {
      if (h - start >= 3 && (!best || h - start > best.to - best.from)) best = { from: start, to: h, steps: sum(stepsByHour.slice(start, h)) };
      start = -1;
    }
  }
  return best;
}

interface Read {
  good: string[];
  bad: { text: string; weight: number; tomorrow: string; now: string }[];
}

function read(f: DayFacts, until: number): Read {
  const good: string[] = [];
  const bad: Read['bad'] = [];
  const wakeH = Math.floor(f.wake / 60);
  const nowH = Math.min(24, until);

  // The morning
  const morningWater = sum(f.waterByHour.slice(wakeH, Math.min(24, wakeH + 3)));
  if (f.weighed && morningWater >= 400) good.push(t('נשקלת ושתית מים בבוקר', 'Weighed in and drank water in the morning'));
  else if (f.weighed) {
    good.push(t('נשקלת בבוקר', 'Weighed in in the morning'));
    if (nowH >= wakeH + 3) bad.push({ text: t('בבוקר כמעט לא שתית', 'You barely drank in the morning'), weight: 1, tomorrow: t('חצי ליטר מים מיד אחרי השקילה, לפני הקפה', 'half a liter of water right after the weigh-in, before coffee'), now: t('כמה לגימות עכשיו', 'a few sips now') });
  } else bad.push({ text: t('לא נשקלת היום', 'Not weighed today'), weight: 2, tomorrow: t('שקילה ראשון דבר בבוקר', 'a weigh-in first thing in the morning'), now: t('מחר בבוקר שקילה, לפני הקפה', 'weigh in tomorrow morning, before coffee') });

  // Movement
  const steps = sum(f.stepsByHour.slice(0, nowH));
  const still = stillestStretch(f.stepsByHour, wakeH + 2, Math.min(nowH, Math.floor(f.bed / 60) - 1));
  if (still) bad.push({ text: t(`בין ${still.from}:00 ל ${still.to}:00 כמעט לא זזת (${fmt(still.steps)} צעדים)`, `Between ${still.from}:00 and ${still.to}:00 you barely moved (${fmt(still.steps)} steps)`), weight: 2, tomorrow: t('לקום ל 5 דקות הליכה כל שעה', 'get up for a 5 minute walk every hour'), now: t('לקום עכשיו ל 10 דקות הליכה', 'get up now for a 10 minute walk') });
  const stepsDue = f.stepsGoal * Math.max(0, Math.min(1, (nowH - wakeH) / Math.max(1, Math.floor(f.bed / 60) - wakeH)));
  if (steps >= f.stepsGoal) good.push(t(`${fmt(steps)} צעדים, מעל היעד`, `${fmt(steps)} steps, over the goal`));
  else if (!still && steps < stepsDue * 0.6) bad.push({ text: t(`רק ${fmt(steps)} צעדים`, `only ${fmt(steps)} steps`), weight: 2, tomorrow: t('הליכה של 20 דקות אחרי ארוחת הצהריים', 'a 20 minute walk after lunch'), now: t('הליכה של 15 דקות עכשיו', 'a 15 minute walk now') });

  // Food
  const meals = f.meals.filter((m) => hourOf(m.time) < nowH);
  const protein = sum(meals.map((m) => m.protein));
  const kcal = sum(meals.map((m) => m.kcal));
  const dayShare = Math.max(0, Math.min(1, (nowH - wakeH) / Math.max(1, Math.floor(f.bed / 60) - wakeH)));
  if (!meals.length) bad.push({ text: t('לא נרשמה אף ארוחה', 'no meal logged'), weight: 3, tomorrow: t('לרשום כל ארוחה ב Zepp, גם קטנה', 'log every meal in Zepp, even a small one'), now: t('לרשום את הארוחה הבאה ב Zepp', 'log the next meal in Zepp') });
  else {
    if (protein >= f.proteinGoal * 0.9 * dayShare) good.push(until >= 24 ? t(`חלבון ביעד (${fmt(protein)} גרם)`, `Protein on target (${fmt(protein)} grams)`) : t(`החלבון בקצב טוב (${fmt(protein)} גרם)`, `Protein at a good pace (${fmt(protein)} grams)`));
    else bad.push({ text: t(`חסרים ${fmt(f.proteinGoal * dayShare - protein)} גרם חלבון${until >= 24 ? '' : ' לקצב של היום'}`, `${fmt(f.proteinGoal * dayShare - protein)} grams of protein short${until >= 24 ? '' : ' for this time of day'}`), weight: 2, tomorrow: t('חלבון בכל ארוחה, גם בבוקר', 'protein in every meal, breakfast too'), now: t('בארוחה הבאה 30 גרם חלבון', '30 grams of protein at the next meal') });
    if (kcal > f.kcalTarget * 1.1) bad.push({ text: t(`עברת את הקלוריות ב ${fmt(kcal - f.kcalTarget)}`, `you passed the calories by ${fmt(kcal - f.kcalTarget)}`), weight: 3, tomorrow: t('לתכנן את ארוחת הערב מראש', 'plan dinner ahead'), now: t('מכאן רק ירקות וחלבון רזה', 'only vegetables and lean protein from here') });
    else if (until >= 24 && kcal >= f.kcalTarget * 0.75) good.push(t('הקלוריות בתוך היעד', 'Calories within the goal'));
    const late = meals.filter((m) => m.time.getHours() * 60 + m.time.getMinutes() > f.bed - 120 && m.kcal >= 150);
    if (late.length) bad.push({ text: t('אכלת מאוחר, פחות משעתיים לפני השינה', 'you ate late, less than two hours before bed'), weight: 1, tomorrow: t('המטבח נסגר שעתיים לפני השינה', 'the kitchen closes two hours before bed'), now: t('המטבח נסגר שעתיים לפני השינה', 'the kitchen closes two hours before bed') });
  }

  // Water
  const water = sum(f.waterByHour.slice(0, nowH));
  const waterDue = f.waterTarget * dayShare;
  if (water >= waterDue * 0.9) good.push(t(`שתית ${f.waterText(water)}`, `You drank ${f.waterText(water)}`));
  else bad.push({ text: t(`שתית רק ${f.waterText(water)}`, `you drank only ${f.waterText(water)}`), weight: 1, tomorrow: t('בקבוק על השולחן, לגימות כל חצי שעה', 'a bottle on the desk, sips every half hour'), now: t('כמה לגימות עכשיו', 'a few sips now') });

  // Training
  if (f.trainedToday) good.push(f.plannedToday ? t('התאמנת כמתוכנן', 'Trained as planned') : t('אימון שלא היה בתוכנית, כל הכבוד', 'An unplanned workout, well done'));
  else if (f.plannedToday && until >= 24) bad.push({ text: t('דילגת על האימון', 'you skipped the workout'), weight: 4, tomorrow: t('להשלים את האימון שהוחמץ', 'make up the missed workout'), now: t('האימון עוד אפשרי היום', 'the workout is still possible today') });

  return { good, bad };
}

const joinHe = (parts: string[]) => (parts.length <= 1 ? parts.join('') : t(`${parts.slice(0, -1).join(', ')} ו${parts[parts.length - 1]}`, `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`));

/** How the day is going so far, for the coach's mood. */
export function moodOf(f: DayFacts): 'up' | 'mixed' | 'down' {
  const r = read(f, f.now.getHours() + f.now.getMinutes() / 60);
  const score = r.good.length - r.bad.reduce((a, b) => a + (b.weight >= 3 ? 2 : 1), 0);
  return score >= 2 ? 'up' : score <= -2 ? 'down' : 'mixed';
}

/** An hour before bed: how the day went, in his words, and one thing for tomorrow. */
export function summarizeDay(f: DayFacts): { title: string; body: string } {
  const r = read(f, 24);
  const score = r.good.length - r.bad.reduce((a, b) => a + (b.weight >= 3 ? 2 : 1), 0);
  const title = score >= 2 ? t('יום טוב', 'A good day') : score >= -1 ? t('יום סביר', 'A fair day') : t('יום חלש', 'A weak day');
  const parts: string[] = [];
  if (r.good.length) parts.push(t(`${r.good[0].startsWith('נשקלת') ? 'התחלת טוב' : 'מה היה טוב'}: ${r.good[0]}${r.good.length > 1 ? `. גם: ${joinHe(r.good.slice(1))}` : ''}.`, `${r.good[0].startsWith('Weighed') ? 'A good start' : 'What went well'}: ${r.good[0]}${r.good.length > 1 ? `. Also: ${joinHe(r.good.slice(1))}` : ''}.`));
  if (r.bad.length) parts.push(t(`${r.good.length ? 'אבל ' : ''}${joinHe(r.bad.map((b) => b.text))}.`, `${r.good.length ? 'But ' + joinHe(r.bad.map((b) => b.text)) : joinHe(r.bad.map((b) => b.text)).replace(/^./, (x) => x.toUpperCase())}.`));
  const top = [...r.bad].sort((a, b) => b.weight - a.weight)[0];
  parts.push(top ? t(`מחר רק דבר אחד: ${top.tomorrow}.`, `Tomorrow just one thing: ${top.tomorrow}.`) : t('ככה בדיוק. מחר אותו דבר.', 'Exactly like that. Tomorrow the same.'));
  return { title: t(`${title}. הסיכום שלי`, `${title}. My summary`), body: parts.join(' ') };
}

/** Midday and late afternoon: what was done so far and what is missing. Null when there is nothing to say. */
export function checkIn(f: DayFacts): { title: string; body: string } | null {
  const h = f.now.getHours();
  const r = read(f, h + f.now.getMinutes() / 60);
  if (!r.good.length && !r.bad.length) return null;
  const parts: string[] = [];
  if (r.good.length) parts.push(t(`עד עכשיו: ${joinHe(r.good)}.`, `So far: ${joinHe(r.good)}.`));
  if (r.bad.length) parts.push(t(`מה חסר: ${joinHe(r.bad.map((b) => b.text))}.`, `What is missing: ${joinHe(r.bad.map((b) => b.text))}.`));
  const top = [...r.bad].sort((a, b) => b.weight - a.weight)[0];
  if (top) parts.push(t(`הדבר הבא: ${top.now}.`, `The next thing: ${top.now}.`));
  return { title: h < 15 ? t('בדיקת צהריים', 'Midday check') : t('בדיקת אחר הצהריים', 'Afternoon check'), body: parts.join(' ') };
}
