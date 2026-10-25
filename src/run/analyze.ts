// Running: pure analysis of one run against the ones before it, the next target, and what
// the coach says. No I/O, so every rule is tested with plain inputs.

export interface RoutePt {
  t: number;
  lat: number;
  lon: number;
}
export interface HrPt {
  t: number;
  bpm: number;
}

export interface Run {
  /** Health Connect record id */
  id: string;
  start: number;
  end: number;
  km: number;
  source?: string;
  treadmill?: boolean;
  steps?: number;
  kcal?: number;
  /** Heart rate during the run, about every 5 seconds */
  hr: HrPt[];
  /** GPS track, thinned; missing until Android lets us read it */
  route?: RoutePt[];
  /** NO_DATA: the watch wrote none. CONSENT: there is one, ask Android. */
  routeState?: 'DATA' | 'NO_DATA' | 'CONSENT';
  /** The target the coach had set before this run */
  plannedKm?: number;
  /** His answer to the coach after this run */
  reply?: Reply;
  messaged?: boolean;
}

export type Reply = 'same' | 'push' | 'auto';

export type RunGoal = { kind: 'distance'; km: number } | { kind: 'time'; km: number; minutes: number } | { kind: 'habit'; perWeek: number };

export interface RunPrefs {
  /** Weekdays (0 Sunday) he plans to run */
  days: number[];
  goal?: RunGoal;
}

export const DEFAULT_RUN_PREFS: RunPrefs = { days: [] };

const DAY = 86400000;
const R = 6371;
const rad = (x: number) => (x * Math.PI) / 180;

/** Distance between two points in km. */
export function distKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function trackKm(pts: { lat: number; lon: number }[]): number {
  let k = 0;
  for (let i = 1; i < pts.length; i++) k += distKm(pts[i - 1], pts[i]);
  return k;
}

/** Keep at most n points, evenly spread, always the first and last. */
export function thin<T>(xs: T[], n: number): T[] {
  if (xs.length <= n) return xs;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(xs[Math.round((i * (xs.length - 1)) / (n - 1))]);
  return out;
}

export const minutesOf = (r: Run) => (r.end - r.start) / 60000;
/** Seconds per km */
export const paceOf = (r: Run) => (r.km > 0 ? ((r.end - r.start) / 1000) / r.km : 0);
export const paceText = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
export const kmText = (k: number) => (Math.round(k * 100) / 100).toFixed(k >= 10 ? 1 : 2);
/** A target distance: 2.5, 3 */
export const targetText = (k: number) => String(Math.round(k * 10) / 10);

/**
 * GPS noise off the track: each point becomes the average of its neighbors within about
 * 15 m along the way. The shape stays; the zigzag on a straight street goes.
 */
export function smooth(route: RoutePt[], meters = 15): RoutePt[] {
  const n = route.length;
  if (n < 5) return route;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + distKm(route[i - 1], route[i]) * 1000);
  const out: RoutePt[] = [];
  let a = 0;
  let b = 0;
  for (let i = 0; i < n; i++) {
    while (cum[i] - cum[a] > meters) a++;
    while (b < n - 1 && cum[b + 1] - cum[i] <= meters) b++;
    let lat = 0;
    let lon = 0;
    for (let j = a; j <= b; j++) {
      lat += route[j].lat;
      lon += route[j].lon;
    }
    const k = b - a + 1;
    out.push({ t: route[i].t, lat: lat / k, lon: lon / k });
  }
  out[0] = route[0];
  out[n - 1] = route[n - 1];
  return out;
}

export type PaceBand = 'fast' | 'mid' | 'slow';

/**
 * The track cut into stretches of one band: 5% faster than his median pace, 5% slower, or
 * around it. Short flickers are folded into the stretch around them.
 */
