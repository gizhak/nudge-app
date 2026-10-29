// Sleep in depth: each night with its hours and stages, the week's pattern, and what it
// does to the next day. The analysis is pure; one reader gathers the records.
import { readRecords } from 'react-native-health-connect';
import { sleepMinutesInWindow } from './today';

import { LOCALE } from '../i18n';
const DAY = 24 * 3600 * 1000;
const H = 3600 * 1000;

export interface Night {
  /** The day he woke up on, start of day */
  day: number;
  bed: number;
  wake: number;
  asleepMin: number;
  /** Minutes per stage, when the watch records stages */
  deep?: number;
  rem?: number;
  light?: number;
  awake?: number;
  sources: string[];
}

export interface SleepSummary {
  nights: Night[];
  avgMin?: number;
  /** Bed and wake as minutes after midnight (bed may be negative: before midnight) */
  avgBed?: number;
  avgWake?: number;
  /** Spread of bedtimes, minutes (standard deviation) */
  bedSpread?: number;
  onTarget: number;
  /** Next-day calories after short nights against good ones */
  link?: string;
  sources: string[];
}

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

/** Pure: records into nights. Night of day D: 18:00 the evening before to 14:00 on D. */
export function nightsFrom(records: any[], days: number, now = Date.now()): Night[] {
  const today = startOfDay(now);
  const out: Night[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = today - i * DAY;
    const ws = day - 6 * H;
    const we = day + 14 * H;
    const inWin = records.filter((r) => new Date(r.endTime).getTime() > ws && new Date(r.startTime).getTime() < we);
    if (!inWin.length) continue;
    const asleepMin = sleepMinutesInWindow(inWin, ws, we);
    if (asleepMin < 60) continue;
    const bed = Math.max(ws, Math.min(...inWin.map((r) => new Date(r.startTime).getTime())));
    const wake = Math.min(we, Math.max(...inWin.map((r) => new Date(r.endTime).getTime())));
    const stage = (codes: number[]) => {
      let ms = 0;
      for (const r of inWin)
        for (const s of r.stages ?? [])
          if (codes.includes(s.stage)) ms += Math.max(0, Math.min(new Date(s.endTime).getTime(), we) - Math.max(new Date(s.startTime).getTime(), ws));
      return ms / 60000;
    };
    const hasStages = inWin.some((r) => (r.stages ?? []).length);
    out.push({
      day,
      bed,
      wake,
      asleepMin,
      deep: hasStages ? stage([5]) : undefined,
      rem: hasStages ? stage([6]) : undefined,
      light: hasStages ? stage([4, 2]) : undefined,
      awake: hasStages ? stage([1, 7]) : undefined,
      sources: [...new Set(inWin.map((r) => r.metadata?.dataOrigin).filter(Boolean))],
    });
  }
  return out;
}

/** Minutes after midnight, before midnight as negative, so 23:30 and 00:30 average to midnight. */
const clockMin = (t: number) => {
  const d = new Date(t);
  const m = d.getHours() * 60 + d.getMinutes();
  return m >= 12 * 60 ? m - 24 * 60 : m;
};

export const clockText = (m: number) => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};
export const hoursText = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;

