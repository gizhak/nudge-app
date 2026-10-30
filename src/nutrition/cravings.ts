// "I feel like something": a small local table of common snacks and foods, and advice that
// looks at what is left today, the hour and bedtime. No AI and nothing leaves the phone.
// Values are for a typical portion and are approximate.
import { MORE_FOODS } from './foodTable';

import { LANG } from '../i18n';
export type CravingKind = 'sweet' | 'salty' | 'cold' | 'savory' | 'drink';

export interface Food {
  id: string;
  name: string;
  /** Other words he might type */
  aliases?: string[];
  kinds: CravingKind[];
  portion: string;
  kcal: number;
  protein: number;
  sugar: number;
  fat: number;
  /** From his own log: how many times he logged it */
  mine?: number;
}

const BASE: Food[] = [
  { id: 'icecream', name: 'גלידה', aliases: ['גלידה כדור', 'ice cream'], kinds: ['sweet', 'cold'], portion: 'כדור אחד', kcal: 140, protein: 2.5, sugar: 15, fat: 7 },
  { id: 'icebar', name: 'שלגון', aliases: ['מגנום', 'קורנטו', 'אסקימו'], kinds: ['sweet', 'cold'], portion: 'שלגון אחד', kcal: 250, protein: 3, sugar: 22, fat: 16 },
  { id: 'popsicle', name: 'קרטיב', aliases: ['ארטיק', 'שלגון קרח'], kinds: ['sweet', 'cold'], portion: 'אחד', kcal: 70, protein: 0, sugar: 16, fat: 0 },
  { id: 'milkchoc', name: 'שוקולד חלב', aliases: ['שוקולד', 'פרה'], kinds: ['sweet'], portion: '4 קוביות', kcal: 108, protein: 1.5, sugar: 11, fat: 6 },
  { id: 'darkchoc', name: 'שוקולד מריר', aliases: ['מריר'], kinds: ['sweet'], portion: '4 קוביות, 70%', kcal: 120, protein: 2, sugar: 5, fat: 9 },
  { id: 'cookies', name: 'עוגיות', aliases: ['עוגיה', 'אוראו'], kinds: ['sweet'], portion: '3 עוגיות', kcal: 150, protein: 2, sugar: 9, fat: 7 },
  { id: 'cake', name: 'עוגה', aliases: ['פרוסת עוגה', 'עוגת שוקולד'], kinds: ['sweet'], portion: 'פרוסה', kcal: 300, protein: 4, sugar: 25, fat: 15 },
  { id: 'wafers', name: 'וופלים', aliases: ['וופל', 'ופלים'], kinds: ['sweet'], portion: '3 וופלים', kcal: 130, protein: 1.5, sugar: 9, fat: 7 },
  { id: 'krembo', name: 'קרמבו', kinds: ['sweet'], portion: 'אחד', kcal: 110, protein: 1, sugar: 15, fat: 4 },
  { id: 'milky', name: 'מילקי', kinds: ['sweet', 'cold'], portion: 'גביע', kcal: 170, protein: 4, sugar: 20, fat: 7 },
  { id: 'dates', name: 'תמרים', aliases: ['תמר', 'מג׳הול', "מג'הול"], kinds: ['sweet'], portion: '3 תמרי מג׳הול', kcal: 200, protein: 1.5, sugar: 48, fat: 0 },
  { id: 'banana', name: 'בננה', kinds: ['sweet'], portion: 'אחת', kcal: 105, protein: 1.3, sugar: 14, fat: 0.4 },
  { id: 'apple', name: 'תפוח', kinds: ['sweet'], portion: 'אחד', kcal: 95, protein: 0.5, sugar: 19, fat: 0.3 },
  { id: 'grapes', name: 'ענבים', kinds: ['sweet', 'cold'], portion: 'כוס', kcal: 100, protein: 1, sugar: 23, fat: 0.2 },
  { id: 'frozenfruit', name: 'פירות קפואים', aliases: ['פירות יער'], kinds: ['sweet', 'cold'], portion: 'כוס', kcal: 70, protein: 1, sugar: 12, fat: 0.5 },
  { id: 'proyogurt', name: 'יוגורט פרו', aliases: ['פרו', 'מעדן חלבון', 'פודינג חלבון', 'יופלה פרו'], kinds: ['sweet', 'cold'], portion: 'גביע', kcal: 111, protein: 20, sugar: 6, fat: 0.5 },
  { id: 'greek', name: 'יוגורט יווני 0%', aliases: ['יוגורט', 'יווני'], kinds: ['cold'], portion: '150 גרם', kcal: 90, protein: 15, sugar: 5, fat: 0 },
  { id: 'proyogurt_fruit', name: 'יוגורט פרו עם פירות קפואים', aliases: [], kinds: ['sweet', 'cold'], portion: 'גביע וחצי כוס פירות', kcal: 150, protein: 20, sugar: 12, fat: 1 },
  { id: 'cottage', name: 'קוטג׳', aliases: ["קוטג'", 'קוטג'], kinds: ['savory', 'cold'], portion: 'חצי גביע', kcal: 120, protein: 13, sugar: 3, fat: 6 },
  { id: 'whitecheese', name: 'גבינה לבנה 5%', aliases: ['גבינה לבנה'], kinds: ['savory', 'cold'], portion: '100 גרם', kcal: 100, protein: 9, sugar: 3, fat: 5 },
  { id: 'egg', name: 'ביצה קשה', aliases: ['ביצה'], kinds: ['savory'], portion: 'אחת', kcal: 75, protein: 6.5, sugar: 0, fat: 5 },
  { id: 'proteinbar', name: 'חטיף חלבון', aliases: ['פרוטאין בר'], kinds: ['sweet'], portion: 'אחד', kcal: 200, protein: 20, sugar: 3, fat: 7 },
  { id: 'shake', name: 'שייק חלבון', aliases: ['אבקת חלבון', 'שייק'], kinds: ['sweet', 'cold', 'drink'], portion: 'מנה במים', kcal: 120, protein: 24, sugar: 2, fat: 1.5 },
  { id: 'bamba', name: 'במבה', kinds: ['salty'], portion: 'שקית קטנה', kcal: 135, protein: 4, sugar: 0.5, fat: 8 },
  { id: 'bissli', name: 'ביסלי', kinds: ['salty'], portion: 'שקית קטנה', kcal: 125, protein: 2.5, sugar: 1, fat: 6 },
  { id: 'chips', name: 'צ׳יפס', aliases: ["צ'יפס", 'ציפס', 'תפוצ׳יפס'], kinds: ['salty'], portion: 'שקית 50 גרם', kcal: 270, protein: 3, sugar: 0.5, fat: 17 },
  { id: 'popcorn', name: 'פופקורן', kinds: ['salty'], portion: 'שקית מיקרוגל קטנה', kcal: 160, protein: 2.5, sugar: 0, fat: 10 },
  { id: 'pretzel', name: 'בייגלה', aliases: ['בייגלך'], kinds: ['salty'], portion: '30 גרם', kcal: 115, protein: 3, sugar: 1, fat: 1 },
  { id: 'nuts', name: 'אגוזים', aliases: ['שקדים', 'קשיו', 'פיסטוקים'], kinds: ['salty'], portion: 'חופן', kcal: 180, protein: 6, sugar: 1, fat: 16 },
  { id: 'seeds', name: 'גרעינים לבנים', aliases: ['גרעינים', 'גרעיני אבטיח'], kinds: ['salty'], portion: 'חופן עם קליפה', kcal: 150, protein: 6, sugar: 0.7, fat: 13 },
  { id: 'ricecakes', name: 'פריכיות', aliases: ['פריכית'], kinds: ['salty'], portion: '2 פריכיות', kcal: 70, protein: 1.5, sugar: 0, fat: 0.5 },
  { id: 'ricecakes_cottage', name: 'פריכיות עם קוטג׳', aliases: [], kinds: ['salty', 'savory'], portion: '2 פריכיות ורבע גביע', kcal: 130, protein: 8, sugar: 1.5, fat: 3.5 },
  { id: 'tuna', name: 'טונה במים', aliases: ['טונה'], kinds: ['savory'], portion: 'קופסה', kcal: 120, protein: 26, sugar: 0, fat: 1 },
  { id: 'toast', name: 'טוסט גבינה', aliases: ['טוסט'], kinds: ['savory'], portion: 'אחד', kcal: 350, protein: 18, sugar: 4, fat: 15 },
  { id: 'pita_hummus', name: 'פיתה עם חומוס', aliases: ['חומוס'], kinds: ['savory'], portion: 'פיתה', kcal: 400, protein: 13, sugar: 3, fat: 14 },
  { id: 'pizza', name: 'פיצה', kinds: ['savory'], portion: 'משולש', kcal: 285, protein: 12, sugar: 4, fat: 10 },
  { id: 'shawarma', name: 'שווארמה', aliases: ['שוארמה'], kinds: ['savory'], portion: 'בפיתה', kcal: 700, protein: 40, sugar: 5, fat: 35 },
  { id: 'burger', name: 'המבורגר', kinds: ['savory'], portion: 'בלחמניה', kcal: 550, protein: 30, sugar: 8, fat: 28 },
  { id: 'cereal', name: 'קורנפלקס עם חלב', aliases: ['קורנפלקס', 'דגני בוקר'], kinds: ['sweet'], portion: 'קערה', kcal: 220, protein: 9, sugar: 20, fat: 2.5 },
  { id: 'choco', name: 'שוקו', kinds: ['sweet', 'drink', 'cold'], portion: 'כוס', kcal: 160, protein: 8, sugar: 25, fat: 2.5 },
  { id: 'cola', name: 'קולה', aliases: ['קוקה קולה', 'משקה מוגז'], kinds: ['sweet', 'drink', 'cold'], portion: 'פחית', kcal: 140, protein: 0, sugar: 39, fat: 0 },
  { id: 'colazero', name: 'קולה זירו', aliases: ['זירו', 'דיאט'], kinds: ['drink', 'cold'], portion: 'פחית', kcal: 1, protein: 0, sugar: 0, fat: 0 },
  { id: 'teasugar', name: 'תה עם סוכר', aliases: ['תה מתוק', 'תה עם כפית סוכר'], kinds: ['drink', 'sweet'], portion: 'כוס, 2 כפיות', kcal: 32, protein: 0, sugar: 8, fat: 0 },
  { id: 'coffee', name: 'קפה הפוך', aliases: ['הפוך', 'קפה', 'קפוצ׳ינו', 'לאטה'], kinds: ['drink'], portion: 'כוס, חלב 1%', kcal: 90, protein: 6, sugar: 9, fat: 2 },
  { id: 'beer', name: 'בירה', kinds: ['drink', 'cold'], portion: 'בקבוק 330', kcal: 145, protein: 1.5, sugar: 0, fat: 0 },
  { id: 'wine', name: 'יין', kinds: ['drink'], portion: 'כוס', kcal: 125, protein: 0, sugar: 1, fat: 0 },
  { id: 'tea', name: 'תה צמחים', aliases: ['תה', 'תה נענע', 'נענע', 'קמומיל', 'תה ירוק'], kinds: ['drink'], portion: 'כוס', kcal: 0, protein: 0, sugar: 0, fat: 0 },
];

