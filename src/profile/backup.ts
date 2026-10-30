// Export and import of the user file, for moving to a new phone.
import { loadPlaces, loadPrefs, savePlaces, savePrefs } from '../coach/store';
import { loadProfile, saveProfile } from './profile';

import { t } from '../i18n';
const MARK = 'nudge-backup';

export async function exportBackup(): Promise<string> {
  const [profile, prefs, places] = await Promise.all([loadProfile(), loadPrefs(), loadPlaces()]);
  return JSON.stringify({ [MARK]: 1, at: new Date().toISOString(), profile, prefs, places });
}

/** Restores a backup pasted as text. Returns an error in Hebrew, or null on success. */
export async function importBackup(text: string): Promise<string | null> {
  let data: any;
  try {
    // tolerate text around the JSON, as messaging apps sometimes add it
    data = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    return t('זה לא נראה כמו גיבוי של Nudge. העתק את כל הטקסט שיצא בייצוא.', 'This does not look like a Nudge backup. Copy all the text the export produced.');
  }
  if (data?.[MARK] !== 1 || !data.profile?.completed) return t('זה לא נראה כמו גיבוי של Nudge.', 'This does not look like a Nudge backup.');
  await saveProfile(data.profile);
  if (data.prefs) await savePrefs({ ...(await loadPrefs()), ...data.prefs });
  if (data.places) await savePlaces(data.places);
  return null;
}
