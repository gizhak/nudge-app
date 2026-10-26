// Nights the watch did not record, entered by hand: when he went to bed and when he woke up.
// Kept in the app only, never written to Health Connect, so the watch's data stays clean.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sleep.manual.v1';

export interface ManualNight {
  /** Epoch ms */
  bed: number;
  wake: number;
  minutes: number;
  at: number;
}

/** The night is named by the morning it ended: the start of that day, as a local date */
export const morningKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

export async function loadManual(): Promise<Record<string, ManualNight>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');
  } catch {
    return {};
  }
}

export async function saveManual(bed: number, wake: number, now = Date.now()): Promise<ManualNight> {
  const all = await loadManual();
  const n: ManualNight = { bed, wake, minutes: Math.max(0, Math.round((wake - bed) / 60000)), at: now };
  all[morningKey(wake)] = n;
  // Two months is plenty
  const keep = Object.entries(all)
    .sort((a, b) => b[1].wake - a[1].wake)
    .slice(0, 60);
  await AsyncStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keep)));
  return n;
}
