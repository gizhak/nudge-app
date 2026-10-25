// Restaurant menu advisor. Pure, rule based, no AI: the user pastes the menu text
// (for example copied with Google Lens from a photo) and gets the dishes ranked
// against the goal and what is left for today. It ranks by ingredients and cooking
// method; it does not know portion sizes, so it gives no calorie numbers.

type Tag = 'protein' | 'lean' | 'veg' | 'fried' | 'creamy' | 'carbs' | 'sweet' | 'drink' | 'meat';

interface Rule {
  /** Hebrew word forms; matched as whole words, allowing a one or two letter prefix (ו, ה, ב, מ...) */
  words: string[];
  points: number;
  tags: Tag[];
}

// Longer phrases first: a matched phrase is removed so "חזה עוף" does not also count as "עוף".
const RULES: Rule[] = [
  { words: ['חזה עוף', 'חזה הודו', 'פילה עוף'], points: 4, tags: ['protein', 'lean', 'meat'] },
  { words: ['פיש אנד צ\'יפס', 'אורז מטוגן'], points: -3, tags: ['fried'] },
  { words: ['רוטב שמנת', 'קרם ברולה'], points: -3, tags: ['creamy'] },
  { words: ['על האש', 'על הגריל'], points: 1, tags: ['lean'] },
  { words: ['מוסר ים', 'פילה בקר'], points: 3, tags: ['protein', 'meat'] },
  { words: ['סלמון', 'טונה', 'דג', 'דגים', 'דניס', 'לברק', 'אמנון', 'בורי', 'סשימי', 'שרימפס', 'הודו'], points: 3, tags: ['protein', 'lean', 'meat'] },
  { words: ['עוף', 'פרגית', 'פרגיות', 'סינטה', 'פילה', 'בקר', 'סטייק', 'קלמרי', 'שיפוד', 'שיפודים', 'כבד', 'כבדי', 'טרטר'], points: 2, tags: ['protein', 'meat'] },
  { words: ['אנטריקוט', 'קבב', 'צלעות', 'נקניק', 'נקניקיות', 'מעורב ירושלמי', 'שווארמה'], points: 1, tags: ['protein', 'meat'] },
  { words: ['ביצה', 'ביצים', 'חביתה', 'שקשוקה'], points: 2, tags: ['protein'] },
  { words: ['טופו', 'סייטן', 'אדממה', 'קוטג\'', 'חלבון'], points: 2, tags: ['protein'] },
  { words: ['עדשים', 'חומוס', 'יוגורט', 'לאבנה', 'גבינה', 'קינואה'], points: 1, tags: ['protein'] },
  { words: ['גריל', 'צלוי', 'צלויה', 'צלויים', 'אפוי', 'אפויה', 'אפויים', 'מאודה', 'מאודים', 'חלוט', 'פלנצ\'ה'], points: 1, tags: ['lean'] },
  { words: ['סלט', 'סלטים', 'ירקות', 'ירוקים', 'ברוקולי', 'תרד', 'קישואים', 'שעועית ירוקה', 'ירק'], points: 1, tags: ['veg'] },
  { words: ['מטוגן', 'מטוגנת', 'מטוגנים', 'צ\'יפס', 'טמפורה', 'ג\'חנון', 'מלאווח', 'בורקס'], points: -3, tags: ['fried'] },
  { words: ['שניצל', 'שניצלונים', 'נאגטס', 'קריספי', 'פלאפל', 'סביח', 'טבעות בצל'], points: -2, tags: ['fried'] },
  { words: ['פריך', 'פריכה', 'פריכים'], points: -1, tags: ['fried'] },
  { words: ['שמנת', 'אלפרדו', 'קרם', 'קרמי', 'קרמית'], points: -2, tags: ['creamy'] },
  { words: ['גבינות', 'חמאה', 'איולי', 'מיונז', 'רוקפור'], points: -1, tags: ['creamy'] },
  { words: ['פיצה', 'ניוקי', 'ריזוטו', 'לאפה'], points: -2, tags: ['carbs'] },
  { words: ['פסטה', 'ספגטי', 'פנה', 'פטוצ\'יני', 'לזניה', 'המבורגר', 'בורגר', 'לחמניה', 'באגט', 'ג\'בטה', 'פיתה', 'טורטייה', 'אורז', 'פירה', 'קוסקוס', 'פתיתים', 'לחם', 'כריך', 'סנדוויץ\'', 'טוסט', 'בייגל'], points: -1, tags: ['carbs'] },
  { words: ['קינוח', 'עוגה', 'עוגת', 'גלידה', 'שוקולד', 'סופלה', 'טירמיסו', 'מלבי', 'פנקייק', 'וופל', 'בראוניז', 'סירופ', 'קרמבל'], points: -4, tags: ['sweet'] },
  { words: ['בירה', 'יין', 'קוקטייל', 'קולה', 'לימונדה', 'מיץ', 'משקה', 'שייק'], points: -2, tags: ['drink'] },
];

const SECTION_SWEET = /^(קינוחים|מתוקים|קינוח)$/;
const SECTION_DRINK = /^(שתייה|משקאות|שתיה|בר|יינות|קוקטיילים|שתייה חמה|שתייה קרה)$/;

const LETTER = 'א-תa-zA-Z';
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = RULES.map((r) => ({
  rule: r,
  re: new RegExp(`(^|[^${LETTER}])([ובהלמשכ]{0,2})(${r.words.map(escape).join('|')})(?=$|[^${LETTER}])`, 'g'),
}));

