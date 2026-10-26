// Changes to the plan the coach proposes and he approves, like a coach who adjusts: three weeks of a
// flat weight while eating and training on target means the body adapted (eat a little less); losing
// more than 1.2 kg a week for two weeks takes muscle too (eat a little more). Nothing changes without "yes".
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyDerived, derive } from '../profile/derive';
import { loadProfile, saveProfile } from '../profile/profile';
import { safeGoal } from '../profile/safety';
import { readWeights } from '../health/history';
import { collectDays } from '../report/collect';
import { metrics } from '../report/compute';
import { context } from '../report/run';
import { noteChange } from './replies';

const KEY = 'coach.proposal.v1';
const DAY = 86400000;
/** After an answer, two weeks before the next proposal: a change needs time to show */
const COOLDOWN = 14 * DAY;
const STEP = 150;

export interface Proposal {
  id: string;
  kind: 'calories';
  delta: number;
  from: number;
  to: number;
  title: string;
  body: string;
  createdAt: number;
  status: 'open' | 'yes' | 'no';
  answeredAt?: number;
}

export async function loadProposal(): Promise<Proposal | null> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null');
  } catch {
    return null;
  }
}
const save = (p: Proposal) => AsyncStorage.setItem(KEY, JSON.stringify(p));

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Weekly averages, newest first, of the last three weeks; a week with fewer than 3 weigh-ins is null */
export function weeklyAverages(points: { date: Date; kg: number }[], now: number): (number | null)[] {
  return [0, 1, 2].map((w) => {
    const xs = points.filter((p) => now - p.date.getTime() >= w * 7 * DAY && now - p.date.getTime() < (w + 1) * 7 * DAY).map((p) => p.kg);
    return xs.length >= 3 ? avg(xs) : null;
  });
}

/** What the numbers call for, if anything: a pure decision, so it can be tested */
export function decide(goal: string, weeks: (number | null)[], adherent: boolean): { delta: number; why: string } | null {
  const [w0, w1, w2] = weeks;
  if (w0 == null || w1 == null || w2 == null) return null;
  const spread = Math.max(w0, w1, w2) - Math.min(w0, w1, w2);
  const list = [w2, w1, w0].map((x) => x.toFixed(1)).join(', ');
  if (goal === 'lose' || goal === 'recomp') {
    if (w2 - w0 > 2.4) return { delta: STEP, why: `ירדת ${(w2 - w0).toFixed(1)} ק"ג בשבועיים (${list}). זה יותר מ 1.2 בשבוע, ובקצב כזה הולך גם שריר.` };
    if (goal === 'lose' && adherent && spread <= 0.4 && w0 >= w2 - 0.2)
      return { delta: -STEP, why: `שלושה שבועות המשקל עומד (${list}), והקלוריות והאימונים היו ביעד. כנראה שהגוף התרגל.` };
  }
  if (goal === 'gain' && adherent && spread <= 0.3 && w0 <= w2 + 0.1)
    return { delta: STEP, why: `שלושה שבועות המשקל לא עולה (${list}), והאוכל והאימונים היו ביעד. צריך קצת יותר.` };
  return null;
}

/** Looks once in a while; returns the open proposal, a new one, or null */
export async function checkProposal(now = Date.now()): Promise<Proposal | null> {
  const cur = await loadProposal();
  if (cur?.status === 'open') return cur;
  if (cur?.answeredAt && now - cur.answeredAt < COOLDOWN) return null;
  const profile = await loadProfile();
  if (!profile.completed || !profile.heightCm) return null;
  const goal = safeGoal(profile);
  const weights = await readWeights(28).catch(() => [] as { date: Date; kg: number }[]);
  const { targets } = await context();
  // Adherence over the last two weeks: calories and workouts on target in each
  const weeks = await Promise.all([collectDays(now - 7 * DAY, now), collectDays(now - 14 * DAY, now - 7 * DAY - 1)]);
  const adherent = weeks.every((days) => {
    const m = metrics(days, [], targets, 'week');
    const ok = (k: string) => ['good', 'ok'].includes(m.list.find((x) => x.key === k)?.status ?? '');
    return m.logged >= 4 && ok('kcal') && ok('workouts');
  });
  const d = decide(goal, weeklyAverages(weights, now), adherent);
  if (!d) return null;
  const from = derive(profile).goals.calories;
  const to = derive({ ...profile, calorieAdjust: (profile.calorieAdjust ?? 0) + d.delta }).goals.calories;
  // At the floor already: nothing to take off
  if (to === from) return null;
  const p: Proposal = {
    id: `cal${new Date(now).toISOString().slice(0, 10)}`,
    kind: 'calories',
    delta: to - from,
    from,
    to,
    title: to < from ? `להוריד ${fmt(from - to)} קלוריות ביום?` : `להוסיף ${fmt(to - from)} קלוריות ביום?`,
    body: `${d.why} היעד ישתנה מ ${fmt(from)} ל ${fmt(to)}. בעוד שבועיים נבדוק מה קרה.`,
    createdAt: now,
    status: 'open',
  };
  await save(p);
  return p;
}

/** His answer. Yes changes the plan at once; either way, two weeks before the next proposal */
export async function answerProposal(yes: boolean, now = Date.now()): Promise<string> {
  const p = await loadProposal();
  if (!p || p.status !== 'open') return '';
  let reply = 'בסדר. נמשיך כמו עכשיו ונבדוק שוב בעוד שבועיים.';
  if (yes) {
    const profile = await loadProfile();
    const next = { ...profile, calorieAdjust: (profile.calorieAdjust ?? 0) + p.delta };
    await saveProfile(next);
    applyDerived(derive(next));
    reply = `סגור. מהיום היעד ${fmt(p.to)} קלוריות. בעוד שבועיים נבדוק אם המשקל זז.`;
  }
  await save({ ...p, status: yes ? 'yes' : 'no', answeredAt: now });
  await noteChange(yes ? `כן, ${p.to < p.from ? 'להוריד' : 'להוסיף'} קלוריות` : 'לא עכשיו', reply);
  return reply;
}
