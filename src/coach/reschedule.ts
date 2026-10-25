// Moving, shortening or skipping one workout this week. Pure.
import { DAY_NAMES, pad2, PlannedWorkout, planThisWeek, SHORT_SESSION_ID, WeekOverrides, weekStartKey, isWeekend, WEEKLY_PLAN } from '../config/goals';

export interface Suggestion {
  day: number;
  time: number;
  label: string;
  why: string;
}

const mins = (d: Date) => d.getHours() * 60 + d.getMinutes();

/**
 * Up to three days this week to move a workout to: free days, not next to another
 * strength session if possible, and days without the kids first.
 */
export function suggestDays(
  now: Date,
  plan: PlannedWorkout[],
  moving: PlannedWorkout,
  opts: { usualTime: number; kidsDays?: number[] },
): Suggestion[] {
  const today = now.getDay();
  const others = plan.filter((w) => !(w.day === moving.day && w.session === moving.session));
  const out: (Suggestion & { score: number })[] = [];
  for (let d = today; d <= 6; d++) {
    if (d === moving.day) continue;
    if (others.some((w) => w.day === d)) continue;
    // On the weekend, the morning
    let time = opts.usualTime;
    if (isWeekend(d) && time >= 16 * 60) time = 8 * 60;
    if (d === today && mins(now) > time - 60) continue; // too late for today
    const gap = others.length ? Math.min(...others.map((w) => Math.abs(w.day - d))) : 7;
    const kids = opts.kidsDays?.includes(d) ?? false;
    const score = (gap >= 2 ? 0 : 10) + (kids ? 5 : 0) + (d - today);
    const why = [gap >= 2 ? 'יום מנוחה לפני ואחרי' : 'צמוד לאימון אחר, פחות התאוששות', kids ? 'הילדים אצלך' : '']
      .filter(Boolean)
      .join(', ');
    const when = d === today ? 'היום' : d === today + 1 ? 'מחר' : `יום ${DAY_NAMES[d]}`;
    out.push({ day: d, time, label: `${when} ב${pad2(Math.floor(time / 60))}:${pad2(time % 60)}`, why, score });
  }
  return out.sort((a, b) => a.score - b.score).slice(0, 3).map(({ score, ...s }) => s);
}

/** The day the workout was originally planned on. */
const origin = (w: PlannedWorkout) => w.origDay ?? w.day;

const fresh = (ov: WeekOverrides, now: Date): WeekOverrides =>
  ov.week === weekStartKey(now) ? { ...ov, moves: [...ov.moves], skips: [...ov.skips], shorts: [...ov.shorts], sessionAt: { ...(ov.sessionAt ?? {}) } } : { week: weekStartKey(now), moves: [], skips: [], shorts: [] };

export function moveWorkout(ov: WeekOverrides, now: Date, w: PlannedWorkout, toDay: number, time: number): WeekOverrides {
  const o = fresh(ov, now);
  const from = origin(w);
  const prev = o.moves.find((m) => m.fromDay === from && m.session === w.session);
  o.moves = o.moves.filter((m) => m !== prev);
  o.moves.push({ fromDay: from, toDay, time, session: w.session, count: (prev?.count ?? 0) + 1 });
  o.shorts = o.shorts.filter((d) => d !== from);
  o.skips = o.skips.filter((d) => d !== from);
  return keepOrder(o, now);
}

export function shortenWorkout(ov: WeekOverrides, now: Date, w: PlannedWorkout): WeekOverrides {
  const o = fresh(ov, now);
  const from = origin(w);
  o.moves = o.moves.filter((m) => m.fromDay !== from);
  if (!o.shorts.includes(from)) o.shorts.push(from);
  return o;
}

export function skipWorkout(ov: WeekOverrides, now: Date, w: PlannedWorkout): WeekOverrides {
  const o = fresh(ov, now);
  const from = origin(w);
  o.moves = o.moves.filter((m) => m.fromDay !== from);
  o.shorts = o.shorts.filter((d) => d !== from);
  if (!o.skips.includes(from)) o.skips.push(from);
  return o;
}

/** Same day, another hour: not counted as a move, it is the same workout a little earlier or later */
export function retimeWorkout(ov: WeekOverrides, now: Date, w: PlannedWorkout, time: number): WeekOverrides {
  const from = origin(w);
  const before = fresh(ov, now).moves.find((m) => m.fromDay === from && m.session === w.session);
  const o = moveWorkout(ov, now, w, w.day, time);
  const m = o.moves.find((x) => x.fromDay === from && x.session === w.session);
  if (m) m.count = before?.count ?? 0;
  return o;
}

/** How many workouts were moved this week, and how many times this one moved. */
export function moveStats(ov: WeekOverrides, now: Date, w: PlannedWorkout): { week: number; thisOne: number } {
  if (ov.week !== weekStartKey(now)) return { week: 0, thisOne: 0 };
  const m = ov.moves.find((x) => x.fromDay === origin(w) && x.session === w.session);
  return { week: ov.moves.length + ov.skips.length, thisOne: m?.count ?? 0 };
}

const realSessions = (plan: PlannedWorkout[], now: Date) => plan.filter((w) => w.day >= now.getDay() && w.session !== SHORT_SESSION_ID && !w.short);

/**
 * The missed session comes next: from today on, the sessions keep the program's order,
 * so a Wednesday workout moved past Thursday's is trained on Thursday, and Thursday's after it.
 */
export function keepOrder(ov: WeekOverrides, now: Date, base: PlannedWorkout[] = WEEKLY_PLAN): WeekOverrides {
  const o = fresh(ov, now);
  o.sessionAt = {};
  const slots = realSessions(planThisWeek(now, base, o), now);
  const byOrigin = [...slots].sort((a, b) => origin(a) - origin(b) || a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  slots.forEach((slot, i) => {
    const s = byOrigin[i]!.session;
    if (s !== slot.session) o.sessionAt![slot.day] = s;
  });
  return o;
}

/** His own choice: this workout and the next one trade places */
export function swapWithNext(ov: WeekOverrides, now: Date, w: PlannedWorkout, base: PlannedWorkout[] = WEEKLY_PLAN): WeekOverrides | null {
  const o = fresh(ov, now);
  const plan = realSessions(planThisWeek(now, base, o), now);
  const i = plan.findIndex((x) => x.day === w.day && x.session === w.session);
  const next = i >= 0 ? plan[i + 1] : undefined;
  if (!next) return null;
  o.sessionAt = { ...(o.sessionAt ?? {}), [w.day]: next.session, [next.day]: w.session };
  return o;
}

/** "Thursday B, Friday C": the order from today on, for showing before saving */
export function orderText(ov: WeekOverrides, now: Date, sessionName: (id: string) => string, base: PlannedWorkout[] = WEEKLY_PLAN): string {
  return realSessions(planThisWeek(now, base, ov), now)
    .map((w) => `${w.day === now.getDay() ? 'היום' : DAY_NAMES[w.day]}: ${sessionName(w.session)}`)
    .join(' · ');
}
