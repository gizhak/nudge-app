import { muscleSignal } from '../progress/journey';
// Pure: the weekly and monthly reports. No storage, no React, no Health Connect, so every
// number and every sentence can be tested. The coach's verdict, what drove it, and one action.

export type ReportKind = 'week' | 'month';
export type Goal = 'lose' | 'recomp' | 'gain' | 'maintain';
export type Verdict = 'on_track' | 'stuck' | 'drifting' | 'too_fast' | 'unknown';
export type Status = 'good' | 'ok' | 'bad' | 'none';

export const DAY = 24 * 3600 * 1000;

export interface DayData {
  /** Start of the day, ms */
  day: number;
  kcal: number;
  protein: number;
  meals: number;
  steps: number | null;
  sleepMin: number | null;
  workout: boolean;
}

export interface BodyPoint {
  time: number;
  weight?: number;
  fatPct?: number;
  leanKg?: number;
}

export interface Measure {
  at: number;
  waistCm?: number;
  neckCm?: number;
  chestCm?: number;
  armCm?: number;
  thighCm?: number;
  weightAvg?: number;
}

export interface Targets {
  calories: number;
  /** Per weekday (0 = Sunday), with a flexible weekend; else calories every day */
  dayCalories?: number[];
  proteinG: number;
  steps: number;
  sleepHours: number;
  workoutsPerWeek: number;
}

export interface ReportInput {
  kind: ReportKind;
  start: number;
  end: number;
  goal: Goal;
  targetWeightKg?: number;
  heightCm?: number;
  sex?: 'male' | 'female';
  targets: Targets;
  days: DayData[];
  prevDays: DayData[];
  /** Weigh-ins from before the previous period up to the end */
  body: BodyPoint[];
  /** Checkpoints with tape measurements */
  measures: Measure[];
  /** Monthly report made without a new checkpoint */
  noNewMeasure?: boolean;
  /** Weekend days (0 = Sunday), for the weekend pattern */
  weekend?: number[];
  /** A vacation: its days are left out, and a period that is mostly vacation gets no verdict */
  vacation?: { from: number; to: number } | null;
}

export interface Metric {
  key: 'kcal' | 'protein' | 'workouts' | 'sleep' | 'steps';
  title: string;
  value: string;
  detail: string;
  status: Status;
  trend?: string;
}

export interface BodySummary {
  weightAvg?: number;
  weightPrevAvg?: number;
  /** kg per week */
  rate?: number;
  weighDays: number;
  fatAvg?: number;
  fatPrevAvg?: number;
  leanAvg?: number;
  leanPrevAvg?: number;
  waistCm?: number;
  waistChange?: number;
  waistDaysAgo?: number;
  whtr?: number;
  /** US Navy estimate, needs waist, neck and height */
  navyFat?: number;
  /** Chest, arm, thigh, neck: latest and change from the measurement before */
  tape?: { title: string; cm: number; change?: number }[];
  /** Waist against the limbs: is it fat going, muscle staying */
  muscle?: string;
}

export interface Report {
  id: string;
  kind: ReportKind;
  start: number;
  end: number;
  createdAt: number;
  verdict: Verdict;
  headline: string;
  sub?: string;
  completeness: { logged: number; days: number; weighDays: number; text: string };
  body: BodySummary;
  metrics: Metric[];
  patterns: string[];
  forecast?: string;
  action: string;
  flags: string[];
  read?: boolean;
}

