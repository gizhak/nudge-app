// What he answered the coach, in his own words, for the chat: "I drank 5 sips".
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dayKey } from './store';

const KEY = 'coach.replies.v1';

export interface Reply {
  at: number;
  kind: 'water' | 'plan';
  /** Negative when he took a sip back */
  ml: number;
  /** Today's water after this, when known */
  total?: number;
  /** A change to the workout plan: what he did, and the coach's answer */
  text?: string;
  reply?: string;
}

/** He moved, shortened, skipped or did a workout: his line and the coach's answer, in the chat */
export async function noteChange(text: string, reply: string, now = new Date()) {
  try {
    const items = await loadReplies(now);
    items.push({ at: now.getTime(), kind: 'plan', ml: 0, text, reply });
    await AsyncStorage.setItem(KEY, JSON.stringify({ day: dayKey(now), items: items.slice(-200) }));
  } catch {
    // best effort
  }
}

/** Today's workout messages are moot once he changed today's workout */
export const WORKOUT_TOPICS = ['workout_today', 'workout_now', 'missed_workout', 'pre_workout_snack', 'home_before_workout', 'outing_workout', 'gym_arrive'];

/** Today's session as the coach says it at the gym: the exercises with sets and reps */
export const sessionLine = (exercises: { name: string; sets: number; reps: string | number }[]) => exercises.map((e) => `${e.name} ${e.sets}×${e.reps}`).join(' · ');

export async function loadReplies(now = new Date()): Promise<Reply[]> {
  try {
    const raw = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');
    return raw.day === dayKey(now) ? raw.items ?? [] : [];
  } catch {
    return [];
  }
}

export async function noteDrink(ml: number, total?: number, now = new Date()) {
  try {
    const items = await loadReplies(now);
    items.push({ at: now.getTime(), kind: 'water', ml, total });
    await AsyncStorage.setItem(KEY, JSON.stringify({ day: dayKey(now), items: items.slice(-200) }));
  } catch {
    // best effort
  }
}

/** Sips in a row become one answer: taps less than 15 minutes apart with no coach message between. */
export function mergeReplies(replies: Reply[], messageTimes: number[]): Reply[] {
  const out: Reply[] = [];
  for (const r of [...replies].filter((x) => x.kind !== 'plan').sort((a, b) => a.at - b.at)) {
    const last = out[out.length - 1];
    const between = last ? messageTimes.some((t) => t > last.at && t < r.at) : true;
    if (last && !between && r.at - last.at < 15 * 60000) {
      last.ml += r.ml;
      last.at = r.at;
      if (r.total != null) last.total = r.total;
    } else out.push({ ...r });
  }
  return out.filter((r) => r.ml > 0);
}
