// Runs from Health Connect into the local store: distance from the run's own app, heart rate
// during it, and the GPS track when Android lets us read it.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { aggregateRecord, readRecords, requestExerciseRoute } from 'react-native-health-connect';
import { HrBounds, hrBounds, HrPt, nextTarget, Run, RoutePt, thin, trackKm } from './analyze';
import { loadRunPrefs, loadRuns, saveRuns, updateRun } from './store';

import { t as tr } from '../i18n';
export const RUN_TYPES = [56, 57];
// Never a run, whatever the pace: walking, hiking, cycling, swimming, wheelchair
const NOT_RUN = [79, 37, 8, 9, 73, 74, 82];
const SKIPS = 'run.skips.v1';
const TYPE_NAME: Record<number, string> = { 0: tr('אימון אחר', 'Other workout'), 56: tr('ריצה', 'Run'), 57: tr('הליכון', 'Treadmill'), 79: tr('הליכה', 'Walk'), 37: tr('טיול רגלי', 'Hike'), 8: tr('אופניים', 'Cycling'), 9: tr('אופני כושר', 'Exercise bike'), 25: tr('אליפטיקל', 'Elliptical'), 35: tr('אינטרוולים', 'Intervals'), 36: 'HIIT' };
export const typeName = (t?: number) => (t == null ? tr('לא ידוע', 'Unknown') : TYPE_NAME[t] ?? tr(`סוג ${t}`, `type ${t}`));

/** A session that did not become a run, and why: shown under the run card so a missing run explains itself */
export interface RunSkip {
  id: string;
  start: number;
  type?: number;
  km: number;
  why: 'no_distance' | 'not_run_pace';
}
export async function loadRunSkips(): Promise<RunSkip[]> {
  return safe(async () => JSON.parse((await AsyncStorage.getItem(SKIPS)) ?? '[]'), [] as RunSkip[]);
}
const DAY = 86400000;
const REST = 'runRestHr.v1';

const win = (s: string | number, e: string | number) => ({
  timeRangeFilter: { operator: 'between' as const, startTime: new Date(s).toISOString(), endTime: new Date(e).toISOString() },
});
const safe = async <X,>(fn: () => Promise<X>, fb: X): Promise<X> => {
  try {
    return await fn();
  } catch {
    return fb;
  }
};

const toRoute = (pts: any[]): RoutePt[] => thin(pts.map((p) => ({ t: new Date(p.time).getTime(), lat: p.latitude, lon: p.longitude })), 500);

/** Resting heart rate: the low end of his heart rate between 1 and 5 at night, last week. Cached a day. */
export async function restingHr(now = Date.now()): Promise<number | undefined> {
  const cached = await safe(async () => JSON.parse((await AsyncStorage.getItem(REST)) ?? 'null'), null as any);
  if (cached && now - cached.at < DAY) return cached.bpm;
  const res: any = await safe(() => readRecords('RestingHeartRate', win(now - 7 * DAY, now)) as Promise<any>, null);
  let bpm: number | undefined;
  const direct = (res?.records ?? []).map((r: any) => r.beatsPerMinute).filter((b: number) => b > 30);
  if (direct.length) bpm = Math.round(direct.reduce((a: number, b: number) => a + b, 0) / direct.length);
  else {
    const all: number[] = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(now - i * DAY);
      d.setHours(1, 0, 0, 0);
      const hr: any = await safe(() => readRecords('HeartRate', win(d.getTime(), d.getTime() + 4 * 3600000)) as Promise<any>, null);
      for (const r of hr?.records ?? []) for (const s of r.samples ?? []) if (s.beatsPerMinute > 30) all.push(s.beatsPerMinute);
    }
    if (all.length >= 50) {
      all.sort((a, b) => a - b);
      bpm = all[Math.floor(all.length * 0.05)];
    }
  }
  if (bpm) await AsyncStorage.setItem(REST, JSON.stringify({ at: now, bpm })).catch(() => undefined);
  return bpm;
}

export async function bounds(age: number, runs: Run[]): Promise<HrBounds> {
  return hrBounds(age, await restingHr(), runs);
}