export function paceBands(route: RoutePt[]): { band: PaceBand; from: number; to: number }[] {
  const pace = paceAlong(route);
  const med = [...pace].sort((a, b) => a - b)[Math.floor(pace.length / 2)];
  const band = pace.map((p): PaceBand => (p <= med * 0.95 ? 'fast' : p >= med * 1.05 ? 'slow' : 'mid'));
  const runs: { band: PaceBand; from: number; to: number }[] = [];
  for (let i = 0; i < band.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.band === band[i]) last.to = i;
    else runs.push({ band: band[i], from: Math.max(0, i - 1), to: i });
  }
  // Stretches under 15 points join the one before
  const out: typeof runs = [];
  for (const r of runs) {
    const prev = out[out.length - 1];
    if (prev && r.to - r.from < 15) prev.to = r.to;
    else out.push({ ...r });
  }
  return out;
}

/** Index of the point at each full km along the track. */
export function kmMarks(route: RoutePt[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let i = 1; i < route.length; i++) {
    acc += distKm(route[i - 1], route[i]);
    if (acc >= out.length + 1) out.push(i);
  }
  return out;
}

/** Seconds for each full km, from the GPS track. The last part under a km is left out. */
export function splits(route: RoutePt[] | undefined): number[] {
  if (!route || route.length < 2) return [];
  const out: number[] = [];
  let acc = 0;
  let lastT = route[0].t;
  for (let i = 1; i < route.length; i++) {
    const d = distKm(route[i - 1], route[i]);
    if (acc + d >= 1) {
      // Time at the exact km mark, by linear interpolation inside this step
      const f = (1 - acc) / d;
      const tMark = route[i - 1].t + f * (route[i].t - route[i - 1].t);
      out.push((tMark - lastT) / 1000);
      lastT = tMark;
      acc = acc + d - 1;
    } else acc += d;
  }
  return out;
}

/** Pace along the track in windows of about 100 m, for coloring the map. Seconds per km per point. */
export function paceAlong(route: RoutePt[], half = 0.1): number[] {
  const n = route.length;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + distKm(route[i - 1], route[i]));
  const out: number[] = [];
  let a = 0;
  let b = 0;
  for (let i = 0; i < n; i++) {
    while (a < i && cum[i] - cum[a] > half) a++;
    while (b < n - 1 && cum[b] - cum[i] < half) b++;
    const km = cum[b] - cum[a];
    const s = (route[b].t - route[a].t) / 1000;
    out.push(km > 0.02 ? s / km : NaN);
  }
  // Fill gaps from neighbors
  let last = out.find((x) => !isNaN(x)) ?? 0;
  return out.map((x) => (isNaN(x) ? last : (last = x)));
}

// ---------- heart rate ----------

export interface HrBounds {
  rest: number;
  max: number;
  /** How the max was found: from age, or seen in his own runs */
  maxFrom: 'age' | 'seen';
  restFrom: 'night' | 'default';
}

/** Max: 208 minus 0.7 times age, raised to the highest he actually reached. Rest: lowest at night. */
export function hrBounds(age: number, nightRest: number | undefined, runs: Run[]): HrBounds {
  const byAge = age > 0 ? Math.round(208 - 0.7 * age) : 185;
  // The top 1% of samples, so one spike does not set the max
  const seen = runs.flatMap((r) => r.hr.map((h) => h.bpm)).sort((a, b) => b - a);
  const top = seen.length >= 100 ? seen[Math.floor(seen.length * 0.01)] : 0;
  return {
    max: Math.max(byAge, top),
    maxFrom: top > byAge ? 'seen' : 'age',
    rest: nightRest && nightRest > 35 && nightRest < 90 ? nightRest : 65,
    restFrom: nightRest ? 'night' : 'default',
  };
}

/** Heart rate at a fraction of the reserve (Karvonen). */
export const atReserve = (b: HrBounds, f: number) => Math.round(b.rest + f * (b.max - b.rest));

