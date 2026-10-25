import { loadPrefs, loadWeekOverrides, savePrefs } from '../coach/store';
import { setWeekOverrides } from '../config/goals';
import { defaultSlots } from '../nutrition/meals';
import { applyDerived, derive, Derived } from './derive';
import { loadProfile, Profile, saveProfile } from './profile';

/** Loads the saved profile and makes its plan active. Safe to call from background tasks. */
export async function loadAndApply(): Promise<{ profile: Profile; derived: Derived }> {
  const profile = await loadProfile();
  const derived = derive(profile);
  applyDerived(derived);
  setWeekOverrides(await loadWeekOverrides());
  return { profile, derived };
}

/** Saves a finished questionnaire and pushes its choices into the coach settings. */
export async function commitProfile(profile: Profile): Promise<Derived> {
  const before = await loadProfile();
  const p = { ...profile, completed: true };
  await saveProfile(p);
  const derived = derive(p);
  applyDerived(derived);
  const prefs = await loadPrefs();
  await savePrefs({
    ...prefs,
    // Only when changed in the questionnaire: the coach settings may hold a newer choice
    level: before.completed && before.level === p.level ? prefs.level : p.level,
    tone: before.completed && before.tone === p.tone ? prefs.tone : p.tone,
    wakeTime: p.wakeTime,
    bedTime: p.bedTime,
    quietStart: p.bedTime,
    quietEnd: p.wakeTime,
    // Keep meal slots chosen in the coach settings unless the number of meals changed
    mealSlots: before.completed && before.mealsPerDay === p.mealsPerDay ? prefs.mealSlots : defaultSlots(p.mealsPerDay),
    // Shift work: no fixed night, so no night guard
    nightGuard: p.shiftWork ? false : prefs.nightGuard,
  });
  return derived;
}
