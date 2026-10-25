// Pure: the coach as a person. Same facts, said by someone who is glad when he does well,
// gets annoyed when he keeps ignoring, and remembers how the day is going.
// No swearing and nothing about his body: anger at the behaviour, never at him.
import type { CoachMessage } from './rules';

export type Harsh = 'soft' | 'medium' | 'strong';
export type Mood = 'up' | 'mixed' | 'down';

export interface VoiceCtx {
  name?: string;
  whyNow?: string;
  harsh: Harsh;
  /** How the day is going so far */
  mood: Mood;
  /** "Got it" taps on this topic today that were not followed by doing it */
  ignored: number;
  /** When he last said "got it" on it, "14:20" */
  ackedAt?: string;
  /** Protein still missing today, grams */
  proteinLeft: number;
  hour: number;
  /** Makes the wording vary from message to message, the same message keeps its words */
  seed: number;
}

const base = (id: string) => id.split('@')[0];

/** A stable number from a string, so a message keeps its wording if it is shown again. */
export function seedOf(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const pick = <T,>(list: T[], seed: number): T => list[seed % list.length];

/** "Guy, " or nothing: the name in about one message of three, always when it matters. */
const call = (c: VoiceCtx, always = false) => (c.name && (always || c.seed % 3 === 0) ? `${c.name}, ` : '');

const NAGS = /^(water|water_morning|weigh_in|workout_today|workout_now|food_none|meal_reminder|protein_evening|steps|go_to_sleep|sync_steps|evening_kitchen)/;
const PRAISE = /^(workout_done|weight_news|gym_arrive|place_gym_in|run@|run$)/;

function praise(c: VoiceCtx): string {
  const n = c.name;
  return pick(
    [
      n ? `יפה, ${n}. ` : 'יפה. ',
      'זה בדיוק מה שאני רוצה לראות. ',
      n ? `ככה עושים את זה, ${n}. ` : 'ככה עושים את זה. ',
      'כל הכבוד. ',
      c.mood === 'up' ? 'אתה על גל טוב היום. ' : 'הנה, ככה. ',
    ],
    c.seed,
  );
}

/** The opener for a nag, by how many times he already ignored it today and how hard the coach may push. */
function nagOpener(c: VoiceCtx): string {
  if (c.ignored <= 0) {
    if (c.mood === 'down' && c.harsh !== 'soft') return pick([`${call(c)}היום לא הולך כמו שצריך. `, 'בוא נתקן את היום. ', ''], c.seed);
    return '';
  }
  const when = c.ackedAt ? ` ב ${c.ackedAt}` : '';
  if (c.ignored === 1) return pick([`${call(c, true)}שוב אני. אמרת הבנתי${when}, ועדיין לא. `, `אמרת הבנתי${when}, ולא קרה כלום. `, `${call(c)}אני חוזר על זה כי זה חשוב. אמרת הבנתי${when}. `], c.seed);
  // Twice and more: the coach is annoyed, as much as the level allows
  if (c.harsh === 'soft') return `${call(c, true)}אני יודע שזה לא תמיד קל. `;
  if (c.harsh === 'medium') return `${call(c, true)}זו הפעם ה ${c.ignored + 1} היום. אני לא מוותר. `;
  const why = c.whyNow?.trim() && c.seed % 2 === 0 ? ` זוכר למה התחלת? "${c.whyNow.trim()}".` : '';
  return `${call(c, true)}זו הפעם ה ${c.ignored + 1} שאתה אומר הבנתי ולא עושה. אני לא מוותר.${why} `;
}

export function voice(m: CoachMessage, c: VoiceCtx): CoachMessage {
  const id = m.id;
  const b = base(id);

  // Food the user logged: warm when good, a frown when not, with what is still missing
  if (m.meal) {
    if (m.meal.good) {
      const missing = c.proteinLeft >= 40 && c.hour >= 12 ? ` רק זכור שחסרים לך עוד ${Math.round(c.proteinLeft)} גרם חלבון, והיום מתקצר.` : '';
      return { ...m, body: `${praise(c)}${m.body}${missing}` };
    }
    const frown = c.harsh === 'soft' ? 'לא נורא, אבל ' : c.harsh === 'medium' ? `${call(c)}זה לא בשביל המטרה שלך. ` : `${call(c, true)}ככה לא מגיעים למטרה. `;
    return { ...m, body: `${frown}${m.body}` };
  }

  if (b === 'missed_workout' || b === 'week_behind' || b === 'long_break') {
    const line =
      c.harsh === 'soft'
        ? 'לא נורא, קורה. מחר משלימים. '
        : c.harsh === 'medium'
          ? `${call(c)}זה לא מקדם אותך. בלי תירוצים. `
          : `${call(c, true)}הבטחת לעצמך שזה לא יקרה. אז מה, מוותרים? `;
    return { ...m, body: `${line}${m.body}` };
  }

  if (b === 'day_summary') {
    const close =
      c.mood === 'up'
        ? pick([' גאה בך היום.', ' ככה ממשיכים.', c.name ? ` יום טוב, ${c.name}. לך לישון.` : ' יום טוב. לך לישון.'], c.seed)
        : c.mood === 'down'
          ? c.harsh === 'strong'
            ? pick([' היום לא היה שלך. מחר אני מצפה ליותר.', ' זה לא היום שרצינו. מחר מתקנים, ואני אבדוק.'], c.seed)
            : ' מחר יום חדש.'
          : pick([' לא רע, אבל יש מה לשפר.', ' בסדר. מחר קצת יותר.'], c.seed);
    return { ...m, body: `${m.body}${close}` };
  }

  if (/^checkin@/.test(id)) {
    const open = c.mood === 'up' ? pick(['אני מסתכל, ונראה טוב. ', 'בדקתי. אתה בכיוון. '], c.seed) : c.mood === 'down' ? `${call(c, true)}הצצתי במה שקורה. `: '';
    return { ...m, body: `${open}${m.body}` };
  }

  if (PRAISE.test(id) || PRAISE.test(b)) return { ...m, body: `${praise(c)}${m.body}` };

  if (NAGS.test(b)) {
    const open = nagOpener(c);
    return open ? { ...m, body: `${open}${m.body}` } : m;
  }
  return m;
}

/** A word back when he answers with a drink, as a person would. */
export function drinkReply(total: number, target: number, seed: number, name?: string, avoid: string[] = []): string {
  const left = target - total;
  const l = (ml: number) => `${Math.round(ml / 100) / 10} ליטר`;
  // The name in about one reply of four, always at the goal
  const n = name && Math.floor(seed / 7) % 2 === 0 ? name : '';
  const atGoal = target > 0 && left <= 0;
  const list = atGoal
    ? [
        name ? `${name}, היעד בפנים. ככה עושים את זה.` : 'היעד בפנים. ככה עושים את זה.',
        name ? `זהו ${name}, ${l(total)}. היעד של היום בפנים.` : `זהו, ${l(total)}. היעד של היום בפנים.`,
        name ? `${l(total)}. כל הכבוד ${name}, סגרת את המים.` : `${l(total)}. כל הכבוד, סגרת את המים.`,
      ]
    : target > 0 && left <= 500
      ? [
          n ? `${n}, עוד קצת ואתה ביעד. ${l(total)}.` : `${l(total)}. עוד קצת ואתה ביעד.`,
          `יפה. נשארו רק ${l(left)}.`,
          `כמעט שם, ${l(left)} עד היעד.`,
          n ? `עוד ${l(left)} ${n}, וזה סגור.` : `עוד ${l(left)}, וזה סגור.`,
        ]
      : [
          n ? `יפה ${n}. ${l(total)} עד עכשיו.` : `יפה. ${l(total)} עד עכשיו.`,
          `ככה, לגימה אחרי לגימה. ${l(total)}.`,
          target > 0 ? `טוב. עוד ${l(left)} להיום.` : `טוב. ${l(total)} היום.`,
          n ? `${n}, ככה אני אוהב. ${l(total)}.` : `ככה אני אוהב. ${l(total)}.`,
          `נרשם. ${l(total)} היום${target > 0 ? `, עוד ${l(left)}` : ''}.`,
          n ? `תמשיך ככה ${n}. ${l(total)}.` : `תמשיך ככה. ${l(total)}.`,
        ];
  // Never the same opening as the last two replies
  const head = (x: string) => x.split(/[.,]/)[0].replace(name ?? '\u0000', '').trim();
  const used = avoid.map(head);
  let i = seed % list.length;
  for (let k = 0; k < list.length && used.includes(head(list[i])); k++) i = (i + 1) % list.length;
  return list[i];
}