export interface Dish {
  name: string;
  score: number;
  tags: Tag[];
  reasons: string[];
  /** Not suitable at all (meat for a vegetarian) */
  excluded: boolean;
}

export interface MenuContext {
  hour: number;
  proteinLeft: number;
  kcalLeft: number;
  vegetarian: boolean;
}

export interface MenuAdvice {
  best: Dish[];
  avoid: Dish[];
  unknown: number;
  total: number;
  tips: string[];
}

/** Splits pasted menu text into dish lines, dropping prices and section headers. */
export function parseMenu(text: string): { name: string; section: 'sweet' | 'drink' | null }[] {
  const out: { name: string; section: 'sweet' | 'drink' | null }[] = [];
  let section: 'sweet' | 'drink' | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw
      .replace(/₪|ש"ח|ש״ח|NIS/g, ' ')
      .replace(/^\s*\d{1,3}([.,]\d{1,2})?\s+|\s+\d{1,3}([.,]\d{1,2})?\s*$/g, ' ')
      .replace(/^[\s\-•*·.]+|[\s\-•*·.:]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const letters = (line.match(new RegExp(`[${LETTER}]`, 'g')) ?? []).length;
    if (letters < 3) continue;
    if (SECTION_SWEET.test(line)) {
      section = 'sweet';
      continue;
    }
    if (SECTION_DRINK.test(line)) {
      section = 'drink';
      continue;
    }
    if (/^(ראשונות|עיקריות|מנות עיקריות|מנות ראשונות|סלטים|תוספות|ארוחות בוקר|כריכים|פסטות|פיצות|מהגריל|ספיישלים)$/.test(line)) {
      section = null;
      continue;
    }
    out.push({ name: line, section });
  }
  return out;
}

const REASON: Record<Tag, string> = {
  protein: 'עשיר בחלבון',
  lean: 'הכנה רזה',
  veg: 'ירקות',
  fried: 'מטוגן',
  creamy: 'שמנת או רוטב שמן',
  carbs: 'פחמימה כבדה',
  sweet: 'מתוק',
  drink: 'קלוריות מנוזלים',
  meat: 'בשר',
};

export function scoreDish(name: string, section: 'sweet' | 'drink' | null, c: MenuContext): Dish {
  let rest = ` ${name} `;
  let score = 0;
  const tags = new Set<Tag>();
  for (const { rule, re } of PATTERNS) {
    re.lastIndex = 0;
    let hit = false;
    rest = rest.replace(re, (_m, pre) => {
      hit = true;
      return `${pre} `;
    });
    if (!hit) continue;
    let p = rule.points;
    if (rule.tags.includes('protein') && c.proteinLeft > 40) p *= 1.5;
    if (c.hour >= 20 && rule.tags.some((t) => t === 'carbs' || t === 'fried')) p -= 1;
    if (c.kcalLeft < 500 && rule.tags.some((t) => t === 'carbs' || t === 'fried' || t === 'creamy')) p -= 1;
    score += p;
    rule.tags.forEach((t) => tags.add(t));
  }
  if (section === 'sweet' && !tags.has('sweet')) {
    score -= 4;
    tags.add('sweet');
  }
  if (section === 'drink' && !tags.has('drink')) {
    score -= 1;
    tags.add('drink');
  }
  const t = [...tags];
  const excluded = c.vegetarian && tags.has('meat');
  const order: Tag[] = ['protein', 'lean', 'veg', 'fried', 'creamy', 'carbs', 'sweet', 'drink'];
  return {
    name,
    score: Math.round(score * 10) / 10,
    tags: t,
    reasons: order.filter((x) => tags.has(x)).map((x) => REASON[x]),
    excluded,
  };
}

export function adviseMenu(text: string, c: MenuContext): MenuAdvice {
  const dishes = parseMenu(text).map((d) => scoreDish(d.name, d.section, c));
  const known = dishes.filter((d) => d.tags.length > 0 && !d.excluded);
  const best = known
    .filter((d) => d.score >= 2 && !d.tags.includes('drink') && !d.tags.includes('sweet'))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const avoid = known
    .filter((d) => d.score <= -2)
    .sort((a, b) => a.score - b.score)
    .slice(0, 4);

  const tips: string[] = [];
  const top = best[0];
  if (top?.tags.includes('carbs') || top?.tags.includes('fried')) tips.push('בקש להחליף את התוספת בסלט או ירקות.');
  if (best.some((d) => d.tags.includes('creamy')) || known.some((d) => d.tags.includes('creamy'))) tips.push('רוטב בצד, לא על המנה.');
  if (c.proteinLeft > 40) tips.push(`חסרים לך עוד ${Math.round(c.proteinLeft)} גרם חלבון היום. מנה עיקרית עם חלבון קודמת לכל השאר.`);
  if (c.kcalLeft < 600) tips.push(`נשארו לך ${Math.max(0, Math.round(c.kcalLeft))} קלוריות. מנה אחת, בלי ראשונה ובלי קינוח.`);
  if (c.hour >= 20) tips.push('שעה מאוחרת: פחות פחמימה, יותר חלבון וירקות.');
  if (!best.length && known.length) tips.push('אין כאן מנה טובה באמת. בחר את הכי פחות גרועה, ושלוט בכמות.');

  return { best, avoid, unknown: dishes.length - known.length, total: dishes.length, tips };
}
