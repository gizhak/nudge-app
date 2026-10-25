import { loadWaist } from '../progress/waist';
import { safeGoal } from '../profile/safety';
// Makes the reports that are due. Called when the progress tab loads and from the coach's
// background run, so a report is ready even if the app was not opened at report time.
import { caloriesFor, GOALS } from '../config/goals';
import { loadPrefs } from '../coach/store';
import { derive } from '../profile/derive';
import { loadProfile } from '../profile/profile';
import { loadCheckpoints } from '../progress/store';
import { collectBody, collectDays } from './collect';
import { buildReport, DAY, lastWeeklyDue, monthPeriod, ReportKind, Targets, weekPeriod } from './compute';
import { loadReportPrefs, loadReports, saveReport } from './store';

let running: Promise<number> | null = null;

async function context() {
  const profile = await loadProfile();
  const usable = profile.completed && profile.heightCm > 0 && profile.weightKg > 0;
  const d = usable ? derive(profile) : null;
  const targets: Targets = d ? { ...d.goals } : { ...GOALS };
  // A flexible weekend: each weekday has its own calorie target
  if (d && d.weekendStyle === 'flex') {
    const sunday = new Date(2026, 0, 4);
    targets.dayCalories = Array.from({ length: 7 }, (_, i) => caloriesFor(new Date(sunday.getTime() + i * DAY), targets.calories, d.weekend, 'flex'));
  }
  return { profile, targets };
}

async function make(kind: ReportKind, start: number, end: number, noNewMeasure?: boolean) {
  const { profile, targets } = await context();
  const len = end - start;
  const [days, prevDays, body, cps] = await Promise.all([
    collectDays(start, end),
    collectDays(start - len, start),
    // Room before the previous period for the weekly trend line
    collectBody(start - len - 7 * DAY, end),
    loadCheckpoints().catch(() => []),
  ]);
  const report = buildReport({
    kind,
    start,
    end,
    goal: safeGoal(profile),
    targetWeightKg: profile.targetWeightKg,
    heightCm: profile.heightCm || undefined,
    sex: profile.sex,
    targets,
    days,
    prevDays,
    body,
    // Only measurements taken by the end of the period
    measures: [
      ...cps.filter((c) => startOfDayMs(c.at) <= end).map((c) => ({ at: c.at, waistCm: c.waistCm, neckCm: c.neckCm, chestCm: c.chestCm, armCm: c.armCm, thighCm: c.thighCm, weightAvg: c.weightAvg })),
      // The weekly waist between checkpoints
      ...(await loadWaist().catch(() => [])).filter((w) => startOfDayMs(w.at) <= end).map((w) => ({ at: w.at, waistCm: w.cm })),
    ],
    noNewMeasure,
    weekend: derive(profile).weekend,
    vacation: (await loadPrefs().catch(() => null))?.vacation ?? null,
  });
  await saveReport(report);
}

const startOfDayMs = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Returns how many reports were made now. Safe to call often: it only reads storage when nothing is due. */
export function ensureReports(now = Date.now()): Promise<number> {
  if (!running) {
    running = (async () => {
      let made = 0;
      const prefs = await loadReportPrefs();
      const have = await loadReports();
      if (prefs.weekly) {
        const { start, end } = weekPeriod(lastWeeklyDue(now, prefs.weekDay, prefs.hour));
        if (!have.some((r) => r.kind === 'week' && r.start === start)) {
          await make('week', start, end);
          made++;
        }
      }
      if (prefs.monthly) {
        const cps = await loadCheckpoints().catch(() => []);
        const p = monthPeriod(
          cps.map((c) => c.at),
          now,
        );
        const old = p && have.find((r) => r.kind === 'month' && r.start === p.start);
        // A report made without a measurement is redone once the checkpoint arrives
        if (p && (!old || (old.end !== p.end && !p.noNewMeasure))) {
          await make('month', p.start, p.end, p.noNewMeasure);
          made++;
        }
      }
      return made;
    })().finally(() => {
      running = null;
    });
  }
  return running;
}
