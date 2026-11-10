// A food eaten at one meal but logged later: Zepp sends the time it was saved, so lunch shows up as
// the afternoon snack. He tells us once which meal it was, and every screen and the coach count it
// there. Kept by the food's key, so a resend from Zepp stays moved; forgotten after a few days.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SLOT_BY_ID, SlotId } from '../nutrition/meals';

const KEY = 'meal.moves.v1';
const KEEP_MS = 4 * 24 * 3600 * 1000;

type Moves = Record<string, { slot: SlotId; at: number }>;

async function load(): Promise<Moves> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');
  } catch {
    return {};
  }
}

/** Moves a food to another meal of the same day; `null` puts it back at the time it came with */
export async function moveMeal(meal: { id: string; key?: string; time: Date; origTime?: Date }, slot: SlotId | null) {
  const all = await load();
  const k = meal.key ?? meal.id;
  const now = Date.now();
  for (const [x, v] of Object.entries(all)) if (now - v.at > KEEP_MS) delete all[x];
  if (slot) all[k] = { slot, at: (meal.origTime ?? meal.time).getTime() };
  else delete all[k];
  await AsyncStorage.setItem(KEY, JSON.stringify(all));
}

/** The middle of a meal's hours, on the day the food came */
function timeIn(slot: SlotId, day: Date): Date {
  const s = SLOT_BY_ID[slot];
  // The night meal runs past midnight: half an hour into it, still on the same evening
  const m = s.to > s.from ? s.from + Math.round((s.to - s.from) / 2) : s.from + 30;
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() + (m % 1440) * 60000);
}

/** Foods he moved get their meal's time, and remember where they came from */
export async function applyMoves<M extends { id: string; key?: string; time: Date }>(meals: M[]): Promise<(M & { moved?: SlotId; origTime?: Date })[]> {
  const all = await load();
  if (!Object.keys(all).length) return meals;
  return meals
    .map((m) => {
      const v = all[m.key ?? m.id];
      return v ? { ...m, time: timeIn(v.slot, m.time), moved: v.slot, origTime: m.time } : m;
    })
    .sort((a, b) => a.time.getTime() - b.time.getTime());
}
