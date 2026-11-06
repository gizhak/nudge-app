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
  ['bread_light', ['לחם קל', 'לחם דל קלוריות', 'פרוסות לחם קל', 'פרוסת לחם קל', 'light bread'], 225, 13, { slice: 20 }, 40],
  ['bread', ['לחם מלא', 'לחם שיפון', 'לחם כוסמין', 'לחם', 'פרוסת לחם', 'פרוסות לחם', 'whole wheat bread', 'whole grain bread', 'sourdough', 'rye bread', 'bread', 'slices of bread', 'slice of bread', 'toast'], 250, 9, { slice: 30 }, 60],
  ['pita', ['פיתה מלאה', 'פיתה', 'pita'], 270, 9, { one: 90 }, 90],
  ['tortilla', ['טורטייה', 'טורטיה', 'לאפה', 'tortilla', 'wrap'], 300, 8, { one: 60 }, 60],
  ['rice_cake', ['פריכיות אורז', 'פריכיות', 'פריכית', 'פריכיית', 'rice cakes', 'rice cake'], 385, 8, { one: 9 }, 18],
  ['crackers', ['קרקרים', 'קרקר', 'פתית', 'פתיתים מלאים', 'crackers', 'cracker'], 420, 10, { one: 7 }, 28],
  ['oats', ['שיבולת שועל', 'קוואקר', 'פתיתי שיבולת שועל', 'oatmeal', 'oats', 'rolled oats', 'porridge'], 380, 13, { tbsp: 10, cup: 80 }, 40],
  ['granola', ['גרנולה', 'granola'], 450, 10, { tbsp: 12, cup: 110 }, 30],
  ['cereal', ['קורנפלקס', 'דגני בוקר', 'cereal', 'cornflakes'], 370, 7, { cup: 30 }, 30],
  ['rice', ['אורז מלא', 'אורז בסמטי', 'אורז', 'brown rice', 'white rice', 'rice'], 130, 2.7, { cup: 160, tbsp: 15 }, 150],
  ['pasta', ['פסטה מלאה', 'פסטה', 'ספגטי', 'מקרוני', 'pasta', 'spaghetti'], 155, 5.5, { cup: 140 }, 140],
  ['quinoa', ['קינואה', 'quinoa'], 120, 4.4, { cup: 185, tbsp: 15 }, 150],
  ['buckwheat', ['כוסמת', 'buckwheat'], 92, 3.4, { cup: 170, tbsp: 15 }, 150],
  ['bulgur', ['בורגול', 'bulgur'], 83, 3, { cup: 180, tbsp: 15 }, 150],
  ['couscous', ['קוסקוס', 'פתיתים', 'couscous'], 112, 3.8, { cup: 157, tbsp: 15 }, 150],
  ['potato', ['תפוח אדמה', 'תפוחי אדמה', 'תפו"א', 'פירה', 'potatoes', 'potato', 'mashed potatoes'], 87, 2, { one: 170, cup: 210 }, 170],
  ['sweet_potato', ['בטטה', 'בטטות', 'sweet potatoes', 'sweet potato'], 90, 2, { one: 150, cup: 200 }, 150],
  ['corn', ['תירס', 'corn'], 96, 3.4, { cup: 150, tbsp: 15 }, 100],
  // Dairy and eggs
  ['cottage', ["קוטג' 3%", "קוטג' 5%", "קוטג'", 'קוטג׳', 'קוטג', 'cottage cheese', 'cottage'], 90, 11, { tbsp: 30, tub: 250, can: 250, cup: 225 }, 125],
  ['white_cheese', ['גבינה לבנה', 'גבינה רכה', 'גבינת שמנת', 'cream cheese', 'white cheese'], 95, 9, { tbsp: 30, tub: 250 }, 60],
  ['yellow_cheese', ['גבינה צהובה', 'גבינה קשה', 'גבינת עמק', 'עמק', 'cheddar', 'yellow cheese', 'hard cheese'], 330, 27, { slice: 20 }, 40],
  ['feta', ['גבינה בולגרית', 'בולגרית', 'פטה', 'צפתית', 'גבינה מלוחה', 'feta', 'bulgarian cheese'], 250, 16, { tbsp: 25, slice: 25 }, 50],
  ['labane', ['לבנה', 'לאבנה', 'labneh'], 170, 7, { tbsp: 30 }, 60],
  ['goat_yogurt', ['יוגורט עיזים', 'יוגורט כבשים', 'goat yogurt'], 95, 6, { one: 150, tub: 150 }, 150],
  ['protein_yogurt', ['יוגורט חלבון', 'משקה חלבון', 'מעדן חלבון', 'יופלה גו', 'פרו', 'protein yogurt', 'protein pudding', 'protein shake drink'], 75, 10, { one: 200, tub: 200 }, 200],
  ['yogurt', ['יוגורט', 'אקטיביה', 'ביו', 'greek yogurt', 'yogurt', 'yoghurt'], 60, 4.5, { one: 150, tub: 150, cup: 240 }, 150],
  ['milk', ['חלב', 'milk'], 50, 3.3, { cup: 240, tbsp: 15 }, 240],
  ['egg_white', ['חלבון ביצה', 'חלבוני ביצה', 'חלבונים', 'egg whites', 'egg white'], 52, 11, { one: 33 }, 66],
  ['egg', ['ביצה קשה', 'ביצים קשות', 'ביצה', 'ביצים', 'חביתה', 'חביתת', 'hard boiled egg', 'boiled eggs', 'eggs', 'egg', 'omelette', 'omelet'], 145, 12.5, { one: 55 }, 55],
  // Meat, fish, legumes
  ['chicken_breast', ['חזה עוף', 'חזה הודו', 'פילה עוף', 'שניצל אפוי', 'פרגית', 'פרגיות', 'chicken breast', 'turkey breast'], 165, 31, { one: 150 }, 150],
  ['chicken', ['עוף', 'הודו', 'שוקיים', 'כרעיים', 'chicken', 'turkey'], 190, 27, { one: 150 }, 150],
  ['pastrami', ['פסטרמה דל שומן', 'פסטרמה', 'נקניק הודו', 'pastrami', 'turkey slices'], 110, 20, { slice: 10 }, 60],
  ['tuna', ['טונה במים', 'טונה בשמן', 'טונה', 'tuna in water', 'tuna'], 115, 26, { can: 112, tbsp: 20 }, 112],
  ['salmon', ['סלמון', 'פורל', 'salmon', 'trout'], 210, 22, { one: 150 }, 150],
  ['white_fish', ['דג לבן', 'אמנון', 'דניס', 'לברק', 'מושט', 'בקלה', 'פילה דג', 'מוסר', 'לוקוס', 'בס', 'דגים', 'דג', 'white fish', 'sea bass', 'cod', 'tilapia', 'fish'], 130, 26, { one: 150 }, 150],
  ['beef', ['בשר בקר', 'בשר טחון', 'בקר טחון', 'סטייק', 'אנטריקוט', 'סינטה', 'כתף בקר', 'בקר ללא שומן', 'בקר', 'בשר', 'lean beef', 'ground beef', 'steak', 'beef', 'sirloin'], 240, 26, { one: 150 }, 150],
  ['tofu', ['טופו', 'tofu'], 145, 15, { one: 100 }, 150],
  ['soy', ['פולי סויה', 'אדממה', 'edamame', 'soybeans'], 140, 12, { cup: 155, tbsp: 12 }, 100],
  ['lentils', ['עדשים', 'lentils'], 116, 9, { cup: 200, tbsp: 15 }, 150],
  ['beans', ['שעועית לבנה', 'שעועית אדומה', 'שעועית', 'חומוס גרגרים', 'גרגרי חומוס', 'גרגירי חומוס', 'אפונה', 'chickpeas', 'black beans', 'kidney beans', 'beans', 'peas'], 125, 8.5, { cup: 180, tbsp: 15 }, 150],
  ['hummus', ['חומוס', 'ממרח חומוס', 'hummus'], 250, 8, { tbsp: 30 }, 60],
  // Fats
  ['tahini_raw', ['טחינה גולמית'], 600, 17, { tbsp: 15, tsp: 5 }, 15],
  ['tahini', ['טחינה', 'tahini'], 300, 8.5, { tbsp: 20, tsp: 7 }, 20],
  ['oil', ['שמן זית', 'שמן קנולה', 'שמן', 'olive oil', 'oil'], 884, 0, { tbsp: 13.5, tsp: 4.5 }, 5],
  ['avocado', ['אבוקדו', 'avocado'], 160, 2, { one: 150, tbsp: 15 }, 50],
  ['nuts', ['שקדים', 'אגוזי מלך', 'אגוזים', 'אגוזי', 'קשיו', 'פקאן', 'בוטנים', 'פיסטוקים', 'גרעינים', 'גרעיני דלעת', 'אגוזי לוז', 'זרעי פשתן', "זרעי צ'יה", 'almonds', 'walnuts', 'nuts', 'cashews', 'peanuts', 'pistachios', 'seeds', 'flax seeds', 'chia seeds'], 600, 18, { one: 1.3, tbsp: 9, handful: 28 }, 28],
  ['peanut_butter', ['חמאת בוטנים', 'חמאת שקדים', 'peanut butter', 'almond butter'], 590, 25, { tbsp: 16, tsp: 5 }, 16],
  ['olives', ['זיתים', 'זית', 'olives'], 145, 1, { one: 4 }, 40],
  // Vegetables and fruit
  ['salad', ['סלט ירקות', 'ירקות חופשי', 'ירקות', 'ירק', 'סלט', 'מלפפון', 'מלפפונים', 'עגבנייה', 'עגבניה', 'עגבניות', 'גמבה', 'פלפל', 'גזר', 'חסה', 'ברוקולי', 'כרובית', 'קישוא', 'קישואים', 'זוקיני', 'חציל', 'פטריות', 'שעועית ירוקה', 'עלי בייבי', 'כרוב לבן', 'כרוב', 'סוגי ירק', 'סוג ירק', 'vegetables', 'veggies', 'salad', 'cucumber', 'tomato', 'tomatoes', 'lettuce', 'broccoli', 'cauliflower', 'zucchini', 'carrot', 'carrots', 'pepper', 'spinach', 'green beans', 'mushrooms'], 25, 1.2, { one: 120, cup: 120 }, 150],
  ['berries', ['דובדבנים', 'אוכמניות', 'פטל', 'פירות יער', 'berries', 'blueberries', 'strawberries', 'cherries'], 55, 0.9, { cup: 140, handful: 50 }, 100],
  ['banana', ['בננה', 'בננות', 'banana', 'bananas'], 89, 1.1, { one: 118 }, 118],
  ['apple', ['תפוח עץ', 'תפוח', 'apple', 'apples'], 52, 0.3, { one: 180 }, 180],
  ['dates', ['תמרים', 'תמר', 'dates', 'date'], 280, 2.5, { one: 8 }, 24],
  ['fruit', ['פרי', 'פירות', 'תפוז', 'אגס', 'אפרסק', 'נקטרינה', 'קלמנטינה', 'קיווי', 'ענבים', 'מלון', 'אבטיח', 'תותים', 'שזיף', 'מנגו', 'אפרסמון', 'fruit', 'orange', 'pear', 'peach', 'kiwi', 'grapes', 'melon'], 55, 0.7, { one: 150, cup: 150 }, 150],
  // Extras
  ['protein_powder', ['אבקת חלבון', 'שייק חלבון', 'סקופ חלבון', 'protein powder', 'scoop of protein', 'whey'], 400, 80, { scoop: 30, tbsp: 10 }, 30],
  ['protein_bar', ['חטיף חלבון', 'protein bar'], 367, 33, { one: 60 }, 60],
  ['soup', ['מרק', 'soup'], 40, 2, { cup: 240 }, 300],
  ['honey', ['דבש', 'ריבה', 'סילאן', 'honey', 'jam'], 300, 0.3, { tsp: 7, tbsp: 21 }, 7],
  ['chocolate', ['שוקולד מריר', 'שוקולד', 'קוביית שוקולד', 'dark chocolate', 'chocolate'], 540, 6, { one: 5 }, 20],
];

export const DIET_FOODS: DietFood[] = R.map(([id, names, kcal, protein, units, portion]) => ({ id, names, kcal, protein, units, portion }));

/** Exchange lists: one "מנה" of each, as Israeli dietitians count them */
export const EXCHANGES: { id: string; names: string[]; kcal: number; protein: number }[] = [
  { id: 'x_carb', names: ['פחמימה', 'פחמימות', 'עמילן', 'דגנים', 'carb', 'carbs', 'starch'], kcal: 80, protein: 3 },
  { id: 'x_protein', names: ['חלבון', 'חלבונים', 'protein'], kcal: 75, protein: 7 },
  { id: 'x_fat', names: ['שומן', 'שומנים', 'fat'], kcal: 45, protein: 0 },
  { id: 'x_fruit', names: ['פרי', 'פירות', 'fruit'], kcal: 60, protein: 0.5 },
  { id: 'x_milk', names: ['חלב', 'מוצרי חלב', 'dairy'], kcal: 90, protein: 8 },
  { id: 'x_veg', names: ['ירק', 'ירקות'], kcal: 25, protein: 1 },
];
