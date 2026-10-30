// What the coach learned, what it sent (kept longer than the journal, for learning), when it
// ran in the background, and what he marked as wrong. All on the phone.
import { LANG } from '../i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readRecords } from 'react-native-health-connect';
import { isWeekend } from '../config/goals';
import { Effect, Events, Fact, learnAll, Sent } from './compute';

// facts v2: the water learning of v1 was measured on missing data and is thrown away once
const K = { sent: 'learn.sent.v1', beats: 'learn.beats.v1', facts: 'learn.facts.v2', off: 'learn.off.v1', acts: 'learn.acts.v1' };
const DAY = 86400000;

const read = async <X,>(key: string, fb: X): Promise<X> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as X) : fb;
  } catch {
    return fb;
  }
};

/** Every coach message, by topic and time: 30 days of it. */
export async function noteSent(topic: string, at: number) {
  const list = await read<Sent[]>(K.sent, []);
  const keep = [...list, { t: topic, at }].filter((s) => at - s.at < 30 * DAY);
  await AsyncStorage.setItem(K.sent, JSON.stringify(keep)).catch(() => undefined);
}

export type Beat = { at: number; how: 'bg' | 'place' | 'manual' | 'unlock' };

/** Each coach run, so we can see whether the phone lets it run in the background. 3 days. */
export async function noteBeat(how: Beat['how'], at = Date.now()) {
  const list = await read<Beat[]>(K.beats, []);
  const keep = [...list, { at, how }].filter((b) => at - b.at < 3 * DAY);
  await AsyncStorage.setItem(K.beats, JSON.stringify(keep)).catch(() => undefined);
}
export const loadBeats = () => read<Beat[]>(K.beats, []);

export interface Learned {
  at: number;
  /** The language its texts were written in */
  lang?: 'he' | 'en';
  facts: Fact[];
  effects: Effect[];
}
export const loadLearned = () => read<Learned>(K.facts, { at: 0, facts: [], effects: [] });
export const loadOff = () => read<string[]>(K.off, []);

export async function setOff(key: string, off: boolean) {
  const list = await loadOff();
  const next = off ? [...new Set([...list, key])] : list.filter((k) => k !== key);
  await AsyncStorage.setItem(K.off, JSON.stringify(next));
}

/** What was learned, without what he marked as wrong. */
export async function activeLearned(): Promise<Learned> {
  const [l, off] = await Promise.all([loadLearned(), loadOff()]);
  return { ...l, facts: l.facts.filter((f) => !off.includes(f.key)), effects: l.effects.filter((e) => !off.includes(`eff_${e.topic}`)) };
}

const win = (s: number, e: number) => ({
  timeRangeFilter: { operator: 'between' as const, startTime: new Date(s).toISOString(), endTime: new Date(e).toISOString() },
});
/** Every page of the records: with sips counted one by one, three weeks of water is thousands */
const recs = async (type: string, s: number, e: number): Promise<any[]> => {
  const out: any[] = [];
  try {
    let pageToken: string | undefined;
    for (let i = 0; i < 20; i++) {
      const res: any = await readRecords(type as any, { ...win(s, e), pageSize: 5000, ...(pageToken ? { pageToken } : {}) } as any);
      out.push(...(res?.records ?? []));
      pageToken = res?.pageToken || undefined;
      if (!pageToken) break;
    }
  } catch {
    // what was read so far
  }
  return out;
};

/** What he did in this app, kept here too: a Health Connect read that comes back empty does not erase it */
export async function noteAct(kind: 'water', at = Date.now()) {
  const list = await read<{ k: string; at: number }[]>(K.acts, []);
  const keep = [...list, { k: kind, at }].filter((x) => at - x.at < 30 * DAY).slice(-3000);
  await AsyncStorage.setItem(K.acts, JSON.stringify(keep)).catch(() => undefined);
}

/** The learning pass: at most every 12 hours, over the last 3 weeks. */
export async function learn(now = Date.now(), force = false): Promise<Learned> {
  const last = await loadLearned();
  // Texts written in another language are learned again at once
  if (!force && now - last.at < 12 * 3600000 && (last.lang ?? 'he') === LANG) return last;
  const from = now - 22 * DAY;
  const [w, h, n, x, sl] = await Promise.all([
    recs('Weight', from, now),
    recs('Hydration', from, now),
    recs('Nutrition', from, now),
    recs('ExerciseSession', from, now),
    recs('SleepSession', from, now),
  ]);
  const acts = await read<{ k: string; at: number }[]>(K.acts, []);
  const ev: Events = {
    weights: w.map((r) => new Date(r.time).getTime()),
    water: [...h.map((r) => new Date(r.endTime ?? r.startTime).getTime()), ...acts.filter((a) => a.k === 'water').map((a) => a.at)],
    meals: n.map((r) => new Date(r.startTime).getTime()),
    workouts: x.map((r) => new Date(r.startTime).getTime()),
    sleeps: sl.map((r) => ({ start: new Date(r.startTime).getTime(), end: new Date(r.endTime).getTime() })),
  };
  const sent = await read<Sent[]>(K.sent, []);
  const { facts, effects } = learnAll(ev, sent, now, isWeekend);
  const out: Learned = { at: now, lang: LANG, facts, effects };
  await AsyncStorage.setItem(K.facts, JSON.stringify(out)).catch(() => undefined);
  return out;
}