/** Share of the run's time in each zone: 0 easy (<60%), 1 aerobic (60-70), 2 steady (70-80), 3 hard (80-90), 4 max (90+). */
export function zones(hr: HrPt[], b: HrBounds): number[] {
  const z = [0, 0, 0, 0, 0];
  if (hr.length < 2) return z;
  for (let i = 1; i < hr.length; i++) {
    const dt = Math.min(30000, hr[i].t - hr[i - 1].t);
    const f = (hr[i].bpm - b.rest) / (b.max - b.rest);
    const k = f < 0.6 ? 0 : f < 0.7 ? 1 : f < 0.8 ? 2 : f < 0.9 ? 3 : 4;
    z[k] += dt;
  }
  const total = z.reduce((a, x) => a + x, 0) || 1;
  return z.map((x) => x / total);
}

export const avgHr = (r: Run) => (r.hr.length ? Math.round(r.hr.reduce((a, h) => a + h.bpm, 0) / r.hr.length) : undefined);
export const maxHr = (r: Run) => (r.hr.length ? Math.max(...r.hr.map((h) => h.bpm)) : undefined);

// ---------- comparing runs ----------

/** Same route: starts within 150 m, length within 15%, and most of one track lies on the other. */
export function sameRoute(a: Run, b: Run): boolean {
  if (!a.route?.length || !b.route?.length) return false;
  if (distKm(a.route[0], b.route[0]) > 0.15) return false;
  if (Math.abs(a.km - b.km) / Math.max(a.km, b.km) > 0.15) return false;
  const probe = thin(a.route, 12);
  const other = thin(b.route, 300);
  const near = probe.filter((p) => other.some((q) => distKm(p, q) < 0.12)).length;
  return near / probe.length >= 0.8;
}

/** The run to compare with: the last one on the same route, else the last of a similar length. */
export function compareWith(run: Run, before: Run[]): { run: Run; how: 'route' | 'distance' } | null {
  const prev = before.filter((r) => r.start < run.start && !r.treadmill === !run.treadmill).sort((a, b) => b.start - a.start);
  const route = prev.find((r) => sameRoute(run, r));
  if (route) return { run: route, how: 'route' };
  const similar = prev.find((r) => Math.abs(r.km - run.km) / run.km <= 0.15);
  return similar ? { run: similar, how: 'distance' } : null;
}

/** He keeps one route: the last two runs on the same track. */
export function fixedRoute(runs: Run[]): boolean {
  const s = [...runs].sort((a, b) => b.start - a.start);
  return s.length >= 2 && sameRoute(s[0], s[1]);
}

// ---------- the plan ----------

/** How he answered lately: two "push" in the last three answers makes him a pusher. */
export function style(runs: Run[]): Reply {
  const last = runs.filter((r) => r.reply).sort((a, b) => b.start - a.start).slice(0, 3);
  if (last.filter((r) => r.reply === 'push').length >= 2) return 'push';
  if (last.filter((r) => r.reply === 'same').length >= 2) return 'same';
  return 'auto';
}

/** Back after a break: no run in the 21 days before this one. */
export const returning = (run: Run, before: Run[]) => !before.some((r) => r.start < run.start && run.start - r.start < 21 * DAY);

const r1 = (x: number) => Math.round(x * 10) / 10;
const half = (x: number) => Math.round(x * 2) / 2;

export interface Target {
  km: number;
  /** One line on how to run it */
  how: string;
}

/**
 * The next run. At most about 10% more than he has been running (15% when he asked to push),
 * never past the goal distance. On a fixed route the distance stays and the effort changes.
 */
