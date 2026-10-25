// Waist once a week, between the four-weekly checkpoints: the simplest measure of belly fat,
// and the one water and food move the least. Kept on the phone.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'progress.waist.v1';

export interface WaistEntry {
  at: number;
  cm: number;
}

export async function loadWaist(): Promise<WaistEntry[]> {
  try {
    const list: WaistEntry[] = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
    return list.filter((x) => x.cm > 40 && x.cm < 200).sort((a, b) => a.at - b.at);
  } catch {
    return [];
  }
}

/** One a day: a second entry the same day replaces the first */
export async function saveWaist(cm: number, at = Date.now()): Promise<void> {
  const day = new Date(at).toDateString();
  const list = (await loadWaist()).filter((x) => new Date(x.at).toDateString() !== day);
  await AsyncStorage.setItem(KEY, JSON.stringify([...list, { at, cm }].slice(-200)));
}

/** Days since the last waist, from the weekly entries and the checkpoints together */
export function daysSinceWaist(weekly: WaistEntry[], checkpoints: { at: number; waistCm?: number }[], now = Date.now()): number | null {
  const times = [...weekly.map((x) => x.at), ...checkpoints.filter((c) => c.waistCm != null).map((c) => c.at)];
  if (!times.length) return null;
  return Math.floor((now - Math.max(...times)) / 86400000);
}
