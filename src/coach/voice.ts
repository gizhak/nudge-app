// Pure: the coach as a person. Same facts, said by someone who is glad when he does well,
// gets annoyed when he keeps ignoring, and remembers how the day is going.
// No swearing and nothing about his body: anger at the behaviour, never at him.
import type { CoachMessage } from './rules';

import { t } from '../i18n';
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
      n ? t(`יפה, ${n}. `, `Nice, ${n}. `) : t('יפה. ', 'Nice. '),
      t('זה בדיוק מה שאני רוצה לראות. ', 'That is exactly what I want to see. '),
      n ? t(`ככה עושים את זה, ${n}. `, `That's how it's done, ${n}. `) : t('ככה עושים את זה. ', 'That\'s how it\'s done. '),
      t('כל הכבוד. ', 'Well done. '),
      c.mood === 'up' ? t('אתה על גל טוב היום. ', 'You are on a roll today. ') : t('הנה, ככה. ', 'There you go. '),
    ],
    c.seed,
  );
}

/** The opener for a nag, by how many times he already ignored it today and how hard the coach may push. */
function nagOpener(c: VoiceCtx): string {
  if (c.ignored <= 0) {
    if (c.mood === 'down' && c.harsh !== 'soft') return pick([t(`${call(c)}היום לא הולך כמו שצריך. `, `${call(c)}Today is not going the way it should. `), t('בוא נתקן את היום. ', 'Let\'s fix the day. '), ''], c.seed);
    return '';
  }
  const when = c.ackedAt ? t(` ב ${c.ackedAt}`, ` at ${c.ackedAt}`) : '';
  if (c.ignored === 1) return pick([t(`${call(c, true)}שוב אני. אמרת הבנתי${when}, ועדיין לא. `, `${call(c, true)}Me again. You said got it${when}, and still not. `), t(`אמרת הבנתי${when}, ולא קרה כלום. `, `You said got it${when}, and nothing happened. `), t(`${call(c)}אני חוזר על זה כי זה חשוב. אמרת הבנתי${when}. `, `${call(c)}I am repeating this because it matters. You said got it${when}. `)], c.seed);
  // Twice and more: the coach is annoyed, as much as the level allows
  if (c.harsh === 'soft') return t(`${call(c, true)}אני יודע שזה לא תמיד קל. `, `${call(c, true)}I know it is not always easy. `);
  if (c.harsh === 'medium') return t(`${call(c, true)}זו הפעם ה ${c.ignored + 1} היום. אני לא מוותר. `, `${call(c, true)}This is time number ${c.ignored + 1} today. I am not giving up. `);
  const why = c.whyNow?.trim() && c.seed % 2 === 0 ? t(` זוכר למה התחלת? "${c.whyNow.trim()}".`, ` Remember why you started? "${c.whyNow.trim()}".`) : '';
  return t(`${call(c, true)}זו הפעם ה ${c.ignored + 1} שאתה אומר הבנתי ולא עושה. אני לא מוותר.${why} `, `${call(c, true)}This is time number ${c.ignored + 1} you say got it and don't do it. I am not giving up.${why} `);
}