async function readOne(r: any): Promise<Run> {
  const [dist, hr, steps, kcal]: any[] = await Promise.all([
    safe(() => readRecords('Distance', win(r.startTime, r.endTime)) as Promise<any>, null),
    safe(() => readRecords('HeartRate', win(r.startTime, r.endTime)) as Promise<any>, null),
    safe(() => aggregateRecord({ recordType: 'Steps', ...win(r.startTime, r.endTime) } as any) as Promise<any>, null),
    safe(() => aggregateRecord({ recordType: 'ActiveCaloriesBurned', ...win(r.startTime, r.endTime) } as any) as Promise<any>, null),
  ]);
  const s0 = new Date(r.startTime).getTime();
  const s1 = new Date(r.endTime).getTime();
  const origin = r.metadata?.dataOrigin;
  const dRecs: any[] = dist?.records ?? [];
  const own = dRecs.filter((d) => d.metadata?.dataOrigin === origin);
  const meters = (own.length ? own : dRecs).reduce((a: number, d: any) => a + (d.distance?.inMeters ?? 0), 0);
  const hRecs: any[] = hr?.records ?? [];
  const hOwn = hRecs.filter((h) => h.metadata?.dataOrigin === origin);
  const samples: HrPt[] = (hOwn.length ? hOwn : hRecs)
    .flatMap((h: any) => (h.samples ?? []).map((x: any) => ({ t: new Date(x.time).getTime(), bpm: x.beatsPerMinute })))
    .filter((x: HrPt) => x.t >= s0 && x.t <= s1 && x.bpm > 30)
    .sort((a: HrPt, b: HrPt) => a.t - b.t);
  // About one sample every 5 seconds is plenty
  const hrThin: HrPt[] = [];
  for (const x of samples) if (!hrThin.length || x.t - hrThin[hrThin.length - 1].t >= 5000) hrThin.push(x);
  const type = r.exerciseRoute?.type;
  const pts: any[] = r.exerciseRoute?.route ?? [];
  const route = pts.length > 1 ? toRoute(pts) : undefined;
  let km = meters / 1000;
  if (!km && route) km = trackKm(route);
  return {
    id: r.metadata?.id,
    start: s0,
    end: s1,
    km,
    source: origin,
    treadmill: r.exerciseType === 57,
    steps: Math.round(steps?.COUNT_TOTAL ?? 0) || undefined,
    kcal: Math.round(kcal?.ACTIVE_CALORIES_TOTAL?.inKilocalories ?? 0) || undefined,
    hr: hrThin,
    route,
    routeState: route ? 'DATA' : type === 'CONSENT_REQUIRED' || type === 2 ? 'CONSENT' : r.exerciseType === 57 ? 'NO_DATA' : type === 'NO_DATA' || type === 1 ? 'NO_DATA' : undefined,
  };
}

/** New runs of the last 30 days into the store; runs waiting for a route get another try. Returns all runs. */
export async function syncRuns(age: number, now = Date.now()): Promise<Run[]> {
  const res: any = await readRecords('ExerciseSession', win(now - 30 * DAY, now));
  // Running types, and any session that is not plainly something else: a run the watch filed as
  // "other workout" or intervals still counts when its distance and pace are a run's
  const sessions: any[] = (res?.records ?? []).filter(
    (r: any) => RUN_TYPES.includes(r.exerciseType) || (!NOT_RUN.includes(r.exerciseType) && new Date(r.endTime).getTime() - new Date(r.startTime).getTime() >= 8 * 60000),
  );
  const skips: RunSkip[] = [];
  let runs = await loadRuns();
  const prefs = await loadRunPrefs();
  const known = new Map(runs.map((r) => [r.id, r]));
  for (const s of sessions.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())) {
    const id = s.metadata?.id;
    const old = known.get(id);
    if (old && (old.route || old.routeState === 'NO_DATA') && old.steps !== undefined) continue;
    // A run the watch is still syncing has no distance yet; wait for it
    if (!old && now - new Date(s.endTime).getTime() < 5 * 60000) continue;
    const fresh = await readOne(s);
    const isRunType = RUN_TYPES.includes(s.exerciseType);
    if (!isRunType) {
      // Not filed as a run: only a run's distance and pace make it one (3:00 to 9:30 a km, a km or more)
      const pace = fresh.km > 0 ? (fresh.end - fresh.start) / 60000 / fresh.km : 0;
      if (fresh.km < 1 || pace < 3 || pace > 9.5) {
        if (fresh.km >= 0.3 && now - fresh.start < 3 * DAY) skips.push({ id, start: fresh.start, type: s.exerciseType, km: fresh.km, why: 'not_run_pace' });
        continue;
      }
    }
    if (fresh.km < 0.3) {
      // A run with no distance yet: the watch app may still be sending it
      if (isRunType && now - fresh.start < 3 * DAY) skips.push({ id, start: fresh.start, type: s.exerciseType, km: fresh.km, why: 'no_distance' });
      continue;
    }
    if (old) {
      runs = runs.map((r) =>
        r.id === id ? { ...r, route: r.route ?? fresh.route, routeState: r.route ? r.routeState : fresh.routeState ?? r.routeState, steps: fresh.steps ?? 0, kcal: fresh.kcal } : r,
      );
    } else {
      // The target the coach would have given right before this run
      const before = runs.filter((r) => r.start < fresh.start);
      fresh.plannedKm = before.some((r) => fresh.start - r.start < 28 * DAY) ? nextTarget(before, prefs, await bounds(age, before), fresh.start).km : undefined;
      runs.push(fresh);
    }
  }
  await saveRuns(runs);
  await AsyncStorage.setItem(SKIPS, JSON.stringify(skips)).catch(() => undefined);
  return loadRuns();
}

/** Asks Android for one run's track (a system dialog), and keeps it. */
export async function askRoute(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const pts: any[] = (await Promise.race([
      requestExerciseRoute(id),
      new Promise((_, no) => setTimeout(() => no(new Error(tr('אין תשובה מ Android', 'No answer from Android'))), 60000)),
    ])) as any;
    if (!pts?.length) {
      await updateRun(id, { routeState: 'NO_DATA' });
      return { error: tr('המסלול ריק', 'The route is empty') };
    }
    await updateRun(id, { route: toRoute(pts), routeState: 'DATA' });
    return { ok: true };
  } catch (e: any) {
    return { error: String(e?.message ?? e).slice(0, 120) };
  }
}