/** Pure: the pattern over the last 7 nights, and the link to the next day's eating. */
export function summarize(nights: Night[], targetHours: number, kcalByDay: Map<number, number>, now = Date.now()): SleepSummary {
  const week = nights.filter((n) => n.day > startOfDay(now) - 7 * DAY);
  const beds = week.map((n) => clockMin(n.bed));
  const meanBed = avg(beds);
  const spread = meanBed != null && beds.length >= 3 ? Math.sqrt(avg(beds.map((b) => (b - meanBed) ** 2))!) : undefined;
  // Calories on the day after each night, from all nights we have
  const short = nights.filter((n) => n.asleepMin < 6 * 60).map((n) => kcalByDay.get(n.day)).filter((k): k is number => !!k && k > 600);
  const good = nights.filter((n) => n.asleepMin >= 7 * 60).map((n) => kcalByDay.get(n.day)).filter((k): k is number => !!k && k > 600);
  let link: string | undefined;
  if (short.length >= 3 && good.length >= 3) {
    const d = avg(short)! - avg(good)!;
    link =
      d >= 150
        ? `ביום שאחרי לילה של פחות מ 6 שעות אכלת בממוצע ${Math.round(d)} קלוריות יותר מאשר אחרי לילה של 7 שעות (${short.length} מול ${good.length} ימים).`
        : `לפי הנתונים שלך, לילה קצר לא גורם לך לאכול יותר למחרת (${short.length} מול ${good.length} ימים).`;
  }
  return {
    nights,
    avgMin: avg(week.map((n) => n.asleepMin)),
    avgBed: meanBed,
    avgWake: avg(week.map((n) => clockMin(n.wake))),
    bedSpread: spread,
    onTarget: week.filter((n) => n.asleepMin >= targetHours * 60 - 30).length,
    link,
    sources: [...new Set(nights.flatMap((n) => n.sources))],
  };
}

export async function readSleepRecords(days = 14, now = Date.now()): Promise<any[]> {
  const from = startOfDay(now) - days * DAY - 6 * H;
  const { records }: any = await readRecords('SleepSession', {
    timeRangeFilter: { operator: 'between', startTime: new Date(from).toISOString(), endTime: new Date(now).toISOString() },
  });
  return records ?? [];
}

export interface SleepCheck {
  ok: boolean;
  lines: string[];
}

/** Pure: why sleep is missing, or where it comes from. */
export function diagnose(p: { records: any[]; error?: string; granted: boolean; nights: Night[]; days: number; label: (pkg?: string) => string; now?: number }): SleepCheck {
  const now = p.now ?? Date.now();
  if (p.error) return { ok: false, lines: [`הקריאה של השינה מ Health Connect נכשלה: ${p.error}`] };
  if (!p.granted)
    return { ok: false, lines: ['ל Nudge אין הרשאה לקרוא שינה.', 'פתח Health Connect, הרשאות אפליקציות, Nudge, והפעל את "שינה".'] };
  if (!p.records.length)
    return {
      ok: false,
      lines: [
        `אף אפליקציה לא כתבה שינה ל Health Connect ב ${p.days} הימים האחרונים.`,
        'באפליקציה של השעון (Mi Fitness או Zepp) בדוק בהגדרות Health Connect שהשינה מסומנת לכתיבה.',
        'אחרי לילה עם השעון, פתח את האפליקציה של השעון. רוב השעונים מעבירים שינה רק אחרי סנכרון.',
      ],
    };
  const lines: string[] = [];
  const bySource = new Map<string, number>();
  for (const n of p.nights) for (const s of n.sources) bySource.set(s, (bySource.get(s) ?? 0) + 1);
  for (const [s, c] of bySource) lines.push(`מקור: ${p.label(s)} · ${c} לילות מתוך ${p.days}`);
  const last = Math.max(...p.records.map((r) => new Date(r.endTime).getTime()));
  const ago = (now - last) / H;
  const lastText = new Date(last).toLocaleString(LOCALE, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  let ok = true;
  if (ago > 36) {
    ok = false;
    lines.push(`הלילה האחרון שהגיע הסתיים ב ${lastText}. פתח את האפליקציה של השעון כדי שתסנכרן.`);
  } else lines.push(`הרישום האחרון: ${lastText}`);
  if (p.nights.length && p.nights.every((n) => n.deep == null)) lines.push('השעון מעביר רק את משך השינה, בלי שלבים (עמוקה, REM).');
  const short = p.records.length - p.nights.length;
  if (!p.nights.length) {
    ok = false;
    lines.push(`יש ${p.records.length} רישומי שינה, אבל אף אחד לא מגיע לשעה. אולי רק תנומות.`);
  } else if (short > 3) lines.push('חלק מהרישומים קצרים משעה, ולא נספרים כלילה.');
  return { ok, lines };
}
