// Pure: what the scale did lately, measured fairly, and the likely reasons. Said as
// possibilities, never as a diagnosis, and never invented when the data shows nothing.

const DAY = 24 * 3600 * 1000;
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
/** About 7,700 kcal of surplus per kilo of body fat */
const KCAL_PER_KG_FAT = 7700;

export interface WeighPoint {
  time: number;
  kg: number;
  source?: string;
}

export interface DayLite {
  /** Start of the day, ms */
  day: number;
  kcal: number;
  meals: number;
  /** Sleep in the night that ended on this day */
  sleepMin: number | null;
  workout: boolean;
}

export interface WeightWhy {
  /** "עלית 1.3 ק"ג" / "ירדת 0.8 ק"ג" / "יציב" */
  headline: string;
  /** Over what, and from which scale */
  basis: string;
  /** Points of the main scale, oldest first, for the trend line */
  values: number[];
  /** First and last weigh-in, as d.m */
  ends: [string, string];
  reasons: string[];
  /** Every reason found, for the progress screen, which has room for all of them */
  allReasons: string[];
  /** Arithmetic: how much of a gain could be fat */
  reality?: string;
  /** Weigh-ins left out because they came from another scale */
  otherScales?: string;
}

const kg1 = (n: number) => `${(Math.round(Math.abs(n) * 10) / 10).toFixed(1)} ק"ג`;
const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const dayName = (t: number) => DAY_NAMES[new Date(t).getDay()];
const hhmm = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const minutesOfDay = (t: number) => {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * Weigh-ins a few minutes apart are one weighing. Normally the later one stands; when the two
 * disagree by more than 0.8 kg, the one that fits the other days stands (the other is the
 * partner on the same scale, or a bad step).
 */
export function merge(points: WeighPoint[], odd: string[]): WeighPoint[] {
  const sorted = [...points].sort((a, b) => a.time - b.time);
  const groups: WeighPoint[][] = [];
  for (const p of sorted) {
    const g = groups[groups.length - 1];
    const last = g?.[g.length - 1];
    if (last && last.source === p.source && p.time - last.time <= 10 * 60000) g.push(p);
    else groups.push([p]);
  }
  const calm = groups.filter((g) => Math.max(...g.map((x) => x.kg)) - Math.min(...g.map((x) => x.kg)) <= 0.8).map((g) => g[g.length - 1].kg);
  const ref = calm.length ? [...calm].sort((a, b) => a - b)[Math.floor(calm.length / 2)] : null;
  return groups.map((g) => {
    const spread = Math.max(...g.map((x) => x.kg)) - Math.min(...g.map((x) => x.kg));
    if (g.length === 1 || spread <= 0.8) return g[g.length - 1];
    const d = new Date(g[0].time);
    const pick = ref == null ? g[g.length - 1] : g.reduce((a, b) => (Math.abs(b.kg - ref) < Math.abs(a.kg - ref) ? b : a));
    odd.push(`ב ${d.getDate()}.${d.getMonth() + 1} היו שתי שקילות בהפרש של דקות עם פער של ${kg1(spread)}. נלקחה זו שמתאימה לשאר הימים (${pick.kg.toFixed(1)}).`);
    return pick;
  });
}

export function explainWeight(
  points: WeighPoint[],
  days: DayLite[],
  opts: { target: number; maintenance?: number; label?: (source?: string) => string; now?: number },
): WeightWhy | null {
  const now = opts.now ?? Date.now();
  const label = opts.label ?? ((s?: string) => s ?? 'לא ידוע');
  const odd: string[] = [];
  const recent = merge(points.filter((p) => p.time >= now - 14 * DAY && p.time <= now), odd);
  if (recent.length < 2) return null;

  // Only the scale of the latest weigh-in: different scales show different numbers
  const main = recent[recent.length - 1].source;
  const same = recent.filter((p) => p.source === main);
  const others = [...new Set(recent.filter((p) => p.source !== main).map((p) => label(p.source)))];
  const series = same.length >= 2 ? same : recent;
  const first = series[0];
  const last = series[series.length - 1];
  // Averages of up to two weigh-ins at each end soften a single odd morning
  const head = series.slice(0, Math.min(2, Math.floor(series.length / 2)) || 1);
  const tail = series.slice(-Math.min(2, Math.floor(series.length / 2)) || -1);
  const avg = (xs: WeighPoint[]) => xs.reduce((a, p) => a + p.kg, 0) / xs.length;
  const change = series.length >= 4 ? avg(tail) - avg(head) : last.kg - first.kg;
  const spanDays = Math.max(1, Math.round((startOfDay(last.time) - startOfDay(first.time)) / DAY));

  let headline = Math.abs(change) < 0.3 ? 'יציב' : change < 0 ? `ירדת ${kg1(change)}` : `עלית ${kg1(change)}`;
  // The last few days can point the other way from the two weeks: say so first
  const lastDay0 = startOfDay(last.time);
  const lately = series.filter((p) => p.time < lastDay0 && p.time >= lastDay0 - 3 * DAY);
  const peak = lately.length ? lately.reduce((a, p) => (change > 0 ? (p.kg > a.kg ? p : a) : p.kg < a.kg ? p : a)) : null;
  const turn = peak ? last.kg - peak.kg : 0;
  const turned = peak != null && Math.abs(turn) >= 0.3 && (Math.sign(turn) !== Math.sign(change) || Math.abs(change) < 0.3);
  if (turned) headline = `${turn < 0 ? `ירדת ${kg1(turn)}` : `עלית ${kg1(turn)}`} מאז יום ${dayName(peak!.time)}`;
  const basis = `${series.length} שקילות ב ${spanDays} ימים${same.length >= 2 && main ? `, כולן מ ${label(main)}` : ''}`;
  const otherScales = same.length >= 2 && others.length ? `שקילות מ ${others.join(' ו ')} לא נכללו: משקל אחר מראה מספר אחר, וההשוואה ביניהם מטעה.` : undefined;

  const reasons: string[] = [];
  let reality: string | undefined;
  if (turned) {
    reasons.push(
      turn < 0
        ? `המגמה התהפכה: מיום ${dayName(peak!.time)} (${peak!.kg.toFixed(1)}) ירדת ל ${last.kg.toFixed(1)}. על השבועיים זה עדיין ${Math.abs(change) < 0.3 ? 'יציב' : change > 0 ? `עלייה של ${kg1(change)}` : `ירידה של ${kg1(change)}`}, אבל הכיוון עכשיו נכון. אם זה מים שיוצאים, זה בדיוק מה שציפינו.`
        : `מיום ${dayName(peak!.time)} (${peak!.kg.toFixed(1)}) עלית ל ${last.kg.toFixed(1)}. עלייה של כמה ימים היא כמעט תמיד מים; מה שקובע הוא הממוצע השבועי.`,
    );
  }
  if (Math.abs(change) >= 0.5) {
    // The days that can move this morning's number: the three before the latest weigh-in
    const lastDay = startOfDay(last.time);
    const before = days.filter((d) => d.day < lastDay && d.day >= lastDay - 3 * DAY).sort((a, b) => b.day - a.day);
    const logged = (d: DayLite) => d.meals >= 2 && d.kcal >= opts.target * 0.45;

    // Weighed later than usual: breakfast and coffee are on the scale too
    const usual = series.slice(0, -1).map((p) => minutesOfDay(p.time)).sort((a, b) => a - b);
    const median = usual.length ? usual[Math.floor(usual.length / 2)] : null;
    const lateBy = median != null ? minutesOfDay(last.time) - median : 0;

    if (change > 0) {
      reasons.push(...odd);
      const big = before.find((d) => logged(d) && d.kcal >= opts.target * 1.2);
      if (big) reasons.push(`ביום ${dayName(big.day)} אכלת ${num(big.kcal)} קלוריות. ארוחה גדולה, פחמימות ומלח מחזיקים בגוף מים, לרוב 1 עד 2 ק"ג, למשך יומיים או שלושה.`);
      const short = before.concat(days.filter((d) => d.day === lastDay)).find((d) => d.sleepMin != null && d.sleepMin > 60 && d.sleepMin < 6 * 60);
      if (short) reasons.push(`בלילה שלפני יום ${dayName(short.day)} ישנת ${Math.floor(short.sleepMin! / 60)}:${String(Math.round(short.sleepMin! % 60)).padStart(2, '0')} שעות. שינה קצרה מעלה הורמוני סטרס, והגוף אוגר מים.`);
      const trained = before.find((d) => d.workout);
      if (trained) reasons.push(`ביום ${dayName(trained.day)} היה אימון. שרירים בהתאוששות אוגרים מים, לרוב חצי ק"ג עד ק"ג. זה סימן שעבדת, לא שהשמנת.`);
      if (lateBy >= 120) reasons.push(`השקילה האחרונה הייתה ב ${hhmm(last.time)}, מאוחר מהרגיל. אוכל ושתייה של הבוקר מוסיפים חצי ק"ג עד ק"ג.`);
      const missing = before.filter((d) => !logged(d));
      if (!reasons.length && missing.length) reasons.push(`ביום ${missing.map((d) => dayName(d.day)).join(' וביום ')} האוכל לא נרשם במלואו, אז קשה לדעת מה השפיע.`);

      // Arithmetic: how much of this could be fat at all
      if (change >= 1 && opts.maintenance) {
        const win = days.filter((d) => d.day >= startOfDay(first.time) && d.day < lastDay && logged(d));
        const surplus = win.reduce((a, d) => a + (d.kcal - opts.maintenance!), 0);
        // The shown change, not the raw one: "1.0 kg" with 8,085 calories (from 1.05) read as a wrong sum
        const shown = Math.round(change * 10) / 10;
        const need = shown * KCAL_PER_KG_FAT;
        const avgAte = win.length ? win.reduce((a, d) => a + d.kcal, 0) / win.length : 0;
        const burn = `אכלת בממוצע ${num(avgAte)} קלוריות ביום, והגוף שורף כ ${num(opts.maintenance)}.`;
        reality =
          surplus <= 0
            ? `ק"ג שומן נבנה רק מעודף של כ ${num(KCAL_PER_KG_FAT)} קלוריות מעל מה שהגוף שורף, בסך הכל. ${win.length ? burn + ' כלומר לא היה עודף, אז העלייה היא מים ולא שומן.' : ''}`
            : `כדי לעלות ${kg1(shown)} שומן צריך עודף של כ ${num(need)} קלוריות מעל מה שהגוף שורף, בסך הכל. ${burn} העודף בימים האלה היה כ ${num(surplus)}, כלומר לכל היותר ${num((surplus / KCAL_PER_KG_FAT) * 1000)} גרם שומן. כל השאר מים.`;
      }
    } else {
      const light = before.filter((d) => logged(d) && d.kcal <= opts.target * 0.75);
      if (light.length) reasons.push(`ביום ${light.map((d) => dayName(d.day)).join(' וביום ')} אכלת מעט. עם פחות אוכל ופחמימות הגוף משחרר מים, אז חלק מהירידה יחזור, וזה תקין.`);
      if (lateBy <= -120) reasons.push(`השקילה האחרונה הייתה ב ${hhmm(last.time)}, מוקדם מהרגיל ולפני אוכל ושתייה. זה מוריד חצי ק"ג עד ק"ג.`);
      const perWeek = (change / spanDays) * 7;
      if (spanDays >= 5 && perWeek >= -1.2) reasons.push(`קצב של ${kg1(perWeek)} בשבוע: זה בדיוק טווח הירידה הבריא. ככה נראית התקדמות אמיתית.`);
      else if (perWeek < -1.2) reasons.push('ירידה כזאת בכמה ימים היא בעיקר מים. המגמה של כמה שבועות היא מה שקובע.');
    }
    if (!reasons.length) reasons.push('אין סיבה ברורה בנתונים. תנודה של עד 1.5 ק"ג בין ימים היא נורמלית; הממוצע השבועי הוא מה שקובע.');
  }

  const dm = (t: number) => `${new Date(t).getDate()}.${new Date(t).getMonth() + 1}`;
  return { headline, basis, values: series.map((p) => p.kg), ends: [dm(first.time), dm(last.time)], reasons: reasons.slice(0, 3), allReasons: reasons, reality, otherScales };
}

/**
 * A word right after the morning weigh-in: down since the last one (and against the week),
 * or a gain explained before it worries him. Same scale only. Null when nothing to say.
 */
export function weightNews(points: WeighPoint[], now: number): { title: string; body: string } | null {
  const merged = merge(points.filter((p) => p.time >= now - 10 * DAY && p.time <= now), []);
  if (merged.length < 2) return null;
  const last = merged[merged.length - 1];
  if (startOfDay(last.time) !== startOfDay(now)) return null;
  // News about this morning's number, said soon after it: never again in the evening
  if (now - last.time > 3 * 3600000) return null;
  const same = merged.filter((p) => p.source === last.source && startOfDay(p.time) < startOfDay(now));
  if (!same.length) return null;
  const prev = same[same.length - 1];
  const week = same.filter((p) => p.time >= startOfDay(now) - 7 * DAY);
  const avg7 = week.reduce((a, p) => a + p.kg, 0) / week.length;
  const d1 = last.kg - prev.kg;
  const d7 = last.kg - avg7;
  const since = startOfDay(now) - startOfDay(prev.time) === DAY ? 'אתמול' : `יום ${dayName(prev.time)}`;
  if (d1 <= -0.2) {
    return {
      title: 'המשקל יורד',
      body: `${last.kg.toFixed(1)} ק"ג, ${kg1(d1)} פחות מ${since === 'אתמול' ? 'אתמול' : `ב${since}`}.${
        week.length >= 3 && d7 <= -0.3 ? ` וגם ${kg1(d7)} מתחת לממוצע של השבוע. המגמה בכיוון הנכון, תמשיך ככה.` : ' תמשיך ככה.'
      }`,
    };
  }
  if (d1 >= 0.5) {
    return {
      title: 'עלייה קטנה בשקילה',
      body: `${last.kg.toFixed(1)} ק"ג, ${kg1(d1)} יותר מ${since === 'אתמול' ? 'אתמול' : `ב${since}`}. עלייה של יום היא כמעט תמיד מים, מלח או אוכל שעוד בגוף, לא שומן. ${
        week.length >= 3 && d7 < 0.3 ? 'מול הממוצע של השבוע אתה עדיין באותו מקום.' : 'אם זה נמשך כמה ימים, נבדוק מה השתנה.'
      }`,
    };
  }
  return null;
}