export const FOODS: Food[] = [...BASE, ...MORE_FOODS];

const GENERIC = /^(ארוחה|ארוחת|מנה|food|meal)$/i;
const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};

/**
 * His own foods, from what he logged (the food app's values and his portions): one entry per
 * name, the median of its logs, most logged first.
 */
export function personalFoods(items: { name: string; kcal: number; protein: number; sugar?: number; fat?: number }[]): Food[] {
  const by = new Map<string, typeof items>();
  for (const i of items) {
    const name = i.name?.trim();
    if (!name || GENERIC.test(name) || !(i.kcal > 0)) continue;
    const key = norm(name);
    by.set(key, [...(by.get(key) ?? []), i]);
  }
  const out: Food[] = [];
  for (const [key, list] of by) {
    const kcal = Math.round(median(list.map((x) => x.kcal)));
    const protein = Math.round(median(list.map((x) => x.protein)) * 10) / 10;
    const sugars = list.map((x) => x.sugar).filter((x): x is number => x != null);
    const fats = list.map((x) => x.fat).filter((x): x is number => x != null);
    const sugar = sugars.length ? Math.round(median(sugars) * 10) / 10 : 0;
    const known = findFood(key)[0];
    const kinds: CravingKind[] =
      kcal > 0 && (sugar * 4) / kcal >= 0.3 ? ['sweet'] : known ? known.kinds : (protein * 4) / kcal >= 0.25 ? ['savory'] : ['savory'];
    out.push({
      id: `my:${key}`,
      name: list[list.length - 1].name.trim(),
      kinds,
      portion: list.length > 1 ? `כמו שאתה רושם, ${list.length} פעמים` : 'כמו שרשמת',
      kcal,
      protein,
      sugar,
      fat: fats.length ? Math.round(median(fats) * 10) / 10 : 0,
      mine: list.length,
    });
  }
  return out.sort((a, b) => (b.mine ?? 0) - (a.mine ?? 0));
}

