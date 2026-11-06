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

// Meals he ate only part of ("half"): every amount in the record scaled, here only
const PORTIONS = 'mealPortions.v1';
type Portions = Record<string, { f: number; at: number }>;
async function loadPortions(): Promise<Portions> {
  try {
    return JSON.parse((await AsyncStorage.getItem(PORTIONS)) ?? '{}');
  } catch {
    return {};
  }
}

/** He ate only `factor` of a meal (0.5 for half); 1 undoes it */
export async function setPortion(id: string, factor: number, key?: string, now = Date.now()) {
  const p = await loadPortions();
  for (const k of [id, key].filter(Boolean) as string[]) {
    if (factor === 1) delete p[k];
    else p[k] = { f: factor, at: now };
  }
  for (const [k, v] of Object.entries(p)) if (now - v.at > KEEP_MS) delete p[k];
  await AsyncStorage.setItem(PORTIONS, JSON.stringify(p)).catch(() => {});
}

/** Every number of a Health Connect record ("inGrams", "inKilocalories"...) times a factor */
function scaled<R>(r: R, f: number): R {
  const walk = (x: any): any => {
    if (Array.isArray(x)) return x.map(walk);
    if (!x || typeof x !== 'object') return x;
    const out: any = {};
    for (const [k, v] of Object.entries(x)) out[k] = typeof v === 'number' && /^in[A-Z]/.test(k) ? v * f : k === 'metadata' || k === 'startTime' || k === 'endTime' ? v : walk(v);
    return out;
  };
  return walk(r);
}

export async function withoutHidden<R>(records: R[]): Promise<R[]> {
  const h = await load();
  const kept = Object.keys(h).length ? records.filter((r) => !h[mealId(r)] && !h[mealKey(r)]) : records;
  const p = await loadPortions();
  if (!Object.keys(p).length) return kept;
  return kept.map((r) => {
    const v = p[mealId(r)] ?? p[mealKey(r)];
    return v ? scaled(r, v.f) : r;
  });
}
