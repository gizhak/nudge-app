// The morning question about a night with no sleep data. One missing night: "what happened?".
// Two in a row is not a watch left on the table: did the watch change, or did something in its settings.
import { readSleepByNight } from '../health/history';
import type { CoachMessage } from '../coach/rules';

import { t } from '../i18n';
/** Message ids, by topic */
export const SLEEP_MISSING = 'sleep_missing';
export const SLEEP_MISSING2 = 'sleep_missing2';

export async function sleepMessages(now: Date, wakeTime: number): Promise<CoachMessage[]> {
  const m = now.getHours() * 60 + now.getMinutes();
  // Late enough for the watch to have synced, still the morning
  if (m < Math.max(wakeTime + 90, 8 * 60) || m >= 13 * 60) return [];
  const nights = await readSleepByNight(14, now).catch(() => []);
  if (nights.length < 3) return [];
  const last = nights[nights.length - 1];
  const prev = nights[nights.length - 2];
  if (last.minutes != null) return [];
  // Only for someone whose watch does record sleep: a few nights in the last two weeks
  if (nights.filter((n) => n.minutes != null && !n.manual).length < 3) return [];
  const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  if (prev.minutes == null)
    return [{ id: `${SLEEP_MISSING2}@${day}`, priority: 1, title: t('שני לילות בלי נתון שינה', 'Two nights without sleep data'), body: t('זה כבר לא שעון שנשכח על השולחן. החלפת שעון או שינית משהו בהגדרות שלו?', 'This is no longer a watch left on the table. Did you change watches, or change something in its settings?') }];
  return [{ id: `${SLEEP_MISSING}@${day}`, priority: 1, title: t('לא קיבלתי נתון שינה על הלילה', 'I got no sleep data for last night'), body: t('מה קרה?', 'What happened?') }];
}
