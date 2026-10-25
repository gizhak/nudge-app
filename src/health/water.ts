import AsyncStorage from '@react-native-async-storage/async-storage';
import { noteAct } from '../learn/store';
import { deleteRecordsByUuids, insertRecords, readRecords } from 'react-native-health-connect';
import { CUP_ML } from '../nutrition/water';
import { noteDrink } from '../coach/replies';

const KEY = 'water.mine.v1';

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/** Water drunk today, from every app that writes Hydration to Health Connect. */
export async function readWaterToday(now = new Date()): Promise<number> {
  const { records }: any = await readRecords('Hydration', {
    timeRangeFilter: { operator: 'between', startTime: startOfDay(now).toISOString(), endTime: now.toISOString() },
  });
  return records.reduce((a: number, r: any) => a + (r.volume?.inMilliliters ?? 0), 0);
}

async function mine(): Promise<{ day: number; ids: string[]; mls?: number[] }> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && v.day === startOfDay(new Date()).getTime() ? v : { day: startOfDay(new Date()).getTime(), ids: [] };
  } catch {
    return { day: startOfDay(new Date()).getTime(), ids: [] };
  }
}

export async function addWater(ml = CUP_ML, at = new Date()) {
  const ids = await insertRecords([
    {
      recordType: 'Hydration',
      startTime: new Date(at.getTime() - 60000).toISOString(),
      endTime: at.toISOString(),
      volume: { value: ml, unit: 'milliliters' },
    } as any,
  ]);
  const m = await mine();
  await AsyncStorage.setItem(KEY, JSON.stringify({ day: m.day, ids: [...m.ids, ...ids], mls: [...(m.mls ?? m.ids.map(() => CUP_ML)), ml] }));
  await noteAct('water', at.getTime());
  // His answer in the coach chat: "I drank 5 sips"
  await noteDrink(ml, await readWaterToday().catch(() => undefined), at);
}

/** Removes the last cup added from this app today. Returns false when there is nothing to undo. */
export async function undoWater(): Promise<boolean> {
  const m = await mine();
  const last = m.ids[m.ids.length - 1];
  if (!last) return false;
  await deleteRecordsByUuids('Hydration', [last], []);
  const mls = m.mls ?? m.ids.map(() => CUP_ML);
  await AsyncStorage.setItem(KEY, JSON.stringify({ day: m.day, ids: m.ids.slice(0, -1), mls: mls.slice(0, -1) }));
  await noteDrink(-(mls[mls.length - 1] ?? CUP_ML));
  return true;
}
