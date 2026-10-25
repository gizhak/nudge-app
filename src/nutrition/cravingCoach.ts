// The evening before the usual sweet: one message with a ready answer.
import { CoachMessage } from '../coach/rules';
import { caloriesFor, GOALS } from '../config/goals';
import { readMealsSince } from '../health/history';
import { eveningPattern } from './cravings';

/** Between 20:30 and 21:30, when sweets came after 21:00 on 3 of the last 7 evenings. */
export async function cravingMessage(now: Date): Promise<CoachMessage | null> {
  const m = now.getHours() * 60 + now.getMinutes();
  if (m < 20 * 60 + 30 || m > 21 * 60 + 30) return null;
  const items = await readMealsSince(8, now);
  const nights = eveningPattern(items, now);
  if (nights < 3) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const eaten = items.filter((i) => i.time >= today);
  const left = Math.round(caloriesFor(now) - eaten.reduce((a, i) => a + i.kcal, 0));
  const protein = Math.round(GOALS.proteinG - eaten.reduce((a, i) => a + i.protein, 0));
  const room = left > 150 ? `נשארו לך ${left} קלוריות, אז יש מקום למשהו קטן.` : left > 0 ? `נשארו לך רק ${left} קלוריות.` : `כבר עברת את היעד היום ב ${-left}.`;
  const pick = protein > 20 ? 'יוגורט פרו עם פירות קפואים: מתוק, קר, 150 קלוריות ו 20 גרם חלבון.' : 'כוס פירות קפואים או תה, ומשם לישון.';
  return {
    id: 'craving_evening',
    priority: 2,
    title: 'השעה של המתוק',
    body: `ב ${nights} מתוך 7 הערבים האחרונים נכנס מתוק אחרי 21:00. ${room} ההצעה שלי מראש: ${pick} בא לך משהו אחר? לחץ, ואגיד לך אם זה מתאים.`,
  };
}
