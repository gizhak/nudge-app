// The weight he lifts in each move, set once by him, and how it felt after each workout.
// Two answers the same way in a row (easy, easy or hard, hard) bring a proposal to go up or down
// one step; nothing changes without his "yes".
//
// What the number means depends on the move:
//   barbell: the total on the bar, the bar included (the bar's weight is chosen per move)
//   dumbbell: the weight of one dumbbell
//   machine: the weight on the stack, as the machine shows it (cables too)
//   body: only the weight added (a belt, a vest); 0 is bodyweight alone
import AsyncStorage from '@react-native-async-storage/async-storage';
import { moveOf } from './library';

const KEY = 'train.loads.v1';

export type LoadKind = 'barbell' | 'dumbbell' | 'machine' | 'body';
export type Unit = 'kg' | 'lb';
export type Feel = 'easy' | 'right' | 'hard';

export interface Load {
  kind: LoadKind;
  unit: Unit;
  value: number;
  /** Barbell only: the bar's own weight, in the same unit */
  bar?: number;
  setAt: number;
  /** Answers after workouts, newest last; `at` is the workout's start, so one workout counts once */
  feels: { at: number; v: Feel }[];
  /** A proposal waiting for his answer */
  offer?: { to: number; dir: 'up' | 'down'; at: number };
}

const BARBELL = /במוט|^סקוואט$|^דדליפט רומני$|^היפ תראסט$|^לחיצת חזה צרה$/;
const DUMBBELL = /משקולות|משקולת|גובלט|^כפיפת מרפקים$|^כפיפת מרפקים בשיפוע$|^כפיפת פטישים$|^הרחקה לצדדים$|^לחיצת כתפיים$|^פשיטת מרפקים מעל הראש$/;
const MACHINE = /מכונ|כבל|חבל|פולי|^לחיצת רגליים$|^פייס פול$|^תאומים/;
const BODY = /^מתח$|^מקבילים$|^הרמות ברכיים בתלייה$|^שכיבות סמיכה|^לאנג׳ים$|^סקוואט בולגרי$|^סקוואט במשקל גוף$|^גשר ישבן$|^חתירה הפוכה|^סופרמן$/;

/** How the move is loaded; null when there is no weight to track (a band, a timed hold, the ab wheel) */
export function kindOf(name: string): LoadKind | null {
  const n = moveOf(name)?.name ?? name.split(' או ')[0].trim();
  const mv = moveOf(n);
  if (mv && /שניות|דקות|דקה/.test(mv.reps)) return null;
  if (/גומייה|גלגל בטן/.test(n)) return null;
  if (BARBELL.test(n)) return 'barbell';
  if (DUMBBELL.test(n)) return 'dumbbell';
  if (MACHINE.test(n)) return 'machine';
  if (BODY.test(n)) return 'body';
  return mv?.gear === 'body' ? 'body' : mv ? 'machine' : null;
}

/** One step up or down: 2.5 kg or 5 lb; a machine's stack goes by its plates, usually 5 kg or 10 lb */
export const stepOf = (kind: LoadKind, unit: Unit) => (kind === 'machine' ? (unit === 'kg' ? 5 : 10) : unit === 'kg' ? 2.5 : 5);

export const BARS: Record<Unit, number[]> = { kg: [20, 15, 10], lb: [45, 35, 25] };

/** A first value for the editor, before he sets one */
export function startLoad(kind: LoadKind, unit: Unit = 'kg'): Pick<Load, 'kind' | 'unit' | 'value' | 'bar'> {
  if (kind === 'barbell') return { kind, unit, value: unit === 'kg' ? 40 : 95, bar: unit === 'kg' ? 20 : 45 };
  if (kind === 'dumbbell') return { kind, unit, value: unit === 'kg' ? 10 : 25 };
  if (kind === 'machine') return { kind, unit, value: unit === 'kg' ? 30 : 60 };
  return { kind, unit, value: 0 };
}

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const unitText = (u: Unit) => (u === 'kg' ? 'ק"ג' : 'lb');

/** The weight as said in a tag or a row */
export function loadText(l: Pick<Load, 'kind' | 'unit' | 'value'>): string {
  if (l.kind === 'body') return l.value > 0 ? `+${fmtNum(l.value)} ${unitText(l.unit)}` : 'משקל גוף';
  return `${fmtNum(l.value)} ${unitText(l.unit)}`;
}

/** Barbell: what goes on each side, the bar taken off */
export function perSide(l: Pick<Load, 'value' | 'bar' | 'unit'>): string | null {
  if (l.bar == null) return null;
  const side = (l.value - l.bar) / 2;
  if (side < 0) return 'פחות ממשקל המוט';
  if (side === 0) return 'מוט בלבד';
  return `בכל צד ${fmtNum(side)} ${unitText(l.unit)}, ומוט של ${fmtNum(l.bar)} ${unitText(l.unit)}`;
}

export async function loadLoads(): Promise<Record<string, Load>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');
  } catch {
    return {};
  }
}
const saveAll = (all: Record<string, Load>) => AsyncStorage.setItem(KEY, JSON.stringify(all));

/** The key a move's weight is kept under: "X או Y" is X */
export const loadKey = (name: string) => moveOf(name)?.name ?? name.split(' או ')[0].trim();

export async function setLoad(name: string, l: Pick<Load, 'kind' | 'unit' | 'value' | 'bar'>, now = Date.now()) {
  const all = await loadLoads();
  const cur = all[loadKey(name)];
  // A new weight starts the count of answers again
  all[loadKey(name)] = { ...l, setAt: now, feels: cur && cur.value === l.value && cur.unit === l.unit ? cur.feels : [], offer: undefined };
  await saveAll(all);
}

/** What two answers in a row call for, if anything: a pure decision, so it can be tested */
export function offerFor(l: Load): Load['offer'] | null {
  const last = l.feels.slice(-2);
  if (last.length < 2 || last[0].v !== last[1].v || last[0].v === 'right') return null;
  const step = stepOf(l.kind, l.unit);
  if (last[0].v === 'easy') return { to: l.value + step, dir: 'up', at: last[1].at };
  const to = l.value - step;
  // Nothing to take off: bodyweight alone, or the lightest pin
  if (l.kind === 'body' ? to < 0 : to <= 0) return null;
  if (l.kind === 'barbell' && l.bar != null && to < l.bar) return null;
  return { to, dir: 'down', at: last[1].at };
}

/** His answer for one move after one workout; returns the move's record with any new proposal */
export async function noteFeel(name: string, workoutAt: number, v: Feel): Promise<Load | null> {
  const all = await loadLoads();
  const k = loadKey(name);
  const l = all[k];
  if (!l) return null;
  const feels = [...l.feels.filter((f) => f.at !== workoutAt), { at: workoutAt, v }].sort((a, b) => a.at - b.at).slice(-6);
  const next: Load = { ...l, feels };
  next.offer = offerFor(next) ?? undefined;
  all[k] = next;
  await saveAll(all);
  return next;
}

/** Yes moves the weight one step and starts counting again; no starts counting again */
export async function answerOffer(name: string, yes: boolean, now = Date.now()): Promise<Load | null> {
  const all = await loadLoads();
  const k = loadKey(name);
  const l = all[k];
  if (!l?.offer) return l ?? null;
  const next: Load = yes ? { ...l, value: l.offer.to, setAt: now, feels: [], offer: undefined } : { ...l, feels: [], offer: undefined };
  all[k] = next;
  await saveAll(all);
  return next;
}
