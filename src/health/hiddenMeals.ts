// Meals hidden in Nudge. Some food apps (Zepp among them) do not pass a deletion on to
// Health Connect, so a meal deleted there stays here. Nudge cannot delete another app's
// record, so it remembers which ones to leave out.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mealId, mealKey } from './meals';

const KEY = 'hiddenMeals.v1';
const KEEP_MS = 21 * 24 * 3600 * 1000;

type Hidden = Record<string, number>;

async function load(): Promise<Hidden> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const save = (h: Hidden) => AsyncStorage.setItem(KEY, JSON.stringify(h)).catch(() => {});

/** Hides a meal by its record id and by its meal key, so a second copy of it (or an edit) stays hidden too. */
export async function hideMeal(id: string, now = Date.now(), key?: string) {
  const h = await load();
  h[id] = now;
  if (key) h[key] = now;
  // Old entries fall out: past three weeks no screen reads that day anymore
  for (const [k, t] of Object.entries(h)) if (now - t > KEEP_MS) delete h[k];
  await save(h);
}

export async function unhideMeal(id: string, key?: string) {
  const h = await load();
  delete h[id];
  if (key) delete h[key];
  await save(h);
}

export async function withoutHidden<R>(records: R[]): Promise<R[]> {
  const h = await load();
  if (!Object.keys(h).length) return records;
  return records.filter((r) => !h[mealId(r)] && !h[mealKey(r)]);
}
