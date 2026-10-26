// The coach's weekly work, as messages: the focus on Sunday (with how last week's went), an evening
// check on the focus that gets firmer as misses add up, and a proposed change to the plan.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CoachMessage } from './rules';
import { ensureFocus, Focus, focusProgress, isRealFocus } from './focus';
import { checkProposal, loadProposal } from './proposals';

const CHECKED = 'coach.proposalChecked.v1';
const at = (h: number, m = 0) => h * 60 + m;

export interface Today {
  kcal: number;
  protein: number;
  meals: number;
  steps: number;
  targets: { calories: number; proteinG: number; steps: number };
  bedTime: number;
  level: 'quiet' | 'normal' | 'close' | 'drill';
}

/** Firmer with each miss this week; the "drill" level goes one step further */
function tone(misses: number, level: Today['level'], soft: string, firm: string, hard: string): string {
  const step = misses + (level === 'drill' ? 1 : 0);
  return step <= 0 ? soft : step === 1 ? firm : hard;
}

function evening(f: Focus, t: Today, m: number, misses: number, left: number): CoachMessage | null {
  const k = f.key;
  const ask = (soft: string, firm: string, hard: string) => tone(misses, t.level, soft, firm, hard);
  if (k === 'protein' && m >= at(19) && m <= at(21, 30) && t.protein < t.targets.proteinG * 0.9) {
    const gap = Math.round(t.targets.proteinG * 0.9 - t.protein);
    return {
      id: 'focus_day',
      priority: 1,
      title: `המיקוד: חסרים ${gap} גרם חלבון`,
      body: ask(
        `עוד ${gap} גרם וסגרת את היום. קוטג', יוגורט חלבון או טונה עכשיו.`,
        `אתמול זה לא נסגר, והיום חסרים ${gap} גרם. זה המיקוד היחיד של השבוע. מנה של חלבון עכשיו.`,
        `אמרנו ${t.targets.proteinG} גרם ביום. ${misses} ימים השבוע זה לא קרה, ונשארו ${left} ימים. מה מפריע? מנה של חלבון עכשיו, ומחר בבוקר מתחילים עם חלבון.`,
      ),
    };
  }
  if (k === 'kcal' && m >= at(20) && m <= at(21, 30) && t.meals >= 2 && t.kcal > t.targets.calories * 1.1) {
    const over = Math.round(t.kcal - t.targets.calories);
    return {
      id: 'focus_day',
      priority: 1,
      title: `המיקוד: ${over} קלוריות מעל היעד`,
      body: ask(
        'היום יצא מעל. מכאן ועד השינה רק מים ותה, ומחר מתחילים מחדש.',
        `שני ימים השבוע מעל היעד. המטבח נסגר עכשיו, וזה המיקוד של השבוע.`,
        `אמרנו קלוריות ביעד. ${misses + 1} ימים השבוע זה לא קרה. מחר תכנן מראש את הארוחה שבה אתה חורג, ותגיד לי איזו היא.`,
      ),
    };
  }
  if (k === 'steps' && m >= at(18) && m <= at(20, 30) && t.steps < t.targets.steps * 0.75) {
    const gap = Math.round((t.targets.steps - t.steps) / 100) * 100;
    return {
      id: 'focus_day',
      priority: 1,
      title: `המיקוד: חסרים ${gap.toLocaleString('en-US')} צעדים`,
      body: ask(
        `סיבוב של ${Math.max(10, Math.round(gap / 110))} דקות עכשיו סוגר את זה.`,
        `גם אתמול זה לא נסגר. ${Math.max(10, Math.round(gap / 110))} דקות הליכה, עכשיו, לפני שהערב נגמר.`,
        `${misses} ימים השבוע בלי היעד. זה המיקוד של השבוע. נעליים, ויוצאים ל ${Math.max(10, Math.round(gap / 110))} דקות.`,
      ),
    };
  }
  if (k === 'sleep' && m >= t.bedTime - 75 && m <= t.bedTime - 30) {
    return {
      id: 'focus_day',
      priority: 1,
      title: 'המיקוד: שינה',
      body: ask(
        'עוד שעה למיטה. מסך כבה בעוד חצי שעה.',
        'אתמול הלילה היה קצר. היום מקדימים: מסך כבה בעוד חצי שעה.',
        `${misses} לילות קצרים השבוע. זה המיקוד, וזה מה שמגדיל לך את הרעב למחרת. למיטה בזמן, בלי תירוצים.`,
      ),
    };
  }
  if (k === 'logging' && m >= at(21) && m <= at(22) && t.meals < 2) {
    return {
      id: 'focus_day',
      priority: 1,
      title: 'המיקוד: רישום',
      body: ask('היום נרשמה רק ארוחה אחת. תרשום עכשיו את מה שאכלת, גם בקירוב.', 'גם אתמול הרישום לא הושלם. דקה עכשיו ב Zepp.', `אמרנו לרשום כל יום. ${misses} ימים השבוע זה לא קרה, ובלי זה אני לא יכול לעזור לך. דקה עכשיו.`),
    };
  }
  return null;
}

/** The weekly messages for this run, given today's numbers */
export async function weeklyMessages(now: Date, t: Today): Promise<CoachMessage[]> {
  const out: CoachMessage[] = [];
  const m = now.getHours() * 60 + now.getMinutes();
  const f = await ensureFocus(now).catch(() => null);
  if (isRealFocus(f) && m >= at(8)) {
    const last = f.last ? `בשבוע שעבר: ${f.last.title}, ${f.last.hit} מתוך ${f.last.need}. ` : '';
    out.push({ id: `focus_week@${f.week}`, priority: 1, title: `המיקוד לשבוע: ${f.title}`, body: `${last}${f.why} המטרה: ${f.need} ימים מתוך 7.` });
    // The evening check needs the week so far, read only in its window
    if (m >= at(17)) {
      const p = await focusProgress(f, now).catch(() => null);
      if (p) {
        const misses = p.days.slice(0, now.getDay()).filter((x) => x === false).length;
        const e = evening(f, t, m, misses, 7 - now.getDay());
        if (e) out.push(e);
      }
    }
  }
  // A plan change: looked at once a day, said once
  if (m >= at(9)) {
    const day = now.toDateString();
    let p = null;
    try {
      const last = await AsyncStorage.getItem(CHECKED);
      if (last !== day) {
        await AsyncStorage.setItem(CHECKED, day);
        p = await checkProposal(now.getTime());
      } else {
        const cur = await loadProposal();
        p = cur?.status === 'open' ? cur : null;
      }
    } catch {
      p = null;
    }
    if (p) out.push({ id: `proposal@${p.id}`, priority: 1, title: p.title, body: p.body });
  }
  return out;
}