export function voice(m: CoachMessage, c: VoiceCtx): CoachMessage {
  const id = m.id;
  const b = base(id);

  // Food the user logged: warm when good, a frown when not, with what is still missing
  if (m.meal) {
    if (m.meal.good) {
      const missing = c.proteinLeft >= 40 && c.hour >= 12 ? t(` רק זכור שחסרים לך עוד ${Math.round(c.proteinLeft)} גרם חלבון, והיום מתקצר.`, ` Just remember you still need ${Math.round(c.proteinLeft)} grams of protein, and the day is getting shorter.`) : '';
      return { ...m, body: `${praise(c)}${m.body}${missing}` };
    }
    const frown = c.harsh === 'soft' ? t('לא נורא, אבל ', 'Not a big deal, but ') : c.harsh === 'medium' ? t(`${call(c)}זה לא בשביל המטרה שלך. `, `${call(c)}That is not for your goal. `) : t(`${call(c, true)}ככה לא מגיעים למטרה. `, `${call(c, true)}That is not how you reach the goal. `);
    return { ...m, body: `${frown}${m.body}` };
  }

  if (b === 'missed_workout' || b === 'week_behind' || b === 'long_break') {
    const line =
      c.harsh === 'soft'
        ? t('לא נורא, קורה. מחר משלימים. ', 'Not a big deal, it happens. Tomorrow we make up for it. ')
        : c.harsh === 'medium'
          ? t(`${call(c)}זה לא מקדם אותך. בלי תירוצים. `, `${call(c)}That does not move you forward. No excuses. `)
          : t(`${call(c, true)}הבטחת לעצמך שזה לא יקרה. אז מה, מוותרים? `, `${call(c, true)}You promised yourself this would not happen. So what, giving up? `);
    return { ...m, body: `${line}${m.body}` };
  }

  if (b === 'day_summary') {
    const close =
      c.mood === 'up'
        ? pick([t(' גאה בך היום.', ' Proud of you today.'), t(' ככה ממשיכים.', ' That\'s how we keep going.'), c.name ? t(` יום טוב, ${c.name}. לך לישון.`, ` A good day, ${c.name}. Go to sleep.`) : t(' יום טוב. לך לישון.', ' A good day. Go to sleep.')], c.seed)
        : c.mood === 'down'
          ? c.harsh === 'strong'
            ? pick([t(' היום לא היה שלך. מחר אני מצפה ליותר.', ' Today was not yours. Tomorrow I expect more.'), t(' זה לא היום שרצינו. מחר מתקנים, ואני אבדוק.', ' Not the day we wanted. Tomorrow we fix it, and I will check.')], c.seed)
            : t(' מחר יום חדש.', ' Tomorrow is a new day.')
          : pick([t(' לא רע, אבל יש מה לשפר.', ' Not bad, but there is room to improve.'), t(' בסדר. מחר קצת יותר.', ' OK. A bit more tomorrow.')], c.seed);
    return { ...m, body: `${m.body}${close}` };
  }

  if (/^checkin@/.test(id)) {
    const open = c.mood === 'up' ? pick([t('אני מסתכל, ונראה טוב. ', 'I am watching, and it looks good. '), t('בדקתי. אתה בכיוון. ', 'I checked. You are on track. ')], c.seed) : c.mood === 'down' ? t(`${call(c, true)}הצצתי במה שקורה. `, `${call(c, true)}I took a look at what is going on. `): '';
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
  const l = (ml: number) => t(`${Math.round(ml / 100) / 10} ליטר`, `${Math.round(ml / 100) / 10} L`);
  // The name in about one reply of four, always at the goal
  const n = name && Math.floor(seed / 7) % 2 === 0 ? name : '';
  const atGoal = target > 0 && left <= 0;
  const list = atGoal
    ? [
        name ? t(`${name}, היעד בפנים. ככה עושים את זה.`, `${name}, the goal is in. That's how it's done.`) : t('היעד בפנים. ככה עושים את זה.', 'The goal is in. That\'s how it\'s done.'),
        name ? t(`זהו ${name}, ${l(total)}. היעד של היום בפנים.`, `That's it ${name}, ${l(total)}. Today's goal is in.`) : t(`זהו, ${l(total)}. היעד של היום בפנים.`, `That's it, ${l(total)}. Today's goal is in.`),
        name ? t(`${l(total)}. כל הכבוד ${name}, סגרת את המים.`, `${l(total)}. Well done ${name}, you closed out the water.`) : t(`${l(total)}. כל הכבוד, סגרת את המים.`, `${l(total)}. Well done, you closed out the water.`),
      ]
    : target > 0 && left <= 500
      ? [
          n ? t(`${n}, עוד קצת ואתה ביעד. ${l(total)}.`, `${n}, a little more and you are on target. ${l(total)}.`) : t(`${l(total)}. עוד קצת ואתה ביעד.`, `${l(total)}. A little more and you are on target.`),
          t(`יפה. נשארו רק ${l(left)}.`, `Nice. Only ${l(left)} left.`),
          t(`כמעט שם, ${l(left)} עד היעד.`, `Almost there, ${l(left)} to the goal.`),
          n ? t(`עוד ${l(left)} ${n}, וזה סגור.`, `${l(left)} more ${n}, and it is done.`) : t(`עוד ${l(left)}, וזה סגור.`, `${l(left)} more, and it is done.`),
        ]
      : [
          n ? t(`יפה ${n}. ${l(total)} עד עכשיו.`, `Nice ${n}. ${l(total)} so far.`) : t(`יפה. ${l(total)} עד עכשיו.`, `Nice. ${l(total)} so far.`),
          t(`ככה, לגימה אחרי לגימה. ${l(total)}.`, `That's it, sip after sip. ${l(total)}.`),
          target > 0 ? t(`טוב. עוד ${l(left)} להיום.`, `Good. ${l(left)} more today.`) : t(`טוב. ${l(total)} היום.`, `Good. ${l(total)} today.`),
          n ? t(`${n}, ככה אני אוהב. ${l(total)}.`, `${n}, that's what I like. ${l(total)}.`) : t(`ככה אני אוהב. ${l(total)}.`, `That's what I like. ${l(total)}.`),
          t(`נרשם. ${l(total)} היום${target > 0 ? `, עוד ${l(left)}` : ''}.`, `Logged. ${l(total)} today${target > 0 ? `, ${l(left)} to go` : ''}.`),
          n ? t(`תמשיך ככה ${n}. ${l(total)}.`, `Keep it up ${n}. ${l(total)}.`) : t(`תמשיך ככה. ${l(total)}.`, `Keep it up. ${l(total)}.`),
        ];
  // Never the same opening as the last two replies
  const head = (x: string) => x.split(/[.,]/)[0].replace(name ?? '\u0000', '').trim();
  const used = avoid.map(head);
  let i = seed % list.length;
  for (let k = 0; k < list.length && used.includes(head(list[i])); k++) i = (i + 1) % list.length;
  return list[i];
}