export const KIND_LABEL: Record<CravingKind, string> =
  LANG === 'en'
    ? { sweet: 'Sweet', salty: 'Salty', cold: 'Something cold', savory: 'Something savory', drink: 'A drink' }
    : { sweet: 'מתוק', salty: 'מלוח', cold: 'משהו קר', savory: 'משהו של אוכל', drink: 'לשתות' };

const norm = (s: string) => s.trim().toLowerCase().replace(/[׳']/g, "'");

/** Foods matching what he typed, best first. */
export function findFood(text: string, mine: Food[] = []): Food[] {
  const q = norm(text);
  if (!q) return [];
  const names = (f: Food) => [f.name, ...(f.aliases ?? [])].map(norm);
  const STOP = new Set(['ללא', 'בלי', 'עם', 'של', 'קצת', 'משהו']);
  const words = (x: string) => x.split(/\s+/).filter((w) => w.length >= 2 && !STOP.has(w));
  // The first word says what it is ("cherries without sugar" is cherries, not sugar)
  const qw = words(q).slice(0, 1);
  // Exact name, then a name that starts with or contains what he typed, then any shared word
  const score = (f: Food) => {
    const ns = names(f);
    if (ns.some((n) => n === q)) return 4;
    if (ns.some((n) => n.startsWith(q))) return 3;
    if (q.length >= 3 && ns.some((n) => n.includes(q) || (q.includes(n) && n.length >= 5))) return 2;
    const nw = ns.flatMap(words);
    if (qw.some((w) => nw.some((x) => x === w || (w.length >= 3 && x.startsWith(w))))) return 1;
    return 0;
  };
  // His own foods first among equals
  return [...mine, ...FOODS]
    .map((f) => ({ f, sc: score(f) + (f.mine ? 0.5 : 0) }))
    .filter((x) => x.sc >= 1)
    .sort((a, b) => b.sc - a.sc)
    .map((x) => x.f);
}

export interface CravingContext {
  now: Date;
  /** Calories left today (negative when over) */
  kcalLeft: number;
  proteinLeft: number;
  /** Minutes after midnight */
  bedTime: number;
}

export type Call = 'go' | 'small' | 'swap';

export interface Advice {
  call: Call;
  title: string;
  lines: string[];
  /** Better choices for the same craving */
  swaps: Food[];
}

const proteinShare = (f: Food) => (f.kcal > 0 ? (f.protein * 4) / f.kcal : 0);
const r = Math.round;

/** Minutes until bedtime, through midnight. */
export function toBed(now: Date, bedTime: number): number {
  const m = now.getHours() * 60 + now.getMinutes();
  let d = bedTime - m;
  if (d < -6 * 60) d += 1440;
  return d;
}

/** Better picks for the same craving: fewer calories, more protein. */
export function swapsFor(food: Food, n = 2, mine: Food[] = []): Food[] {
  const seen = new Set<string>([norm(food.name)]);
  return [...mine, ...FOODS].filter((f) => !seen.has(norm(f.name)) && (seen.add(norm(f.name)), true) && f.id !== food.id && f.kinds.some((k) => food.kinds.includes(k)) && f.kcal <= food.kcal * 0.85 && f.kcal > 0)
    .sort((a, b) => proteinShare(b) - proteinShare(a) || a.kcal - b.kcal)
    .slice(0, n);
}

export function advise(food: Food, c: CravingContext, mine: Food[] = []): Advice {
  const bed = toBed(c.now, c.bedTime);
  const late = bed <= 120 || c.now.getHours() >= 22;
  const after = c.kcalLeft - food.kcal;
  const lines: string[] = [];
  lines.push(`${food.name}, ${food.portion}: בערך ${food.kcal} קלוריות, ${r(food.sugar)} גרם סוכר, ${r(food.fat)} גרם שומן, ${r(food.protein)} גרם חלבון.`);
  lines.push(
    c.kcalLeft <= 0
      ? `כבר עברת היום את היעד ב ${r(-c.kcalLeft)} קלוריות.`
      : after >= 0
        ? `נשארו לך ${r(c.kcalLeft)} קלוריות. אחרי זה: ${r(after)}.`
        : `נשארו לך ${r(c.kcalLeft)} קלוריות. זה יעביר אותך ב ${r(-after)}.`,
  );
  const swaps = swapsFor(food, 2, mine);
  const lean = proteinShare(food) >= 0.25;

  // Almost nothing in it
  if (food.kcal < 20) {
    return { call: 'go', title: 'לך על זה', lines: [`${food.name}: כמעט בלי קלוריות. בחירה מצוינת, גם בערב.`], swaps: [] };
  }
  // Fits, and it is a good choice anyway
  if (lean && after >= 0) {
    return { call: 'go', title: 'לך על זה', lines: [...lines, 'בחירה טובה: הרבה חלבון ביחס לקלוריות.'], swaps: [] };
  }
  // Heavy food close to bed
  if (late && food.kcal > 300) {
    const h = Math.floor(bed / 60);
    const inText = bed < 60 ? `${bed} דקות` : h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
    lines.push(`${bed > 0 ? `אתה הולך לישון בעוד ${inText}` : 'כבר שעת שינה'}. ארוחה כבדה עכשיו פוגעת בשינה, ושינה קצרה מגדילה רעב מחר.`);
    return { call: 'swap', title: 'לא עכשיו', lines, swaps };
  }
  // Over the day
  if (after < 0) {
    const half = c.kcalLeft - food.kcal / 2;
    if (half >= 0 && food.kcal >= 120) {
      lines.push(`חצי מנה נכנסת. ${swaps.length ? 'או קח משהו שעונה על אותו חשק בפחות:' : ''}`);
      return { call: 'small', title: 'רק חצי', lines, swaps };
    }
    lines.push(swaps.length ? 'עדיף משהו שעונה על אותו חשק בפחות:' : 'אם אתה בכל זאת אוכל, קח מנה קטנה ותמשיך מחר כרגיל.');
    return { call: 'swap', title: 'עדיף משהו אחר', lines, swaps };
  }
  // Sweet late at night
  if (late && food.sugar >= 15) {
    lines.push('זה נכנס בתקציב, אבל סוכר לפני השינה פוגע בשינה ומגביר חשקים מחר. אם כבר, מנה אחת בלי השלמות.');
    return { call: 'small', title: 'מנה אחת וזהו', lines, swaps };
  }
  if (c.proteinLeft > 30 && swaps.some((s) => proteinShare(s) >= 0.25)) {
    lines.push(`זה נכנס. אבל חסרים לך עוד ${r(c.proteinLeft)} גרם חלבון היום, ויש חלופה שמשלימה אותם:`);
    return { call: 'go', title: 'נכנס', lines, swaps: swaps.filter((s) => proteinShare(s) >= 0.25) };
  }
  lines.push('נכנס בתקציב. תהנה, מנה אחת.');
  return { call: 'go', title: 'נכנס', lines, swaps: [] };
}

/** Sweet after 21:00 on at least 3 of the last 7 evenings: the coach says something first. */
export function eveningPattern(items: { time: Date; name: string; kcal: number; protein: number; sugar?: number }[], now: Date): number {
  const days = new Set<string>();
  const SWEET = /(גלידה|שוקולד|עוגי|עוגה|וופל|קרמבו|במבה|ביסלי|צ'יפס|צ׳יפס|ממתק|סוכרי|תמר|מילקי|שלגון|chocolate|ice cream|cookie|cake)/i;
  for (const i of items) {
    if (i.time.getTime() > now.getTime() - 7 * 86400000 && i.time.getHours() >= 21) {
      const sugary = i.sugar != null && i.kcal > 0 && (i.sugar * 4) / i.kcal >= 0.3;
      if (sugary || SWEET.test(i.name)) days.add(i.time.toDateString());
    }
  }
  return days.size;
}
