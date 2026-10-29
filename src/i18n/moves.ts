// Exercise names and reps as shown in English. The Hebrew names stay the keys everywhere (saved picks,
// weights, photos), so only what is shown passes through here.
import { LANG } from './index';

const EN: Record<string, string> = {
  'גובלט סקוואט': 'Goblet squat',
  'גלגל בטן': 'Ab wheel',
  'גשר ישבן': 'Glute bridge',
  'גשר ישבן עם משקולת': 'Weighted glute bridge',
  'דדליפט רומני': 'Romanian deadlift',
  'דדליפט רומני במשקולות': 'Dumbbell Romanian deadlift',
  'היפ תראסט': 'Hip thrust',
  'הליכה מהירה, דופק מתון': 'Brisk walk, moderate heart rate',
  'הרחקה לצדדים': 'Lateral raise',
  'הרחקה לצדדים, משקל קל': 'Lateral raise, light weight',
  'הרמות ברכיים בתלייה': 'Hanging knee raise',
  'הרמות רגליים בשכיבה': 'Lying leg raise',
  'הרמת אגן ברגל אחת': 'Single-leg hip raise',
  'חבל, אינטרוולים': 'Jump rope, intervals',
  'חתירה בכבל': 'Cable row',
  'חתירה בכבל בישיבה': 'Seated cable row',
  'חתירה במוט': 'Barbell row',
  'חתירה במשקולת': 'Dumbbell row',
  'חתירה הפוכה מתחת לשולחן': 'Inverted row under a table',
  'חתירה עם גומייה': 'Band row',
  'כפיפות בטן בכבל': 'Cable crunch',
  'כפיפת ברכיים במכונה': 'Leg curl machine',
  'כפיפת מרפקים': 'Biceps curl',
  'כפיפת מרפקים במוט': 'Barbell curl',
  'כפיפת מרפקים בשיפוע': 'Incline curl',
  'כפיפת פטישים': 'Hammer curl',
  'לאנג׳ים': 'Lunges',
  'לאנג׳ים עם משקולות': 'Dumbbell lunges',
  'לחיצת חזה במוט': 'Barbell bench press',
  'לחיצת חזה במכונה': 'Machine chest press',
  'לחיצת חזה במשקולות': 'Dumbbell bench press',
  'לחיצת חזה במשקולות על הרצפה': 'Dumbbell floor press',
  'לחיצת חזה במשקולות, אחיזה ניטרלית': 'Dumbbell press, neutral grip',
  'לחיצת חזה בשיפוע במוט': 'Incline barbell press',
  'לחיצת חזה בשיפוע במשקולות': 'Incline dumbbell press',
  'לחיצת חזה צרה': 'Close-grip bench press',
  'לחיצת כתפיים': 'Shoulder press',
  'לחיצת כתפיים במוט': 'Barbell overhead press',
  'לחיצת כתפיים במשקולות': 'Dumbbell shoulder press',
  'לחיצת רגליים': 'Leg press',
  'לחיצת רגליים בטווח חלקי': 'Leg press, partial range',
  'מכונת לחיצת חזה': 'Chest press machine',
  'מכונת פרפר': 'Pec deck machine',
  'מקבילים': 'Dips',
  'מתח': 'Pull-ups',
  'סופרמן': 'Superman',
  'סקוואט': 'Squat',
  'סקוואט בולגרי': 'Bulgarian split squat',
  'סקוואט במשקל גוף': 'Bodyweight squat',
  'סקוואטים': 'Squats',
  'פולי עליון': 'Lat pulldown',
  'פולי עליון אחיזה צרה': 'Close-grip lat pulldown',
  'פייס פול': 'Face pull',
  'פלאנק': 'Plank',
  'פלאנק צד': 'Side plank',
  'פרפר אחורי בכבל': 'Cable reverse fly',
  'פרפר בכבלים': 'Cable fly',
  'פרפר במשקולות': 'Dumbbell fly',
  'פשיטה מעל הראש בחבל': 'Overhead rope extension',
  'פשיטת ברכיים במכונה': 'Leg extension machine',
  'פשיטת ירך במכונה': 'Hip extension machine',
  'פשיטת מרפקים בחבל': 'Rope pushdown',
  'פשיטת מרפקים בכבל': 'Cable pushdown',
  'פשיטת מרפקים מעל הראש': 'Overhead triceps extension',
  'ציפור כלב': 'Bird dog',
  'קפיצות חבל, אינטרוולים': 'Jump rope, intervals',
  'ריצה קלה': 'Easy run',
  'ריצה, אינטרוולים': 'Run, intervals',
  'שכיבות סמיכה': 'Push-ups',
  'שכיבות סמיכה על קיר': 'Wall push-ups',
  'שכיבות סמיכה צרות': 'Close-grip push-ups',
  'תאומים': 'Calf raise',
  'תאומים בישיבה': 'Seated calf raise',
};

const one = (s: string) => EN[s.trim()] ?? s;

/** An exercise's name for showing; "X או Y" becomes "X or Y" */
export function moveName(he: string): string {
  if (LANG !== 'en') return he;
  return he
    .split(' או ')
    .map(one)
    .join(' or ');
}

/** Reps for showing: "8 עד 10" is "8 to 10", "40 שניות" is "40 seconds" */
export function repsText(he: string | number): string {
  const s = String(he);
  if (LANG !== 'en') return s;
  return s
    .replace(/(\d+) עד (\d+)/, '$1 to $2')
    .replace(/לכל רגל/, 'per leg')
    .replace(/לכל יד/, 'per arm')
    .replace(/לכל צד/, 'per side')
    .replace(/שניות/, 'seconds')
    .replace(/דקות/, 'minutes')
    .replace(/דקה/, 'minute');
}
