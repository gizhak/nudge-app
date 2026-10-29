
import { t } from '../i18n';// Every setting a person may look for, with the words he might type for it.
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

const COACH = t('הגדרות המאמן', 'Coach settings');
const FILE = t('התיק שלי', 'My file');

export const SETTINGS_INDEX: SettingEntry[] = [
  // The coach
  { title: t('מאמן פעיל', 'Coach on'), path: t(`${COACH}, המאמן`, `${COACH}, the coach`), target: 'coach', anchor: 'coach', words: t('הפעלה כיבוי הפעל כבה מאמן', 'on off enable disable coach') },
  { title: t('כמה נודניק', 'How much nagging'), path: t(`${COACH}, המאמן`, `${COACH}, the coach`), target: 'coach', anchor: 'coach', words: t('רמה נדנוד נודניק דומיננטי צמוד רגיל שקט כמות הודעות התראות דחיפה', 'level nagging nag dominant close normal quiet amount messages notifications push') },
  { title: t('שעות שקט', 'Quiet hours'), path: t(`${COACH}, המאמן`, `${COACH}, the coach`), target: 'coach', anchor: 'coach', words: t('שקט לילה שינה לא להפריע שעות', 'quiet night sleep do not disturb hours') },
  { title: t('שעות הארוחות', 'Meal times'), path: t(`${COACH}, ארוחות`, `${COACH}, meals`), target: 'coach', anchor: 'meals', words: t('אוכל ארוחה ארוחות בוקר צהריים ערב לילה ביניים זמנים שעה תזונה', 'food meal meals breakfast lunch dinner night snack times hour nutrition') },
  { title: t('תזכורות לארוחות', 'Meal reminders'), path: t(`${COACH}, ארוחות`, `${COACH}, meals`), target: 'coach', anchor: 'meals', words: t('אוכל ארוחה תזכורת רישום תזונה', 'food meal reminder logging nutrition') },
  { title: t('משוב על כל ארוחה', 'Feedback on every meal'), path: t(`${COACH}, ארוחות`, `${COACH}, meals`), target: 'coach', anchor: 'meals', words: t('אוכל ארוחה משוב תגובה תזונה', 'food meal feedback reply nutrition') },
  { title: t('תזכורות לשתות מים', 'Water reminders'), path: t(`${COACH}, מים`, `${COACH}, water`), target: 'coach', anchor: 'water', words: t('מים שתייה שתיה תזכורת', 'water drink drinking reminder') },
  { title: t('ממה אתה שותה', 'What you drink from'), path: t(`${COACH}, מים`, `${COACH}, water`), target: 'coach', anchor: 'water', words: t('מים כוס בקבוק לגימה לגימות שתייה שתיה מידה', 'water cup glass bottle sip sips drink size') },
  { title: t('הודעות הגעה ויציאה', 'Arrival and leaving messages'), path: t(`${COACH}, רכב, הגעה ולילה`, `${COACH}, car, arrivals and night`), target: 'coach', anchor: 'alerts', words: t('בית עבודה משרד חדר כושר הגעה יציאה מקום', 'home work office gym arrive arrival leave place') },
  { title: t('הרכב', 'The car'), path: t(`${COACH}, רכב, הגעה ולילה`, `${COACH}, car, arrivals and night`), target: 'coach', anchor: 'alerts', words: t('רכב אוטו בלוטוס נסיעה נהיגה', 'car bluetooth drive driving') },
  { title: t('שומר לילה', 'Night guard'), path: t(`${COACH}, רכב, הגעה ולילה`, `${COACH}, car, arrivals and night`), target: 'coach', anchor: 'alerts', words: t('לילה שינה פתיחת טלפון בוקר שקילה התעוררות', 'night sleep phone unlock morning weigh wake') },
  { title: t('מקומות: בית, עבודה, חדר כושר', 'Places: home, work, gym'), path: t(`${COACH}, מקומות`, `${COACH}, places`), target: 'coach', anchor: 'places', words: t('מקום מקומות בית עבודה משרד חדר כושר כתובת מיקום', 'place places home work office gym address location') },
  { title: t('Wi-Fi של המקומות', 'Wi-Fi of your places'), path: `${COACH}, Wi-Fi`, target: 'coach', anchor: 'wifi', words: t('wifi ויפי וייפיי רשת רשתות אינטרנט נתב ראוטר בית עבודה משרד חדר כושר מקום מיקום', 'wifi wi-fi network networks internet router home work office gym place location') },
  { title: t('מצב המאמן ברקע', 'Coach in the background'), path: t(`${COACH}, מצב`, `${COACH}, status`), target: 'coach', anchor: 'status', words: t('רקע מיקום בדיקה הרץ הפעל סטטוס', 'background location check run start status') },
  { title: t('תזכורות אימון ושקילה', 'Workout and weigh-in reminders'), path: t('תזכורות', 'Reminders'), target: 'reminders', words: t('תזכורת אימון שקילה בוקר התראה בדיקה משקל', 'reminder workout weigh morning notification test weight') },
  { title: t('דוח שבועי וחודשי', 'Weekly and monthly report'), path: t('דוחות', 'Reports'), target: 'reports', words: t('דוח דוחות סיכום שבועי חודשי', 'report reports summary weekly monthly') },
  { title: t('חופשה', 'Vacation'), path: t('חופשה', 'Vacation'), target: 'vacation', words: t('חופשה טיול נסיעה הפסקה חופש', 'vacation holiday trip travel break') },
  { title: t('מה המאמן למד עליך', 'What the coach learned about you'), path: t('מה המאמן למד', 'What the coach learned'), target: 'learned', words: t('למידה שעת שקילה השכמה קימה רקע ריצה ברקע', 'learning weigh time wake up background running') },
  { title: t('יעדים', 'Goals'), path: t('יעדים ולוח אימונים', 'Goals and workout plan'), target: 'plan', words: t('יעד יעדים קלוריות חלבון צעדים שינה אוכל תזונה', 'goal goals calories protein steps sleep food nutrition') },
  { title: t('סוף שבוע וימי אימון', 'Weekend and workout days'), path: t('סוף שבוע וימי אימון', 'Weekend and workout days'), target: 'schedule', words: t('שבת שישי סופש ימי אימון ימים לוח', 'saturday friday weekend workout days days plan') },
  { title: t('שעון ואפליקציית אוכל', 'Watch and food app'), path: t('בדיקת מוכנות וחיבורים', 'Readiness and connections'), target: 'readiness', words: t('שעון זפ Zepp אוכל אפליקציה חיבור חיבורים הרשאות Health Connect Mi Fitness סנכרון תזונה', 'watch zepp food app connect connections permissions health connect mi fitness sync nutrition') },
  // My file
  { title: t('השם שלך', 'Your name'), path: t(`${FILE}, עליך`, `${FILE}, about you`), target: 'myfile', words: t('שם כינוי איך לקרוא פנייה', 'name nickname call me') },
  { title: t('גיל, גובה ומשקל', 'Age, height and weight'), path: t(`${FILE}, עליך`, `${FILE}, about you`), target: 'myfile', words: t('גיל גובה משקל', 'age height weight') },
  { title: t('מטרה, קצב ומשקל יעד', 'Goal, pace and target weight'), path: t(`${FILE}, המטרה`, `${FILE}, the goal`), target: 'myfile', words: t('מטרה קצב משקל יעד ירידה למה', 'goal pace weight target lose why') },
  { title: t('בריאות וניסיון', 'Health and experience'), path: t(`${FILE}, בריאות וניסיון`, `${FILE}, health and experience`), target: 'myfile', words: t('בריאות ניסיון כאבים מגבלה רפואי רפואית', 'health experience pain limit medical') },
  { title: t('עבודה ושעות', 'Work and hours'), path: t(`${FILE}, עבודה ולוח זמנים`, `${FILE}, work and schedule`), target: 'myfile', words: t('עבודה משרד שעות משמרות פיזית', 'work office hours shifts physical') },
  { title: t('אימונים: ימים, מקום וחלוקה', 'Workouts: days, place and split'), path: t(`${FILE}, עבודה ולוח זמנים`, `${FILE}, work and schedule`), target: 'myfile', words: t('אימון אימונים ימים שעה מקום חלוקה חבל בטן', 'workout workouts days hour place split') },
  { title: t('משפחה וילדים', 'Family and kids'), path: t(`${FILE}, משפחה ובית`, `${FILE}, family and home`), target: 'myfile', words: t('משפחה ילדים זוגיות בית', 'family kids partner home') },
  { title: t('שעות שינה', 'Sleep hours'), path: t(`${FILE}, שגרה ואוכל`, `${FILE}, routine and food`), target: 'myfile', words: t('שינה שעת שינה השכמה קימה התעוררות לילה צהריים', 'sleep bedtime wake up waking night nap') },
  { title: t('ארוחות ביום והגבלות תזונה', 'Meals a day and diet limits'), path: t(`${FILE}, שגרה ואוכל`, `${FILE}, routine and food`), target: 'myfile', words: t('אוכל ארוחות תזונה הגבלות צמחוני טבעוני כשר אלרגיה', 'food meals nutrition limits vegetarian vegan kosher allergy') },
  { title: t('רמה וטון של המאמן', 'Coach level and tone'), path: t(`${FILE}, המאמן`, `${FILE}, the coach`), target: 'myfile', words: t('טון רמה מאמן סגנון עידוד קשוח', 'tone level coach style encouraging tough') },
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
