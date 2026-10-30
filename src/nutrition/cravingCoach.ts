// The evening before the usual sweet: one message with a ready answer.
import { CoachMessage } from '../coach/rules';
import { caloriesFor, GOALS } from '../config/goals';
import { readMealsSince } from '../health/history';
import { eveningPattern } from './cravings';

import { t } from '../i18n';
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
  const room = left > 150 ? t(`נשארו לך ${left} קלוריות, אז יש מקום למשהו קטן.`, `You have ${left} calories left, so there is room for something small.`) : left > 0 ? t(`נשארו לך רק ${left} קלוריות.`, `You have only ${left} calories left.`) : t(`כבר עברת את היעד היום ב ${-left}.`, `You already passed today's goal by ${-left}.`);
  const pick = protein > 20 ? t('יוגורט פרו עם פירות קפואים: מתוק, קר, 150 קלוריות ו 20 גרם חלבון.', 'A protein yogurt with frozen fruit: sweet, cold, 150 calories and 20 grams of protein.') : t('כוס פירות קפואים או תה, ומשם לישון.', 'A cup of frozen fruit or tea, and then to bed.');
  return {
    id: 'craving_evening',
    priority: 2,
    title: t('השעה של המתוק', 'Sweet hour'),
    body: t(`ב ${nights} מתוך 7 הערבים האחרונים נכנס מתוק אחרי 21:00. ${room} ההצעה שלי מראש: ${pick} בא לך משהו אחר? לחץ, ואגיד לך אם זה מתאים.`, `On ${nights} of the last 7 evenings something sweet came in after 21:00. ${room} My suggestion ahead of time: ${pick} Feel like something else? Tap, and I will tell you if it fits.`),
  };
}
