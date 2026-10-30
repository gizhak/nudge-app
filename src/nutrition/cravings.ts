// "I feel like something": a small local table of common snacks and foods, and advice that
// looks at what is left today, the hour and bedtime. No AI and nothing leaves the phone.
// Values are for a typical portion and are approximate.
import { MORE_FOODS } from './foodTable';

import { LANG, t } from '../i18n';
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

/** A food's shown name; the Hebrew one still matches what he types */
const HE_NAME = new Map<string, string>();
const nm = (he: string, en: string) => {
  const v = t(he, en);
  if (v !== he) HE_NAME.set(v, he);
  return v;
};

const BASE: Food[] = [
  { id: 'icecream', name: nm('גלידה', 'Ice cream'), aliases: ['גלידה כדור', 'ice cream'], kinds: ['sweet', 'cold'], portion: t('כדור אחד', 'One scoop'), kcal: 140, protein: 2.5, sugar: 15, fat: 7 },
  { id: 'icebar', name: nm('שלגון', 'Ice cream bar'), aliases: ['מגנום', 'קורנטו', 'אסקימו'], kinds: ['sweet', 'cold'], portion: t('שלגון אחד', 'One bar'), kcal: 250, protein: 3, sugar: 22, fat: 16 },
  { id: 'popsicle', name: nm('קרטיב', 'Popsicle'), aliases: ['ארטיק', 'שלגון קרח'], kinds: ['sweet', 'cold'], portion: t('אחד', 'One'), kcal: 70, protein: 0, sugar: 16, fat: 0 },
  { id: 'milkchoc', name: nm('שוקולד חלב', 'Milk chocolate'), aliases: ['שוקולד', 'פרה'], kinds: ['sweet'], portion: t('4 קוביות', '4 squares'), kcal: 108, protein: 1.5, sugar: 11, fat: 6 },
  { id: 'darkchoc', name: nm('שוקולד מריר', 'Dark chocolate'), aliases: ['מריר'], kinds: ['sweet'], portion: t('4 קוביות, 70%', '4 squares, 70%'), kcal: 120, protein: 2, sugar: 5, fat: 9 },
  { id: 'cookies', name: nm('עוגיות', 'Cookies'), aliases: ['עוגיה', 'אוראו'], kinds: ['sweet'], portion: t('3 עוגיות', '3 cookies'), kcal: 150, protein: 2, sugar: 9, fat: 7 },
  { id: 'cake', name: nm('עוגה', 'Cake'), aliases: ['פרוסת עוגה', 'עוגת שוקולד'], kinds: ['sweet'], portion: t('פרוסה', 'A slice'), kcal: 300, protein: 4, sugar: 25, fat: 15 },
  { id: 'wafers', name: nm('וופלים', 'Wafers'), aliases: ['וופל', 'ופלים'], kinds: ['sweet'], portion: t('3 וופלים', '3 wafers'), kcal: 130, protein: 1.5, sugar: 9, fat: 7 },
  { id: 'krembo', name: nm('קרמבו', 'Krembo'), kinds: ['sweet'], portion: t('אחד', 'One'), kcal: 110, protein: 1, sugar: 15, fat: 4 },
  { id: 'milky', name: nm('מילקי', 'Milky pudding'), kinds: ['sweet', 'cold'], portion: t('גביע', 'A cup'), kcal: 170, protein: 4, sugar: 20, fat: 7 },
  { id: 'dates', name: nm('תמרים', 'Dates'), aliases: ['תמר', 'מג׳הול', "מג'הול"], kinds: ['sweet'], portion: t('3 תמרי מג׳הול', '3 Medjool dates'), kcal: 200, protein: 1.5, sugar: 48, fat: 0 },
  { id: 'banana', name: nm('בננה', 'Banana'), kinds: ['sweet'], portion: t('אחת', 'One'), kcal: 105, protein: 1.3, sugar: 14, fat: 0.4 },
  { id: 'apple', name: nm('תפוח', 'Apple'), kinds: ['sweet'], portion: t('אחד', 'One'), kcal: 95, protein: 0.5, sugar: 19, fat: 0.3 },
  { id: 'grapes', name: nm('ענבים', 'Grapes'), kinds: ['sweet', 'cold'], portion: t('כוס', 'A cup'), kcal: 100, protein: 1, sugar: 23, fat: 0.2 },
  { id: 'frozenfruit', name: nm('פירות קפואים', 'Frozen fruit'), aliases: ['פירות יער'], kinds: ['sweet', 'cold'], portion: t('כוס', 'A cup'), kcal: 70, protein: 1, sugar: 12, fat: 0.5 },
  { id: 'proyogurt', name: nm('יוגורט פרו', 'Pro yogurt'), aliases: ['פרו', 'מעדן חלבון', 'פודינג חלבון', 'יופלה פרו'], kinds: ['sweet', 'cold'], portion: t('גביע', 'A cup'), kcal: 111, protein: 20, sugar: 6, fat: 0.5 },
  { id: 'greek', name: nm('יוגורט יווני 0%', 'Greek yogurt 0%'), aliases: ['יוגורט', 'יווני'], kinds: ['cold'], portion: t('150 גרם', '150 grams'), kcal: 90, protein: 15, sugar: 5, fat: 0 },
  { id: 'proyogurt_fruit', name: nm('יוגורט פרו עם פירות קפואים', 'Pro yogurt with frozen fruit'), aliases: [], kinds: ['sweet', 'cold'], portion: t('גביע וחצי כוס פירות', 'A cup and half a cup of fruit'), kcal: 150, protein: 20, sugar: 12, fat: 1 },
  { id: 'cottage', name: nm('קוטג׳', 'Cottage cheese'), aliases: ["קוטג'", 'קוטג'], kinds: ['savory', 'cold'], portion: t('חצי גביע', 'Half a cup'), kcal: 120, protein: 13, sugar: 3, fat: 6 },
  { id: 'whitecheese', name: nm('גבינה לבנה 5%', 'White cheese 5%'), aliases: ['גבינה לבנה'], kinds: ['savory', 'cold'], portion: t('100 גרם', '100 grams'), kcal: 100, protein: 9, sugar: 3, fat: 5 },
  { id: 'egg', name: nm('ביצה קשה', 'Hard boiled egg'), aliases: ['ביצה'], kinds: ['savory'], portion: t('אחת', 'One'), kcal: 75, protein: 6.5, sugar: 0, fat: 5 },
  { id: 'proteinbar', name: nm('חטיף חלבון', 'Protein bar'), aliases: ['פרוטאין בר'], kinds: ['sweet'], portion: t('אחד', 'One'), kcal: 200, protein: 20, sugar: 3, fat: 7 },
  { id: 'shake', name: nm('שייק חלבון', 'Protein shake'), aliases: ['אבקת חלבון', 'שייק'], kinds: ['sweet', 'cold', 'drink'], portion: t('מנה במים', 'A serving in water'), kcal: 120, protein: 24, sugar: 2, fat: 1.5 },
  { id: 'bamba', name: nm('במבה', 'Bamba'), kinds: ['salty'], portion: t('שקית קטנה', 'A small bag'), kcal: 135, protein: 4, sugar: 0.5, fat: 8 },
  { id: 'bissli', name: nm('ביסלי', 'Bissli'), kinds: ['salty'], portion: t('שקית קטנה', 'A small bag'), kcal: 125, protein: 2.5, sugar: 1, fat: 6 },
  { id: 'chips', name: nm('צ׳יפס', 'Chips'), aliases: ["צ'יפס", 'ציפס', 'תפוצ׳יפס'], kinds: ['salty'], portion: t('שקית 50 גרם', 'A 50 gram bag'), kcal: 270, protein: 3, sugar: 0.5, fat: 17 },
  { id: 'popcorn', name: nm('פופקורן', 'Popcorn'), kinds: ['salty'], portion: t('שקית מיקרוגל קטנה', 'A small microwave bag'), kcal: 160, protein: 2.5, sugar: 0, fat: 10 },
  { id: 'pretzel', name: nm('בייגלה', 'Pretzels'), aliases: ['בייגלך'], kinds: ['salty'], portion: t('30 גרם', '30 grams'), kcal: 115, protein: 3, sugar: 1, fat: 1 },
  { id: 'nuts', name: nm('אגוזים', 'Nuts'), aliases: ['שקדים', 'קשיו', 'פיסטוקים'], kinds: ['salty'], portion: t('חופן', 'A handful'), kcal: 180, protein: 6, sugar: 1, fat: 16 },
  { id: 'seeds', name: nm('גרעינים לבנים', 'Sunflower seeds'), aliases: ['גרעינים', 'גרעיני אבטיח'], kinds: ['salty'], portion: t('חופן עם קליפה', 'A handful in the shell'), kcal: 150, protein: 6, sugar: 0.7, fat: 13 },
  { id: 'ricecakes', name: nm('פריכיות', 'Rice cakes'), aliases: ['פריכית'], kinds: ['salty'], portion: t('2 פריכיות', '2 rice cakes'), kcal: 70, protein: 1.5, sugar: 0, fat: 0.5 },
  { id: 'ricecakes_cottage', name: nm('פריכיות עם קוטג׳', 'Rice cakes with cottage'), aliases: [], kinds: ['salty', 'savory'], portion: t('2 פריכיות ורבע גביע', '2 rice cakes and a quarter cup'), kcal: 130, protein: 8, sugar: 1.5, fat: 3.5 },
  { id: 'tuna', name: nm('טונה במים', 'Tuna in water'), aliases: ['טונה'], kinds: ['savory'], portion: t('קופסה', 'A can'), kcal: 120, protein: 26, sugar: 0, fat: 1 },
  { id: 'toast', name: nm('טוסט גבינה', 'Cheese toast'), aliases: ['טוסט'], kinds: ['savory'], portion: t('אחד', 'One'), kcal: 350, protein: 18, sugar: 4, fat: 15 },
  { id: 'pita_hummus', name: nm('פיתה עם חומוס', 'Pita with hummus'), aliases: ['חומוס'], kinds: ['savory'], portion: t('פיתה', 'A pita'), kcal: 400, protein: 13, sugar: 3, fat: 14 },
  { id: 'pizza', name: nm('פיצה', 'Pizza'), kinds: ['savory'], portion: t('משולש', 'A slice'), kcal: 285, protein: 12, sugar: 4, fat: 10 },
  { id: 'shawarma', name: nm('שווארמה', 'Shawarma'), aliases: ['שוארמה'], kinds: ['savory'], portion: t('בפיתה', 'In a pita'), kcal: 700, protein: 40, sugar: 5, fat: 35 },
  { id: 'burger', name: nm('המבורגר', 'Hamburger'), kinds: ['savory'], portion: t('בלחמניה', 'In a bun'), kcal: 550, protein: 30, sugar: 8, fat: 28 },
  { id: 'cereal', name: nm('קורנפלקס עם חלב', 'Cornflakes with milk'), aliases: ['קורנפלקס', 'דגני בוקר'], kinds: ['sweet'], portion: t('קערה', 'A bowl'), kcal: 220, protein: 9, sugar: 20, fat: 2.5 },
  { id: 'choco', name: nm('שוקו', 'Chocolate milk'), kinds: ['sweet', 'drink', 'cold'], portion: t('כוס', 'A cup'), kcal: 160, protein: 8, sugar: 25, fat: 2.5 },
  { id: 'cola', name: nm('קולה', 'Cola'), aliases: ['קוקה קולה', 'משקה מוגז'], kinds: ['sweet', 'drink', 'cold'], portion: t('פחית', 'A can'), kcal: 140, protein: 0, sugar: 39, fat: 0 },
  { id: 'colazero', name: nm('קולה זירו', 'Cola Zero'), aliases: ['זירו', 'דיאט'], kinds: ['drink', 'cold'], portion: t('פחית', 'A can'), kcal: 1, protein: 0, sugar: 0, fat: 0 },
  { id: 'teasugar', name: nm('תה עם סוכר', 'Tea with sugar'), aliases: ['תה מתוק', 'תה עם כפית סוכר'], kinds: ['drink', 'sweet'], portion: t('כוס, 2 כפיות', 'A cup, 2 teaspoons'), kcal: 32, protein: 0, sugar: 8, fat: 0 },
  { id: 'coffee', name: nm('קפה הפוך', 'Latte'), aliases: ['הפוך', 'קפה', 'קפוצ׳ינו', 'לאטה'], kinds: ['drink'], portion: t('כוס, חלב 1%', 'A cup, 1% milk'), kcal: 90, protein: 6, sugar: 9, fat: 2 },
  { id: 'beer', name: nm('בירה', 'Beer'), kinds: ['drink', 'cold'], portion: t('בקבוק 330', 'A 330 bottle'), kcal: 145, protein: 1.5, sugar: 0, fat: 0 },
  { id: 'wine', name: nm('יין', 'Wine'), kinds: ['drink'], portion: t('כוס', 'A glass'), kcal: 125, protein: 0, sugar: 1, fat: 0 },
  { id: 'tea', name: nm('תה צמחים', 'Herbal tea'), aliases: ['תה', 'תה נענע', 'נענע', 'קמומיל', 'תה ירוק'], kinds: ['drink'], portion: t('כוס', 'A cup'), kcal: 0, protein: 0, sugar: 0, fat: 0 },
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
      // A food the app knows shows under its name in the app's language
      name: LANG === 'en' && known && [norm(known.name), ...(known.aliases ?? []).map(norm), norm(HE_NAME.get(known.name) ?? '')].includes(key) ? known.name : list[list.length - 1].name.trim(),
      kinds,
      portion: list.length > 1 ? t(`כמו שאתה רושם, ${list.length} פעמים`, `As you log it, ${list.length} times`) : t('כמו שרשמת', 'As you logged it'),
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
  const names = (f: Food) => [f.name, HE_NAME.get(f.name) ?? '', ...(f.aliases ?? [])].filter(Boolean).map(norm);
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
  lines.push(t(`${food.name}, ${food.portion}: בערך ${food.kcal} קלוריות, ${r(food.sugar)} גרם סוכר, ${r(food.fat)} גרם שומן, ${r(food.protein)} גרם חלבון.`, `${food.name}, ${food.portion}: about ${food.kcal} calories, ${r(food.sugar)} g sugar, ${r(food.fat)} g fat, ${r(food.protein)} g protein.`));
  lines.push(
    c.kcalLeft <= 0
      ? t(`כבר עברת היום את היעד ב ${r(-c.kcalLeft)} קלוריות.`, `You are already ${r(-c.kcalLeft)} calories over the target today.`)
      : after >= 0
        ? t(`נשארו לך ${r(c.kcalLeft)} קלוריות. אחרי זה: ${r(after)}.`, `You have ${r(c.kcalLeft)} calories left. After this: ${r(after)}.`)
        : t(`נשארו לך ${r(c.kcalLeft)} קלוריות. זה יעביר אותך ב ${r(-after)}.`, `You have ${r(c.kcalLeft)} calories left. This takes you ${r(-after)} over.`),
  );
  const swaps = swapsFor(food, 2, mine);
  const lean = proteinShare(food) >= 0.25;

  // Almost nothing in it
  if (food.kcal < 20) {
    return { call: 'go', title: t('לך על זה', 'Go for it'), lines: [t(`${food.name}: כמעט בלי קלוריות. בחירה מצוינת, גם בערב.`, `${food.name}: almost no calories. A great choice, in the evening too.`)], swaps: [] };
  }
  // Fits, and it is a good choice anyway
  if (lean && after >= 0) {
    return { call: 'go', title: t('לך על זה', 'Go for it'), lines: [...lines, t('בחירה טובה: הרבה חלבון ביחס לקלוריות.', 'A good choice: a lot of protein for the calories.')], swaps: [] };
  }
  // Heavy food close to bed
  if (late && food.kcal > 300) {
    const h = Math.floor(bed / 60);
    const inText = bed < 60 ? t(`${bed} דקות`, `${bed} minutes`) : h === 1 ? t('שעה', 'an hour') : h === 2 ? t('שעתיים', 'two hours') : t(`${h} שעות`, `${h} hours`);
    lines.push(t(`${bed > 0 ? `אתה הולך לישון בעוד ${inText}` : 'כבר שעת שינה'}. ארוחה כבדה עכשיו פוגעת בשינה, ושינה קצרה מגדילה רעב מחר.`, `${bed > 0 ? `You go to sleep in ${inText}` : 'It is already bedtime'}. A heavy meal now hurts sleep, and short sleep makes you hungrier tomorrow.`));
    return { call: 'swap', title: t('לא עכשיו', 'Not now'), lines, swaps };
  }
  // Over the day
  if (after < 0) {
    const half = c.kcalLeft - food.kcal / 2;
    if (half >= 0 && food.kcal >= 120) {
      lines.push(t(`חצי מנה נכנסת. ${swaps.length ? 'או קח משהו שעונה על אותו חשק בפחות:' : ''}`, `Half a portion fits. ${swaps.length ? 'Or take something that answers the same craving for less:' : ''}`));
      return { call: 'small', title: t('רק חצי', 'Just half'), lines, swaps };
    }
    lines.push(swaps.length ? t('עדיף משהו שעונה על אותו חשק בפחות:', 'Better something that answers the same craving for less:') : t('אם אתה בכל זאת אוכל, קח מנה קטנה ותמשיך מחר כרגיל.', 'If you eat it anyway, take a small portion and carry on as usual tomorrow.'));
    return { call: 'swap', title: t('עדיף משהו אחר', 'Better something else'), lines, swaps };
  }
  // Sweet late at night
  if (late && food.sugar >= 15) {
    lines.push(t('זה נכנס בתקציב, אבל סוכר לפני השינה פוגע בשינה ומגביר חשקים מחר. אם כבר, מנה אחת בלי השלמות.', 'It fits the budget, but sugar before bed hurts sleep and raises cravings tomorrow. If you do, one portion and no extras.'));
    return { call: 'small', title: t('מנה אחת וזהו', 'One portion and that is it'), lines, swaps };
  }
  if (c.proteinLeft > 30 && swaps.some((s) => proteinShare(s) >= 0.25)) {
    lines.push(t(`זה נכנס. אבל חסרים לך עוד ${r(c.proteinLeft)} גרם חלבון היום, ויש חלופה שמשלימה אותם:`, `It fits. But you still need ${r(c.proteinLeft)} g of protein today, and there is an option that covers it:`));
    return { call: 'go', title: t('נכנס', 'It fits'), lines, swaps: swaps.filter((s) => proteinShare(s) >= 0.25) };
  }
  lines.push(t('נכנס בתקציב. תהנה, מנה אחת.', 'It fits the budget. Enjoy, one portion.'));
  return { call: 'go', title: t('נכנס', 'It fits'), lines, swaps: [] };
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
