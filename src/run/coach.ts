// After a run: one message from the coach, with the full analysis waiting in the app.
import { isQuietTime, CoachMessage } from '../coach/rules';
import { CoachPrefs } from '../coach/store';
import { onVacation } from '../coach/vacation';
import { talk } from './analyze';
import { bounds, syncRuns } from './read';
import { loadRunPrefs, saveRuns } from './store';

import { t as tr } from '../i18n';
export async function runMessage(age: number, now: Date, prefs: CoachPrefs): Promise<CoachMessage | null> {
  if (isQuietTime(now, prefs)) return null;
  if (prefs.vacation && prefs.vacation.mode === 'silent' && onVacation(now, prefs.vacation)) return null;
  const runs = await syncRuns(age, now.getTime());
  const fresh = runs.filter((r) => !r.messaged);
  if (!fresh.length) return null;
  const latest = fresh[fresh.length - 1];
  // Old runs found on the first sync are not news
  await saveRuns(runs.map((r) => (r.messaged ? r : { ...r, messaged: true })));
  if (now.getTime() - latest.end > 12 * 3600000) return null;
  const t = talk(latest, runs, await loadRunPrefs(), await bounds(age, runs), now.getTime());
  return { id: `run@${latest.start}`, priority: 1, level: 'normal', title: t.title, body: tr(`${t.body} פתח כדי לענות.`, `${t.body} Open to answer.`) };
}