export function nextTarget(runs: Run[], prefs: RunPrefs, b: HrBounds, now: number): Target {
  const recent = runs.filter((r) => now - r.start < 28 * DAY).sort((a, b) => b.start - a.start);
  const goalKm = prefs.goal && prefs.goal.kind !== 'habit' ? prefs.goal.km : undefined;
  const easy = atReserve(b, 0.7);
  if (!recent.length) {
    const km = Math.min(goalKm ?? 2, 2);
    return { km, how: `קצב שמאפשר לדבר, דופק עד ${easy}. מותר לשלב הליכה.` };
  }
  const last = recent[0];
  const z = zones(last.hr, b);
  const hard = z[3] + z[4] > 0.4;
  // The base is what he usually runs, not one long run
  const usual = [...recent.slice(0, 3)].map((r) => r.km).sort((a, b) => a - b)[Math.floor(Math.min(3, recent.length) / 2)];
  const base = last.plannedKm ? Math.min(usual, last.plannedKm * 1.1) : usual;
  const push = style(runs) === 'push';
  const back = returning(last, runs);
  if (fixedRoute(runs) && !push) {
    return { km: r1(last.km), how: hard ? `אותו מסלול, לאט יותר: דופק עד ${easy}. אם צריך, דקה הליכה באמצע.` : 'אותו מסלול, באותו מאמץ. השיפור יבוא מעצמו.' };
  }
  let km = hard || back ? base : base * (push ? 1.15 : 1.1);
  if (goalKm) km = Math.min(km, goalKm);
  km = Math.max(1, half(km));
  if (prefs.goal?.kind === 'time' && goalKm && km >= goalKm) {
    const want = (prefs.goal.minutes * 60) / goalKm;
    return { km, how: `קצב יעד ${paceText(want)} לק"מ. קילומטר אחד בקצב הזה, השאר נוח.` };
  }
  return { km, how: hard ? `לאט, דופק עד ${easy}. אפשר לשלב הליכה.` : `קצב נוח, דופק עד ${easy}.` };
}

// ---------- what the coach says ----------

export interface RunTalk {
  title: string;
  body: string;
  /** The three answers, with what the coach says back to each */
  answers: { key: Reply; label: string; reply: string }[];
}

