// Every setting a person may look for, with the words he might type for it.
// A new setting goes here too, or search will not find it.

export type SettingsTarget = 'coach' | 'reminders' | 'reports' | 'plan' | 'vacation' | 'learned' | 'myfile' | 'readiness' | 'schedule';

export interface SettingEntry {
  title: string;
  /** Where it lives, as shown under the result */
  path: string;
  target: SettingsTarget;
  /** A card inside the page to scroll to */
  anchor?: string;
  words: string;
}

const COACH = 'הגדרות המאמן';
const FILE = 'התיק שלי';

export const SETTINGS_INDEX: SettingEntry[] = [
  // The coach
  { title: 'מאמן פעיל', path: `${COACH}, המאמן`, target: 'coach', anchor: 'coach', words: 'הפעלה כיבוי הפעל כבה מאמן' },
  { title: 'כמה נודניק', path: `${COACH}, המאמן`, target: 'coach', anchor: 'coach', words: 'רמה נדנוד נודניק דומיננטי צמוד רגיל שקט כמות הודעות התראות דחיפה' },
  { title: 'שעות שקט', path: `${COACH}, המאמן`, target: 'coach', anchor: 'coach', words: 'שקט לילה שינה לא להפריע שעות' },
  { title: 'שעות הארוחות', path: `${COACH}, ארוחות`, target: 'coach', anchor: 'meals', words: 'אוכל ארוחה ארוחות בוקר צהריים ערב לילה ביניים זמנים שעה תזונה' },
  { title: 'תזכורות לארוחות', path: `${COACH}, ארוחות`, target: 'coach', anchor: 'meals', words: 'אוכל ארוחה תזכורת רישום תזונה' },
  { title: 'משוב על כל ארוחה', path: `${COACH}, ארוחות`, target: 'coach', anchor: 'meals', words: 'אוכל ארוחה משוב תגובה תזונה' },
  { title: 'תזכורות לשתות מים', path: `${COACH}, מים`, target: 'coach', anchor: 'water', words: 'מים שתייה שתיה תזכורת' },
  { title: 'ממה אתה שותה', path: `${COACH}, מים`, target: 'coach', anchor: 'water', words: 'מים כוס בקבוק לגימה לגימות שתייה שתיה מידה' },
  { title: 'הודעות הגעה ויציאה', path: `${COACH}, רכב, הגעה ולילה`, target: 'coach', anchor: 'alerts', words: 'בית עבודה משרד חדר כושר הגעה יציאה מקום' },
  { title: 'הרכב', path: `${COACH}, רכב, הגעה ולילה`, target: 'coach', anchor: 'alerts', words: 'רכב אוטו בלוטוס נסיעה נהיגה' },
  { title: 'שומר לילה', path: `${COACH}, רכב, הגעה ולילה`, target: 'coach', anchor: 'alerts', words: 'לילה שינה פתיחת טלפון בוקר שקילה התעוררות' },
  { title: 'מקומות: בית, עבודה, חדר כושר', path: `${COACH}, מקומות`, target: 'coach', anchor: 'places', words: 'מקום מקומות בית עבודה משרד חדר כושר כתובת מיקום' },
  { title: 'Wi-Fi של המקומות', path: `${COACH}, Wi-Fi`, target: 'coach', anchor: 'wifi', words: 'wifi ויפי וייפיי רשת רשתות אינטרנט נתב ראוטר בית עבודה משרד חדר כושר מקום מיקום' },
  { title: 'מצב המאמן ברקע', path: `${COACH}, מצב`, target: 'coach', anchor: 'status', words: 'רקע מיקום בדיקה הרץ הפעל סטטוס' },
  { title: 'תזכורות אימון ושקילה', path: 'תזכורות', target: 'reminders', words: 'תזכורת אימון שקילה בוקר התראה בדיקה משקל' },
  { title: 'דוח שבועי וחודשי', path: 'דוחות', target: 'reports', words: 'דוח דוחות סיכום שבועי חודשי' },
  { title: 'חופשה', path: 'חופשה', target: 'vacation', words: 'חופשה טיול נסיעה הפסקה חופש' },
  { title: 'מה המאמן למד עליך', path: 'מה המאמן למד', target: 'learned', words: 'למידה שעת שקילה השכמה קימה רקע ריצה ברקע' },
  { title: 'יעדים', path: 'יעדים ולוח אימונים', target: 'plan', words: 'יעד יעדים קלוריות חלבון צעדים שינה אוכל תזונה' },
  { title: 'סוף שבוע וימי אימון', path: 'סוף שבוע וימי אימון', target: 'schedule', words: 'שבת שישי סופש ימי אימון ימים לוח' },
  { title: 'שעון ואפליקציית אוכל', path: 'בדיקת מוכנות וחיבורים', target: 'readiness', words: 'שעון זפ Zepp אוכל אפליקציה חיבור חיבורים הרשאות Health Connect Mi Fitness סנכרון תזונה' },
  // My file
  { title: 'השם שלך', path: `${FILE}, עליך`, target: 'myfile', words: 'שם כינוי איך לקרוא פנייה' },
  { title: 'גיל, גובה ומשקל', path: `${FILE}, עליך`, target: 'myfile', words: 'גיל גובה משקל' },
  { title: 'מטרה, קצב ומשקל יעד', path: `${FILE}, המטרה`, target: 'myfile', words: 'מטרה קצב משקל יעד ירידה למה' },
  { title: 'בריאות וניסיון', path: `${FILE}, בריאות וניסיון`, target: 'myfile', words: 'בריאות ניסיון כאבים מגבלה רפואי רפואית' },
  { title: 'עבודה ושעות', path: `${FILE}, עבודה ולוח זמנים`, target: 'myfile', words: 'עבודה משרד שעות משמרות פיזית' },
  { title: 'אימונים: ימים, מקום וחלוקה', path: `${FILE}, עבודה ולוח זמנים`, target: 'myfile', words: 'אימון אימונים ימים שעה מקום חלוקה חבל בטן' },
  { title: 'משפחה וילדים', path: `${FILE}, משפחה ובית`, target: 'myfile', words: 'משפחה ילדים זוגיות בית' },
  { title: 'שעות שינה', path: `${FILE}, שגרה ואוכל`, target: 'myfile', words: 'שינה שעת שינה השכמה קימה התעוררות לילה צהריים' },
  { title: 'ארוחות ביום והגבלות תזונה', path: `${FILE}, שגרה ואוכל`, target: 'myfile', words: 'אוכל ארוחות תזונה הגבלות צמחוני טבעוני כשר אלרגיה' },
  { title: 'רמה וטון של המאמן', path: `${FILE}, המאמן`, target: 'myfile', words: 'טון רמה מאמן סגנון עידוד קשוח' },
];

const norm = (t: string) => t.toLowerCase().replace(/["'׳״,.:]/g, ' ').replace(/\s+/g, ' ').trim();
// Hebrew prefixes, so "בארוחות" and "לשתות" still match
const stripPrefix = (w: string) => (w.length > 3 && /^[בהולמש]/.test(w) ? w.slice(1) : w);

/** Every word typed must start a word of the entry (or sit inside a longer one). */
export function searchSettings(query: string): SettingEntry[] {
  const q = norm(query).split(' ').filter(Boolean);
  if (!q.length) return [];
  return SETTINGS_INDEX.map((e) => {
    const hay = norm(`${e.title} ${e.path} ${e.words}`).split(' ');
    let score = 0;
    for (const raw of q) {
      const forms = [raw, stripPrefix(raw)];
      const hit = hay.some((h) => forms.some((f) => h.startsWith(f) || (f.length >= 4 && h.includes(f))));
      if (!hit) return null;
      if (norm(e.title).includes(raw)) score += 2;
      else score += 1;
    }
    return { e, score };
  })
    .filter((x): x is { e: SettingEntry; score: number } => !!x)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.e);
}
