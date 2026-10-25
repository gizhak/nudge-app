// Pure: the coach's own read of the day. A check-in at midday and late afternoon,
// and a summary an hour before bed told as a story: how it started, the middle, how it ends.

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
  if (f.weighed && morningWater >= 400) good.push('נשקלת ושתית מים בבוקר');
  else if (f.weighed) {
    good.push('נשקלת בבוקר');
    if (nowH >= wakeH + 3) bad.push({ text: 'בבוקר כמעט לא שתית', weight: 1, tomorrow: 'חצי ליטר מים מיד אחרי השקילה, לפני הקפה', now: 'כמה לגימות עכשיו' });
  } else bad.push({ text: 'לא נשקלת היום', weight: 2, tomorrow: 'שקילה ראשון דבר בבוקר', now: 'מחר בבוקר שקילה, לפני הקפה' });

  // Movement
  const steps = sum(f.stepsByHour.slice(0, nowH));
  const still = stillestStretch(f.stepsByHour, wakeH + 2, Math.min(nowH, Math.floor(f.bed / 60) - 1));
  if (still) bad.push({ text: `בין ${still.from}:00 ל ${still.to}:00 כמעט לא זזת (${fmt(still.steps)} צעדים)`, weight: 2, tomorrow: 'לקום ל 5 דקות הליכה כל שעה', now: 'לקום עכשיו ל 10 דקות הליכה' });
  const stepsDue = f.stepsGoal * Math.max(0, Math.min(1, (nowH - wakeH) / Math.max(1, Math.floor(f.bed / 60) - wakeH)));
  if (steps >= f.stepsGoal) good.push(`${fmt(steps)} צעדים, מעל היעד`);
  else if (!still && steps < stepsDue * 0.6) bad.push({ text: `רק ${fmt(steps)} צעדים`, weight: 2, tomorrow: 'הליכה של 20 דקות אחרי ארוחת הצהריים', now: 'הליכה של 15 דקות עכשיו' });

  // Food
  const meals = f.meals.filter((m) => hourOf(m.time) < nowH);
  const protein = sum(meals.map((m) => m.protein));
  const kcal = sum(meals.map((m) => m.kcal));
  const dayShare = Math.max(0, Math.min(1, (nowH - wakeH) / Math.max(1, Math.floor(f.bed / 60) - wakeH)));
  if (!meals.length) bad.push({ text: 'לא נרשמה אף ארוחה', weight: 3, tomorrow: 'לרשום כל ארוחה ב Zepp, גם קטנה', now: 'לרשום את הארוחה הבאה ב Zepp' });
  else {
    if (protein >= f.proteinGoal * 0.9 * dayShare) good.push(until >= 24 ? `חלבון ביעד (${fmt(protein)} גרם)` : `החלבון בקצב טוב (${fmt(protein)} גרם)`);
    else bad.push({ text: `חסרים ${fmt(f.proteinGoal * dayShare - protein)} גרם חלבון${until >= 24 ? '' : ' לקצב של היום'}`, weight: 2, tomorrow: 'חלבון בכל ארוחה, גם בבוקר', now: 'בארוחה הבאה 30 גרם חלבון' });
    if (kcal > f.kcalTarget * 1.1) bad.push({ text: `עברת את הקלוריות ב ${fmt(kcal - f.kcalTarget)}`, weight: 3, tomorrow: 'לתכנן את ארוחת הערב מראש', now: 'מכאן רק ירקות וחלבון רזה' });
    else if (until >= 24 && kcal >= f.kcalTarget * 0.75) good.push('הקלוריות בתוך היעד');
    const late = meals.filter((m) => m.time.getHours() * 60 + m.time.getMinutes() > f.bed - 120 && m.kcal >= 150);
    if (late.length) bad.push({ text: 'אכלת מאוחר, פחות משעתיים לפני השינה', weight: 1, tomorrow: 'המטבח נסגר שעתיים לפני השינה', now: 'המטבח נסגר שעתיים לפני השינה' });
  }

  // Water
  const water = sum(f.waterByHour.slice(0, nowH));
  const waterDue = f.waterTarget * dayShare;
  if (water >= waterDue * 0.9) good.push(`שתית ${f.waterText(water)}`);
  else bad.push({ text: `שתית רק ${f.waterText(water)}`, weight: 1, tomorrow: 'בקבוק על השולחן, לגימות כל חצי שעה', now: 'כמה לגימות עכשיו' });

  // Training
  if (f.trainedToday) good.push(f.plannedToday ? 'התאמנת כמתוכנן' : 'אימון שלא היה בתוכנית, כל הכבוד');
  else if (f.plannedToday && until >= 24) bad.push({ text: 'דילגת על האימון', weight: 4, tomorrow: 'להשלים את האימון שהוחמץ', now: 'האימון עוד אפשרי היום' });

  return { good, bad };
}

const joinHe = (parts: string[]) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} ו${parts[parts.length - 1]}`);

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
  const title = score >= 2 ? 'יום טוב' : score >= -1 ? 'יום סביר' : 'יום חלש';
  const parts: string[] = [];
  if (r.good.length) parts.push(`${r.good[0].startsWith('נשקלת') ? 'התחלת טוב' : 'מה היה טוב'}: ${r.good[0]}${r.good.length > 1 ? `. גם: ${joinHe(r.good.slice(1))}` : ''}.`);
  if (r.bad.length) parts.push(`${r.good.length ? 'אבל ' : ''}${joinHe(r.bad.map((b) => b.text))}.`);
  const top = [...r.bad].sort((a, b) => b.weight - a.weight)[0];
  parts.push(top ? `מחר רק דבר אחד: ${top.tomorrow}.` : 'ככה בדיוק. מחר אותו דבר.');
  return { title: `${title}. הסיכום שלי`, body: parts.join(' ') };
}

/** Midday and late afternoon: what was done so far and what is missing. Null when there is nothing to say. */
export function checkIn(f: DayFacts): { title: string; body: string } | null {
  const h = f.now.getHours();
  const r = read(f, h + f.now.getMinutes() / 60);
  if (!r.good.length && !r.bad.length) return null;
  const parts: string[] = [];
  if (r.good.length) parts.push(`עד עכשיו: ${joinHe(r.good)}.`);
  if (r.bad.length) parts.push(`מה חסר: ${joinHe(r.bad.map((b) => b.text))}.`);
  const top = [...r.bad].sort((a, b) => b.weight - a.weight)[0];
  if (top) parts.push(`הדבר הבא: ${top.now}.`);
  return { title: h < 15 ? 'בדיקת צהריים' : 'בדיקת אחר הצהריים', body: parts.join(' ') };
}