export function talk(run: Run, before: Run[], prefs: RunPrefs, b: HrBounds, now: number): RunTalk {
  const hist = before.filter((r) => r.start < run.start);
  const parts: string[] = [];
  const pace = paceOf(run);
  const z = zones(run.hr, b);
  const hardShare = z[3] + z[4];
  const back = returning(run, hist);
  const planned = run.plannedKm;

  // Praise first, the facts that earned it
  const over = planned ? run.km / planned : 1;
  if (planned && over >= 1.25) parts.push(`כל הכבוד, ${kmText(run.km)} ק"מ במקום ${targetText(planned)}.`);
  else if (planned && over >= 0.9) parts.push(`עמדת ביעד: ${kmText(run.km)} ק"מ בקצב ${paceText(pace)}.`);
  else parts.push(`${kmText(run.km)} ק"מ ב ${Math.round(minutesOf(run))} דקות, קצב ${paceText(pace)} לק"מ.`);

  // The comparison
  const cmp = compareWith(run, hist);
  if (cmp) {
    const d = paceOf(cmp.run) - pace;
    const hrA = avgHr(run);
    const hrB = avgHr(cmp.run);
    const newRoute = cmp.how === 'distance' && !!run.route?.length && hist.some((r) => r.route?.length);
    const where = cmp.how === 'route' ? 'באותו מסלול' : newRoute ? 'מסלול חדש. מול ריצה באורך דומה' : 'מול ריצה דומה';
    const hrPart = hrA && hrB ? (Math.abs(hrA - hrB) <= 3 ? ' באותו דופק' : hrA < hrB ? ` ובדופק נמוך ב ${hrB - hrA}` : ` אבל בדופק גבוה ב ${hrA - hrB}`) : '';
    if (Math.abs(d) < 5) parts.push(`${where}: אותו קצב${hrPart}.`);
    else if (d > 0) parts.push(`${where}: מהר יותר ב ${Math.round(d)} שניות לק"מ${hrPart}.`);
    else parts.push(`${where}: לאט יותר ב ${Math.round(-d)} שניות לק"מ${hrPart}.`);
  } else if (run.route?.length && hist.some((r) => r.route?.length)) parts.push('מסלול חדש. נשווה אליו בפעם הבאה.');

  // The warnings
  if (back && planned && over >= 1.25) parts.push('זו ריצה ראשונה אחרי הפסקה, וקפיצה כזו במרחק היא הסיבה הנפוצה לכאבי ברכיים ושוקיים, גם כשהריצה הרגישה טוב.');
  else if (back) parts.push('ריצה ראשונה אחרי הפסקה. השבועיים הראשונים הם לבנות בסיס, לא לשבור שיאים.');
  if (hardShare > 0.4)
    parts.push(`הדופק היה גבוה ${Math.round(hardShare * 100)}% מהזמן (מעל ${atReserve(b, 0.8)}). בבנייה, רוב הריצה צריכה להיות מתחת ל ${atReserve(b, 0.7)}.`);

  const next = nextTarget([...hist, run], prefs, b, now);
  const fixed = fixedRoute([...hist, run]);
  parts.push(`בפעם הבאה: ${targetText(next.km)} ק"מ. ${next.how}`);

  const easy = atReserve(b, 0.7);
  const title = hardShare > 0.4 || (back && over >= 1.25) ? 'ריצה טובה, עם הערה' : 'ריצה טובה';
  return {
    title,
    body: parts.join(' '),
    answers: [
      {
        key: 'same',
        label: fixed ? 'אותו מסלול, לאט יותר' : 'כמו שהצעת',
        reply: fixed ? `סגור. אותו מסלול, דופק עד ${easy}. נראה את ההבדל בהשוואה.` : `סגור. ${targetText(next.km)} ק"מ, דופק עד ${easy}.`,
      },
      {
        key: 'push',
        label: 'אני רוצה להתקדם',
        reply: `בסדר, מתקדמים. אבל רק בדבר אחד כל פעם: או מרחק או קצב, לא שניהם. ואם מחר יש כאב בברכיים או בשוקיים, מורידים הילוך.`,
      },
      { key: 'auto', label: 'תחליט אתה', reply: 'אני אחליט לפי הדופק וההתקדמות שלך, ואגיד לפני כל ריצה.' },
    ],
  };
}

/** Goal progress, one line. */
export function goalLine(runs: Run[], prefs: RunPrefs, now: number): string | null {
  const g = prefs.goal;
  if (!g) return null;
  if (g.kind === 'habit') {
    const sunday = new Date(now);
    sunday.setHours(0, 0, 0, 0);
    sunday.setDate(sunday.getDate() - sunday.getDay());
    const n = runs.filter((r) => r.start >= sunday.getTime()).length;
    return `יעד: ${g.perWeek === 1 ? 'ריצה אחת' : `${g.perWeek} ריצות`} בשבוע · השבוע ${n === 0 ? 'עוד לא' : n === 1 ? 'ריצה אחת' : `${n} ריצות`}`;
  }
  const best = Math.max(0, ...runs.map((r) => r.km));
  if (g.kind === 'distance') return best >= g.km ? `יעד: ${g.km} ק"מ ברצף · הושג` : `יעד: ${g.km} ק"מ ברצף · הכי רחוק עד עכשיו ${kmText(best)}`;
  const want = (g.minutes * 60) / g.km;
  const atDist = runs.filter((r) => r.km >= g.km * 0.97);
  const bestPace = atDist.length ? Math.min(...atDist.map(paceOf)) : undefined;
  return bestPace
    ? `יעד: ${g.km} ק"מ ב ${g.minutes} דקות (${paceText(want)} לק"מ) · הכי טוב ${paceText(bestPace)}`
    : `יעד: ${g.km} ק"מ ב ${g.minutes} דקות · עוד לא רצת ${g.km} ק"מ`;
}
