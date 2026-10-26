// The foods a dietitian's menu is made of, with values per 100 grams (cooked where it is eaten
// cooked) and the weight of the units menus use. Approximate values from standard nutrition tables,
// not any one product's label. Also the exchange lists Israeli dietitians write in ("מנת פחמימה").

export interface DietFood {
  id: string;
  /** Names and forms, longest first when matching */
  names: string[];
  kcal: number;
  protein: number;
  /** Grams of one unit, by unit word; `one` is a single piece when no unit is written */
  units: Partial<Record<Unit, number>>;
  /** Grams when the line says no amount ("ירקות חופשי", "קוטג'") */
  portion: number;
}

export type Unit = 'gram' | 'tbsp' | 'tsp' | 'cup' | 'slice' | 'one' | 'tub' | 'can' | 'handful' | 'scoop';

type Row = [string, string[], number, number, Partial<Record<Unit, number>>, number];

const R: Row[] = [
  // Bread and grains
  ['bread_light', ['לחם קל', 'לחם דל קלוריות', 'פרוסות לחם קל', 'פרוסת לחם קל'], 225, 13, { slice: 20 }, 40],
  ['bread', ['לחם מלא', 'לחם שיפון', 'לחם כוסמין', 'לחם', 'פרוסת לחם', 'פרוסות לחם'], 250, 9, { slice: 30 }, 60],
  ['pita', ['פיתה מלאה', 'פיתה'], 270, 9, { one: 90 }, 90],
  ['tortilla', ['טורטייה', 'טורטיה', 'לאפה'], 300, 8, { one: 60 }, 60],
  ['rice_cake', ['פריכיות אורז', 'פריכיות', 'פריכית', 'פריכיית'], 385, 8, { one: 9 }, 18],
  ['crackers', ['קרקרים', 'קרקר', 'פתית', 'פתיתים מלאים'], 420, 10, { one: 7 }, 28],
  ['oats', ['שיבולת שועל', 'קוואקר', 'פתיתי שיבולת שועל'], 380, 13, { tbsp: 10, cup: 80 }, 40],
  ['granola', ['גרנולה'], 450, 10, { tbsp: 12, cup: 110 }, 30],
  ['cereal', ['קורנפלקס', 'דגני בוקר'], 370, 7, { cup: 30 }, 30],
  ['rice', ['אורז מלא', 'אורז בסמטי', 'אורז'], 130, 2.7, { cup: 160, tbsp: 15 }, 150],
  ['pasta', ['פסטה מלאה', 'פסטה', 'ספגטי', 'מקרוני'], 155, 5.5, { cup: 140 }, 140],
  ['quinoa', ['קינואה'], 120, 4.4, { cup: 185, tbsp: 15 }, 150],
  ['buckwheat', ['כוסמת'], 92, 3.4, { cup: 170, tbsp: 15 }, 150],
  ['bulgur', ['בורגול'], 83, 3, { cup: 180, tbsp: 15 }, 150],
  ['couscous', ['קוסקוס', 'פתיתים'], 112, 3.8, { cup: 157, tbsp: 15 }, 150],
  ['potato', ['תפוח אדמה', 'תפוחי אדמה', 'תפו"א', 'פירה'], 87, 2, { one: 170, cup: 210 }, 170],
  ['sweet_potato', ['בטטה', 'בטטות'], 90, 2, { one: 150, cup: 200 }, 150],
  ['corn', ['תירס'], 96, 3.4, { cup: 150, tbsp: 15 }, 100],
  // Dairy and eggs
  ['cottage', ["קוטג' 3%", "קוטג' 5%", "קוטג'", 'קוטג׳', 'קוטג'], 90, 11, { tbsp: 30, tub: 250, cup: 225 }, 125],
  ['white_cheese', ['גבינה לבנה', 'גבינה רכה', 'גבינת שמנת'], 95, 9, { tbsp: 30, tub: 250 }, 60],
  ['yellow_cheese', ['גבינה צהובה', 'גבינה קשה', 'גבינת עמק', 'עמק'], 330, 27, { slice: 20 }, 40],
  ['feta', ['גבינה בולגרית', 'בולגרית', 'פטה', 'צפתית', 'גבינה מלוחה'], 250, 16, { tbsp: 25, slice: 25 }, 50],
  ['labane', ['לבנה', 'לאבנה'], 170, 7, { tbsp: 30 }, 60],
  ['protein_yogurt', ['יוגורט חלבון', 'משקה חלבון', 'מעדן חלבון', 'יופלה גו', 'פרו'], 75, 10, { one: 200, tub: 200 }, 200],
  ['yogurt', ['יוגורט', 'אקטיביה', 'ביו'], 60, 4.5, { one: 150, tub: 150, cup: 240 }, 150],
  ['milk', ['חלב'], 50, 3.3, { cup: 240, tbsp: 15 }, 240],
  ['egg_white', ['חלבון ביצה', 'חלבוני ביצה', 'חלבונים'], 52, 11, { one: 33 }, 66],
  ['egg', ['ביצה קשה', 'ביצים קשות', 'ביצה', 'ביצים', 'חביתה', 'חביתת'], 145, 12.5, { one: 55 }, 55],
  // Meat, fish, legumes
  ['chicken_breast', ['חזה עוף', 'חזה הודו', 'פילה עוף', 'שניצל אפוי', 'פרגית', 'פרגיות'], 165, 31, { one: 150 }, 150],
  ['chicken', ['עוף', 'הודו', 'שוקיים', 'כרעיים'], 190, 27, { one: 150 }, 150],
  ['tuna', ['טונה במים', 'טונה בשמן', 'טונה'], 115, 26, { can: 112, tbsp: 20 }, 112],
  ['salmon', ['סלמון', 'פורל'], 210, 22, { one: 150 }, 150],
  ['white_fish', ['דג לבן', 'אמנון', 'דניס', 'לברק', 'מושט', 'בקלה', 'פילה דג', 'דג'], 130, 26, { one: 150 }, 150],
  ['beef', ['בשר בקר', 'בשר טחון', 'בקר טחון', 'סטייק', 'אנטריקוט', 'סינטה', 'בקר', 'בשר'], 240, 26, { one: 150 }, 150],
  ['tofu', ['טופו'], 145, 15, { one: 100 }, 150],
  ['lentils', ['עדשים'], 116, 9, { cup: 200, tbsp: 15 }, 150],
  ['beans', ['שעועית לבנה', 'שעועית אדומה', 'שעועית', 'חומוס גרגרים', 'גרגרי חומוס', 'אפונה'], 125, 8.5, { cup: 180, tbsp: 15 }, 150],
  ['hummus', ['חומוס', 'ממרח חומוס'], 250, 8, { tbsp: 30 }, 60],
  // Fats
  ['tahini_raw', ['טחינה גולמית'], 600, 17, { tbsp: 15, tsp: 5 }, 15],
  ['tahini', ['טחינה'], 300, 8.5, { tbsp: 20, tsp: 7 }, 20],
  ['oil', ['שמן זית', 'שמן קנולה', 'שמן'], 884, 0, { tbsp: 13.5, tsp: 4.5 }, 5],
  ['avocado', ['אבוקדו'], 160, 2, { one: 150, tbsp: 15 }, 50],
  ['nuts', ['שקדים', 'אגוזי מלך', 'אגוזים', 'קשיו', 'פקאן', 'בוטנים', 'פיסטוקים', 'גרעינים', 'גרעיני דלעת', 'אגוזי לוז'], 600, 18, { one: 1.3, tbsp: 9, handful: 28 }, 28],
  ['peanut_butter', ['חמאת בוטנים', 'חמאת שקדים'], 590, 25, { tbsp: 16, tsp: 5 }, 16],
  ['olives', ['זיתים', 'זית'], 145, 1, { one: 4 }, 40],
  // Vegetables and fruit
  ['salad', ['סלט ירקות', 'ירקות חופשי', 'ירקות', 'ירק', 'סלט', 'מלפפון', 'מלפפונים', 'עגבנייה', 'עגבניה', 'עגבניות', 'גמבה', 'פלפל', 'גזר', 'חסה', 'ברוקולי', 'כרובית', 'קישוא', 'קישואים', 'חציל', 'פטריות'], 25, 1.2, { one: 120, cup: 120 }, 150],
  ['banana', ['בננה', 'בננות'], 89, 1.1, { one: 118 }, 118],
  ['apple', ['תפוח עץ', 'תפוח'], 52, 0.3, { one: 180 }, 180],
  ['dates', ['תמרים', 'תמר'], 280, 2.5, { one: 8 }, 24],
  ['fruit', ['פרי', 'פירות', 'תפוז', 'אגס', 'אפרסק', 'נקטרינה', 'קלמנטינה', 'קיווי', 'ענבים', 'מלון', 'אבטיח', 'תותים', 'שזיף', 'מנגו', 'אפרסמון'], 55, 0.7, { one: 150, cup: 150 }, 150],
  // Extras
  ['protein_powder', ['אבקת חלבון', 'שייק חלבון', 'סקופ חלבון'], 400, 80, { scoop: 30, tbsp: 10 }, 30],
  ['protein_bar', ['חטיף חלבון'], 367, 33, { one: 60 }, 60],
  ['soup', ['מרק'], 40, 2, { cup: 240 }, 300],
  ['honey', ['דבש', 'ריבה', 'סילאן'], 300, 0.3, { tsp: 7, tbsp: 21 }, 7],
  ['chocolate', ['שוקולד מריר', 'שוקולד', 'קוביית שוקולד'], 540, 6, { one: 5 }, 20],
];

export const DIET_FOODS: DietFood[] = R.map(([id, names, kcal, protein, units, portion]) => ({ id, names, kcal, protein, units, portion }));

/** Exchange lists: one "מנה" of each, as Israeli dietitians count them */
export const EXCHANGES: { id: string; names: string[]; kcal: number; protein: number }[] = [
  { id: 'x_carb', names: ['פחמימה', 'פחמימות', 'עמילן', 'דגנים'], kcal: 80, protein: 3 },
  { id: 'x_protein', names: ['חלבון', 'חלבונים'], kcal: 75, protein: 7 },
  { id: 'x_fat', names: ['שומן', 'שומנים'], kcal: 45, protein: 0 },
  { id: 'x_fruit', names: ['פרי', 'פירות'], kcal: 60, protein: 0.5 },
  { id: 'x_milk', names: ['חלב', 'מוצרי חלב'], kcal: 90, protein: 8 },
  { id: 'x_veg', names: ['ירק', 'ירקות'], kcal: 25, protein: 1 },
];