// ---------- small helpers ----------

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const r1 = (n: number) => Math.round(n * 10) / 10;
export const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const kg = (n: number) => `${r1(Math.abs(n)).toFixed(1)} ק"ג`;
const signedKg = (n: number) => (Math.abs(n) < 0.05 ? 'ללא שינוי' : `${n < 0 ? 'ירידה של' : 'עלייה של'} ${kg(n)}`);
const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const dm = (t: number) => {
  const d = new Date(t);
  return `${d.getDate()}.${d.getMonth() + 1}`;
};
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const monthName = (t: number) => {
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/** A day counts as logged when it has at least two meals and a believable total. */
export const isLogged = (d: DayData, t: Targets) => d.meals >= 2 && d.kcal >= t.calories * 0.45;

// ---------- weigh-ins ----------

export interface CleanBody {
  /** One value per day: the first weigh-in of the morning */
  daily: { day: number; time: number; weight?: number; fatPct?: number; leanKg?: number }[];
  flags: string[];
}

/**
 * Weigh-ins a few minutes apart are one weighing. When they disagree, the later one is kept
 * and the report says so. A jump of more than 1.5 kg from one day to the next is water, and
 * the report says that too; the averages keep it from steering the trend.
 */
export function cleanBody(points: BodyPoint[]): CleanBody {
  const flags: string[] = [];
  const pts = [...points].filter((p) => p.weight != null || p.fatPct != null).sort((a, b) => a.time - b.time);
  const groups: BodyPoint[][] = [];
  for (const p of pts) {
    const g = groups[groups.length - 1];
    if (g && p.time - g[g.length - 1].time <= 10 * 60000) g.push(p);
    else groups.push([p]);
  }
  const merged: BodyPoint[] = [];
  for (const g of groups) {
    const ws = g.map((p) => p.weight).filter((w): w is number => w != null);
    if (ws.length >= 2 && Math.max(...ws) - Math.min(...ws) > 0.8) {
      flags.push(`${dm(g[0].time)}: שתי שקילות בהפרש של דקות עם פער של ${kg(Math.max(...ws) - Math.min(...ws))}. אחת מהן שגויה; נלקחה האחרונה.`);
    }
    // The last value of each kind within the group
    const m: BodyPoint = { time: g[g.length - 1].time };
    for (const p of g) {
      if (p.weight != null) m.weight = p.weight;
      if (p.fatPct != null) m.fatPct = p.fatPct;
      if (p.leanKg != null) m.leanKg = p.leanKg;
    }
    merged.push(m);
  }
  const byDay = new Map<number, CleanBody['daily'][number]>();
  for (const m of merged) {
    const day = startOfDay(m.time);
    const cur = byDay.get(day);
    if (!cur) byDay.set(day, { day, time: m.time, weight: m.weight, fatPct: m.fatPct, leanKg: m.leanKg });
    else {
      // Morning first: later weigh-ins only fill what the first one lacked
      if (cur.weight == null) cur.weight = m.weight;
      if (cur.fatPct == null) cur.fatPct = m.fatPct;
      if (cur.leanKg == null) cur.leanKg = m.leanKg;
    }
  }
  const daily = [...byDay.values()].sort((a, b) => a.day - b.day);
  for (let i = 1; i < daily.length; i++) {
    const a = daily[i - 1];
    const b = daily[i];
    if (a.weight == null || b.weight == null) continue;
    const gap = Math.round((b.day - a.day) / DAY);
    if (gap <= 2 && Math.abs(b.weight - a.weight) > 1.5) {
      flags.push(`${dm(b.day)}: ${b.weight > a.weight ? 'קפיצה' : 'צניחה'} של ${kg(b.weight - a.weight)} ב${gap === 1 ? 'יום' : 'יומיים'}. זה מים ומלח, לא שומן; הממוצע מנטרל את זה.`);
    }
  }
  return { daily, flags };
}

/** Least squares slope of weight over time, in kg per week. Needs at least 3 days spanning 4. */
export function slopePerWeek(daily: { day: number; weight?: number }[]): number | undefined {
  const pts = daily.filter((d) => d.weight != null) as { day: number; weight: number }[];
  if (pts.length < 3 || pts[pts.length - 1].day - pts[0].day < 4 * DAY) return undefined;
  const xs = pts.map((p) => (p.day - pts[0].day) / DAY);
  const ys = pts.map((p) => p.weight);
  const mx = avg(xs)!;
  const my = avg(ys)!;
  let num_ = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num_ += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den ? (num_ / den) * 7 : undefined;
}

/** US Navy body fat estimate for men (waist at the navel, neck, height in cm). */
export function navyBodyFat(waistCm: number, neckCm: number, heightCm: number): number | undefined {
  if (!(waistCm > neckCm) || heightCm < 120) return undefined;
  const v = 495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450;
  return v > 2 && v < 60 ? r1(v) : undefined;
}

// ---------- metrics ----------

function statusOf(share: number, good: number, ok: number): Status {
  return share >= good ? 'good' : share >= ok ? 'ok' : 'bad';
}

function metrics(days: DayData[], prev: DayData[], t: Targets, kind: ReportKind) {
  const weeks = days.length / 7;
  const word = kind === 'week' ? 'בשבוע הקודם' : 'בחודש הקודם';
  const logged = days.filter((d) => isLogged(d, t));
  const prevLogged = prev.filter((d) => isLogged(d, t));
  const out: Metric[] = [];

  // Calories: only logged days count, a half-logged day would flatter the average
  const kcalOf = (d: DayData) => t.dayCalories?.[new Date(d.day).getDay()] ?? t.calories;
  const kIn = logged.filter((d) => d.kcal <= kcalOf(d) * 1.1 && d.kcal >= kcalOf(d) * 0.7).length;
  const kAvg = avg(logged.map((d) => d.kcal));
  const kPrev = avg(prevLogged.map((d) => d.kcal));
  out.push({
    key: 'kcal',
    title: 'קלוריות',
    value: logged.length ? `${kIn} מתוך ${logged.length} ימים ביעד` : 'אין ימים רשומים',
    detail: kAvg != null ? `ממוצע ${num(kAvg)} מול יעד ${num(t.calories)}` : 'צריך לפחות 3 ימים רשומים במלואם',
    status: logged.length < 3 ? 'none' : statusOf(kIn / logged.length, 0.7, 0.5),
    trend: kAvg != null && kPrev != null ? `${num(kPrev)} ${word}` : undefined,
  });

  const pIn = logged.filter((d) => d.protein >= t.proteinG * 0.9).length;
  const pAvg = avg(logged.map((d) => d.protein));
  const pPrev = avg(prevLogged.map((d) => d.protein));
  out.push({
    key: 'protein',
    title: 'חלבון',
    value: logged.length ? `${pIn} מתוך ${logged.length} ימים ביעד` : 'אין ימים רשומים',
    detail: pAvg != null ? `ממוצע ${num(pAvg)} ג' מול יעד ${num(t.proteinG)}` : 'צריך לפחות 3 ימים רשומים במלואם',
    status: logged.length < 3 ? 'none' : statusOf(pIn / logged.length, 0.7, 0.5),
    trend: pAvg != null && pPrev != null ? `${num(pPrev)} ג' ${word}` : undefined,
  });

  const planned = Math.round(t.workoutsPerWeek * weeks);
  const done = days.filter((d) => d.workout).length;
  const donePrev = prev.filter((d) => d.workout).length;
  out.push({
    key: 'workouts',
    title: 'אימונים',
    value: `${done} מתוך ${planned}`,
    detail: planned ? (done >= planned ? 'עמדת בתוכנית' : `חסרו ${planned - done}`) : 'אין אימונים בתוכנית',
    status: planned === 0 ? 'none' : done >= planned ? 'good' : done >= (kind === 'week' ? planned - 1 : planned * 0.75) ? 'ok' : 'bad',
    trend: prev.length ? `${donePrev} ${word}` : undefined,
  });

  const nights = days.map((d) => d.sleepMin).filter((m): m is number => m != null && m > 60);
  const sAvg = avg(nights);
  const sPrev = avg(prev.map((d) => d.sleepMin).filter((m): m is number => m != null && m > 60));
  out.push({
    key: 'sleep',
    title: 'שינה',
    value: sAvg != null ? `${r1(sAvg / 60).toFixed(1)} שעות בממוצע` : 'אין נתונים',
    detail: sAvg != null ? `${nights.filter((m) => m >= t.sleepHours * 60 - 30).length} מתוך ${nights.length} לילות סביב היעד (${t.sleepHours} שעות)` : 'השעון לא העביר שינה',
    status: nights.length < 3 || sAvg == null ? 'none' : sAvg >= t.sleepHours * 60 - 15 ? 'good' : sAvg >= t.sleepHours * 60 - 45 ? 'ok' : 'bad',
    trend: sAvg != null && sPrev != null ? `${r1(sPrev / 60).toFixed(1)} ${word}` : undefined,
  });

  const steps = days.map((d) => d.steps).filter((s): s is number => s != null && s > 0);
  const stAvg = avg(steps);
  const stPrev = avg(prev.map((d) => d.steps).filter((s): s is number => s != null && s > 0));
  out.push({
    key: 'steps',
    title: 'צעדים',
    value: stAvg != null ? `${num(stAvg)} בממוצע` : 'אין נתונים',
    detail: stAvg != null ? `${steps.filter((s) => s >= t.steps).length} מתוך ${steps.length} ימים מעל ${num(t.steps)}` : 'השעון לא העביר צעדים',
    status: steps.length < 3 || stAvg == null ? 'none' : statusOf(stAvg / t.steps, 0.95, 0.75),
    trend: stAvg != null && stPrev != null ? `${num(stPrev)} ${word}` : undefined,
  });
  return { list: out, logged: logged.length };
}

// ---------- verdict ----------

function decide(goal: Goal, change: number | undefined, fatDelta: number | undefined, m: Metric[]): Verdict {
  const st = (k: Metric['key']) => m.find((x) => x.key === k)?.status;
  if (goal === 'recomp') {
    if (change != null && change >= 0.5) return 'drifting';
    if (change != null && change <= -1.2) return 'too_fast';
    if (fatDelta != null && fatDelta <= -0.3) return 'on_track';
    const habits = [st('protein'), st('workouts')];
    if (habits.every((s) => s === 'good' || s === 'ok') && habits.some((s) => s === 'good')) return 'on_track';
    if (change == null && fatDelta == null) return 'unknown';
    return 'stuck';
  }
  if (change == null) return 'unknown';
  if (goal === 'lose') {
    if (change < -1.2) return 'too_fast';
    if (change <= -0.15) return 'on_track';
    return change >= 0.2 ? 'drifting' : 'stuck';
  }
  if (goal === 'gain') {
    if (change > 0.6) return 'too_fast';
    if (change >= 0.1) return 'on_track';
    return change <= -0.2 ? 'drifting' : 'stuck';
  }
  return Math.abs(change) < 0.3 ? 'on_track' : 'drifting';
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  on_track: 'בדרך הנכונה',
  stuck: 'תקוע',
  drifting: 'נסחף',
  too_fast: 'מהר מדי',
  unknown: 'אין מספיק נתונים',
};

// ---------- patterns ----------

/** Personal patterns, only with enough days on both sides of the comparison. */
export function findPatterns(days: DayData[], t: Targets, weekendDays: number[] = [5, 6]): string[] {
  const logged = days.filter((d) => isLogged(d, t));
  if (logged.length < 14) return [];
  const out: string[] = [];
  const weekend = logged.filter((d) => weekendDays.includes(new Date(d.day).getDay()));
  const weekday = logged.filter((d) => !weekendDays.includes(new Date(d.day).getDay()));
  if (weekend.length >= 3 && weekday.length >= 6) {
    const kw = avg(weekend.map((d) => d.kcal))!;
    const kd = avg(weekday.map((d) => d.kcal))!;
    if (kw - kd >= 250) out.push(`בסוף השבוע אכלת בממוצע ${num(kw - kd)} קלוריות יותר מבימי חול (${weekend.length} מול ${weekday.length} ימים).`);
    else if (kd - kw >= 250) out.push(`בימי חול אכלת בממוצע ${num(kd - kw)} קלוריות יותר מבסוף השבוע.`);
    const pw = avg(weekend.map((d) => d.protein))!;
    const pd = avg(weekday.map((d) => d.protein))!;
    if (pd > 0 && pw < pd * 0.8) out.push(`בסוף השבוע החלבון יורד ב${Math.round((1 - pw / pd) * 100)}% (${num(pw)} ג' מול ${num(pd)} ג' בימי חול).`);
  }
  const short = logged.filter((d) => d.sleepMin != null && d.sleepMin < 6 * 60);
  const rested = logged.filter((d) => d.sleepMin != null && d.sleepMin >= 7 * 60);
  if (short.length >= 4 && rested.length >= 4) {
    const diff = avg(short.map((d) => d.kcal))! - avg(rested.map((d) => d.kcal))!;
    if (diff >= 200) out.push(`ביום שאחרי לילה של פחות מ 6 שעות אכלת בממוצע ${num(diff)} קלוריות יותר מאשר אחרי לילה של 7 שעות (${short.length} מול ${rested.length} ימים).`);
  }
  const trained = days.filter((d) => d.workout && d.steps != null);
  const rest = days.filter((d) => !d.workout && d.steps != null);
  if (trained.length >= 4 && rest.length >= 8) {
    const a = avg(rest.map((d) => d.steps!))!;
    if (a < 5000) out.push(`בימים בלי אימון הלכת בממוצע רק ${num(a)} צעדים. שם נמצא הפער הקל ביותר לסגור.`);
  }
  return out.slice(0, 3);
}

// ---------- the report ----------

export function buildReport(input: ReportInput, now = Date.now()): Report {
  const vac = input.vacation;
  const isVac = (d: DayData) => !!vac && d.day >= vac.from && d.day <= vac.to;
  const vacDays = input.days.filter(isVac).length;
  const r = buildCore({ ...input, days: input.days.filter((d) => !isVac(d)), prevDays: input.prevDays.filter((d) => !isVac(d)) }, now);
  if (!vacDays) return r;
  r.completeness.text += ` · ${vacDays} ימי חופשה לא נספרו`;
  if (vacDays * 2 >= input.days.length) {
    r.verdict = 'unknown';
    r.headline = `חופשה: ${vacDays} מתוך ${input.days.length} ימים. על תקופה כזו לא נותנים ציון.`;
    r.action = 'שבוע חזרה: שקילה בבוקר הראשון, אימון קצר, וחזרה לרישום האוכל. המספרים מתייצבים תוך שבוע.';
  }
  return r;
}

function buildCore(inp: ReportInput, now: number): Report {
  const t = inp.targets;
  const prevStart = inp.start - (inp.end - inp.start);
  const clean = cleanBody(inp.body);
  const inP = clean.daily.filter((d) => d.day >= inp.start && d.day < inp.end);
  const inPrev = clean.daily.filter((d) => d.day >= prevStart && d.day < inp.start);
  const w = (xs: typeof inP) => xs.map((d) => d.weight).filter((v): v is number => v != null);
  const f = (xs: typeof inP) => xs.map((d) => d.fatPct).filter((v): v is number => v != null);
  const l = (xs: typeof inP) => xs.map((d) => d.leanKg).filter((v): v is number => v != null);
  const atLeast = (xs: number[], n: number) => (xs.length >= n ? avg(xs) : undefined);

  const body: BodySummary = {
    weighDays: w(inP).length,
    weightAvg: atLeast(w(inP), 2),
    weightPrevAvg: atLeast(w(inPrev), 2),
    fatAvg: atLeast(f(inP), 2),
    fatPrevAvg: atLeast(f(inPrev), 2),
    leanAvg: atLeast(l(inP), 2),
    leanPrevAvg: atLeast(l(inPrev), 2),
  };
  // Weekly: average against the week before. Monthly: the trend line through the month.
  const change =
    inp.kind === 'week'
      ? body.weightAvg != null && body.weightPrevAvg != null
        ? body.weightAvg - body.weightPrevAvg
        : slopePerWeek(clean.daily.filter((d) => d.day >= inp.start - 7 * DAY && d.day < inp.end))
      : slopePerWeek(inP);
  body.rate = change;
  const fatDelta = body.fatAvg != null && body.fatPrevAvg != null ? body.fatAvg - body.fatPrevAvg : undefined;

  // Tape measurements: the latest one, and its change from the one before
  const ms = [...inp.measures].filter((m) => m.waistCm != null).sort((a, b) => a.at - b.at);
  const lastM = ms[ms.length - 1];
  const prevM = ms[ms.length - 2];
  const flags = [...clean.flags.filter((x) => inP.some((d) => x.startsWith(`${dm(d.day)}:`)))];
  const showTape = lastM && (inp.kind === 'month' || lastM.at >= inp.start);
  if (lastM && showTape) {
    body.waistCm = lastM.waistCm;
    body.waistDaysAgo = Math.floor((startOfDay(now) - startOfDay(lastM.at)) / DAY);
    if (prevM?.waistCm != null) {
      body.waistChange = r1(lastM.waistCm! - prevM.waistCm);
      const wDelta = lastM.weightAvg != null && prevM.weightAvg != null ? Math.abs(lastM.weightAvg - prevM.weightAvg) : undefined;
      if (Math.abs(body.waistChange) >= 3 && wDelta != null && wDelta < 1) {
        flags.push(`המותן ${body.waistChange < 0 ? 'ירדה' : 'עלתה'} ${Math.abs(body.waistChange)} ס"מ בזמן שהמשקל כמעט לא זז. זה חשוד; כדאי למדוד שוב, באותה נקודה ובאותה שעה.`);
      }
    }
    if (inp.heightCm) body.whtr = Math.round((lastM.waistCm! / inp.heightCm) * 100) / 100;
    // The weekly waist has no neck: the last neck measured at a checkpoint goes with it
    const neck = lastM.neckCm ?? [...ms].reverse().find((x) => x.neckCm != null)?.neckCm;
    if (inp.sex !== 'female' && neck && inp.heightCm) body.navyFat = navyBodyFat(lastM.waistCm!, neck, inp.heightCm);
    // Chest, arm and thigh come only from the full checkpoints
    const full = ms.filter((x) => x.chestCm != null || x.armCm != null || x.thighCm != null || x.neckCm != null);
    const lastF = full[full.length - 1];
    const prevF = full[full.length - 2];
    const parts: [string, 'chestCm' | 'armCm' | 'thighCm' | 'neckCm'][] = [
      ['חזה', 'chestCm'],
      ['זרוע', 'armCm'],
      ['ירך', 'thighCm'],
      ['צוואר', 'neckCm'],
    ];
    const tape = lastF
      ? parts
          .filter(([, k]) => lastF[k] != null)
          .map(([title, k]) => ({ title, cm: lastF[k]!, change: prevF?.[k] != null ? r1(lastF[k]! - prevF[k]!) : undefined }))
      : [];
    if (tape.length) body.tape = tape;
    if (prevM) {
      const ch = (k: 'chestCm' | 'armCm' | 'thighCm') => (lastF?.[k] != null && prevF?.[k] != null ? lastF[k]! - prevF[k]! : undefined);
      body.muscle = muscleSignal({ waist: body.waistChange, chest: ch('chestCm'), arm: ch('armCm'), thigh: ch('thighCm') }) ?? undefined;
    }
  }

  const m = metrics(inp.days, inp.prevDays, t, inp.kind);
  const verdict = decide(inp.goal, change, fatDelta, m.list);
  const period = inp.kind === 'week' ? 'השבוע' : 'החודש';
  const changeText = change != null ? (inp.kind === 'week' ? signedKg(change) : `${signedKg(change)} בשבוע בממוצע`) : '';
  const headline =
    verdict === 'unknown'
      ? body.weighDays < 2
        ? `אין מספיק שקילות כדי לקבוע מגמה (${body.weighDays} ${period}).`
        : 'אין מספיק נתונים כדי לקבוע מגמה.'
      : verdict === 'on_track'
        ? inp.goal === 'recomp' && fatDelta != null && fatDelta <= -0.3
          ? `בדרך הנכונה: אחוז השומן ירד ב${r1(-fatDelta).toFixed(1)} נקודות ${period}.`
          : inp.goal === 'recomp'
            ? `בדרך הנכונה: החלבון והאימונים במקום${changeText ? `, משקל ${changeText}` : ''}.`
            : `בדרך הנכונה: ${changeText} ${period}.`
        : verdict === 'too_fast'
          ? `מהר מדי: ${changeText}. בקצב הזה יש סיכון לאבד שריר.`
          : verdict === 'drifting'
            ? `נסחף: ${changeText || 'ההרגלים לא במקום'} ${period}.`
            : `תקוע: ${changeText ? `${changeText} ${period}` : 'אין התקדמות ברורה'}.`;

  const latest = [...clean.daily].reverse().find((d) => d.weight != null && d.day < inp.end);
  const cur = body.weightAvg ?? latest?.weight;
  const sub =
    inp.targetWeightKg && cur != null
      ? Math.abs(cur - inp.targetWeightKg) < 0.3
        ? `אתה ביעד (${inp.targetWeightKg} ק"ג).`
        : `נשארו ${kg(cur - inp.targetWeightKg)} עד היעד (${inp.targetWeightKg} ק"ג).`
      : undefined;

  // Forecast: monthly only, from the trend line, as a range of months
  let forecast: string | undefined;
  if (inp.kind === 'month' && inp.targetWeightKg && cur != null) {
    const s = slopePerWeek(clean.daily.filter((d) => d.day >= inp.end - 28 * DAY && d.day < inp.end));
    const away = cur - inp.targetWeightKg;
    if (Math.abs(away) < 0.3) forecast = 'הגעת ליעד. עכשיו המטרה היא להישאר בו.';
    else if (s == null || w(inP).length < 8) forecast = 'לתחזית צריך לפחות 8 שקילות בחודש.';
    else if (Math.sign(s) !== Math.sign(-away) || Math.abs(s) < 0.05) forecast = 'בקצב של החודש האחרון המשקל לא מתקרב ליעד.';
    else {
      const weeks = Math.abs(away / s);
      const lo = monthName(inp.end + weeks * 0.8 * 7 * DAY);
      const hi = monthName(inp.end + weeks * 1.3 * 7 * DAY);
      forecast = `בקצב הנוכחי תגיע ל ${inp.targetWeightKg} ק"ג ${lo === hi ? `בערך ב${lo}` : `בין ${lo} ל${hi}`}. זו הערכה; הקצב משתנה.`;
    }
  }

  const weighNeed = inp.kind === 'week' ? 3 : 10;
  const daysN = inp.days.length;
  const completeness = {
    logged: m.logged,
    days: daysN,
    weighDays: body.weighDays,
    text: `${m.logged} מתוך ${daysN} ימים עם אוכל רשום במלואו · ${body.weighDays} שקילות`,
  };

  const st = (k: Metric['key']) => m.list.find((x) => x.key === k)!;
  const pick = (): string => {
    if (m.logged < daysN * 0.5)
      return `רישום: רק ${m.logged} מתוך ${daysN} ימים נרשמו במלואם, אז הקלוריות כאן הן ניחוש. ${inp.kind === 'week' ? 'השבוע' : 'החודש'} המטרה היא לרשום כל ארוחה, גם קטנה.`;
    if (body.weighDays < weighNeed) return `שקילה: ${body.weighDays} שקילות לא מספיקות כדי לראות מגמה. עלה על המשקל כל בוקר, אחרי השירותים ולפני שתייה.`;
    if (verdict === 'too_fast') return 'הוסף כ 200 קלוריות ביום, רובן מחלבון. ירידה מהירה מדי לוקחת גם שריר.';
    const order: Metric['key'][] = inp.goal === 'recomp' || inp.goal === 'gain' ? ['protein', 'workouts', 'kcal', 'sleep', 'steps'] : ['kcal', 'protein', 'workouts', 'sleep', 'steps'];
    const bad = order.map(st).find((x) => x.status === 'bad') ?? order.map(st).find((x) => x.status === 'ok');
    if (bad?.key === 'kcal') return `קלוריות: ${bad.value}. בחר ארוחה אחת קבועה שבה אתה חורג, ותכנן אותה מראש.`;
    if (bad?.key === 'protein') return `חלבון: ${bad.value}. הוסף מנת חלבון לארוחת הבוקר, כמו קוטג' או יוגורט חלבון, וזה כבר סוגר חצי מהפער.`;
    if (bad?.key === 'workouts') return `אימונים: ${bad.value}. קבע עכשיו ביומן את האימונים של השבוע הבא, כמו פגישה.`;
    if (bad?.key === 'sleep') return `שינה: ${bad.value}. הקדם את השינה ב 30 דקות. שינה קצרה מגדילה רעב למחרת.`;
    if (bad?.key === 'steps') return `צעדים: ${bad.value}. הליכה של 20 דקות אחרי ארוחת הצהריים סוגרת את רוב הפער.`;
    return 'המשך בדיוק כך. אל תשנה דבר שעובד.';
  };

  const startKey = new Date(inp.start);
  return {
    id: `${inp.kind}-${startKey.getFullYear()}-${startKey.getMonth() + 1}-${startKey.getDate()}`,
    kind: inp.kind,
    start: inp.start,
    end: inp.end,
    createdAt: now,
    verdict,
    headline,
    sub: inp.noNewMeasure ? [sub, 'לא נעשתה ביקורת חדשה, אז המדידות כאן ישנות.'].filter(Boolean).join(' ') : sub,
    completeness,
    body,
    metrics: m.list,
    patterns: inp.kind === 'month' ? findPatterns(inp.days, t, inp.weekend) : [],
    forecast,
    action: pick(),
    flags,
  };
}

// ---------- schedule and progress ----------

/** The latest weekly report time at or before now (day 0 = Sunday, hour 0-23). */
export function lastWeeklyDue(now: number, weekDay: number, hour: number): number {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  const back = (d.getDay() - weekDay + 7) % 7;
  d.setDate(d.getDate() - back);
  if (d.getTime() > now) d.setDate(d.getDate() - 7);
  return d.getTime();
}

export const nextWeeklyDue = (now: number, weekDay: number, hour: number) => {
  const d = new Date(lastWeeklyDue(now, weekDay, hour));
  d.setDate(d.getDate() + 7);
  return d.getTime();
};

/** The 7 days a weekly report made at `due` covers: up to the start of the report day. */
export function weekPeriod(due: number): { start: number; end: number } {
  const end = startOfDay(due);
  const s = new Date(end);
  s.setDate(s.getDate() - 7);
  return { start: s.getTime(), end };
}

/**
 * The monthly report follows the checkpoints: from one checkpoint day to the next.
 * Without a new checkpoint three days after it was due, it is made anyway.
 */
export function monthPeriod(checkpointTimes: number[], now: number): { start: number; end: number; noNewMeasure?: boolean } | null {
  const cps = [...checkpointTimes].sort((a, b) => a - b).map(startOfDay);
  if (!cps.length) return null;
  const last = cps[cps.length - 1];
  const due = last + 28 * DAY;
  if (now >= due + 3 * DAY) return { start: last, end: due, noNewMeasure: true };
  if (cps.length >= 2) return { start: cps[cps.length - 2], end: last };
  return null;
}

export interface Progress {
  week: { day: number; of: number; next: number; missing: string[] };
  month: { day: number; of: number } | null;
}

/** For the banner: how far into the coming report, and what is still missing for it to be accurate. */
export function progressOf(now: number, weekDay: number, hour: number, curDays: DayData[], weighDays: number, t: Targets, checkpointTimes: number[]): Progress {
  const next = nextWeeklyDue(now, weekDay, hour);
  const { start } = weekPeriod(next);
  const day = Math.min(7, Math.max(1, Math.floor((now - start) / DAY) + 1));
  const past = curDays.filter((d) => d.day < startOfDay(now) && d.day >= start);
  const unlogged = past.filter((d) => !isLogged(d, t));
  const missing: string[] = [];
  if (unlogged.length) {
    const names = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    missing.push(`${unlogged.length === 1 ? 'יום' : 'ימים'} ${unlogged.map((d) => names[new Date(d.day).getDay()]).join(', ')} בלי אוכל רשום במלואו`);
  }
  const wantWeigh = Math.min(day, 4);
  if (weighDays < Math.min(wantWeigh, 3)) missing.push(`${weighDays} שקילות עד עכשיו; צריך לפחות 3 בשבוע`);
  const cps = [...checkpointTimes].sort((a, b) => a - b);
  const last = cps[cps.length - 1];
  const month = last != null ? { day: Math.min(28, Math.floor((startOfDay(now) - startOfDay(last)) / DAY) + 1), of: 28 } : null;
  return { week: { day, of: 7, next, missing }, month };
}
