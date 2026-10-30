import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyReminders } from '../notifications/schedule';
import { ensureReports } from '../report/run';
import { runMessage } from '../run/coach';
import { cravingMessage } from '../nutrition/cravingCoach';
import { weightNews } from '../report/weightWhy';
import { readRecords } from 'react-native-health-connect';
import { activeLearned, learn, noteBeat, noteSent } from '../learn/store';
import { adjustPriority } from '../learn/compute';
import { loadSettings } from '../notifications/settings';
import { loadAndApply } from '../profile/bootstrap';
import { applyTone, importanceOf, baseId, CoachMessage, combineMeals, evaluate, isQuietTime, select } from './rules';
import { checklist } from './checklist';
import { activityApp, foodApp, hasWatch } from '../setup/devices';
import { CHANNELS } from '../notifications/schedule';
import { caloriesFor, GOALS, nextWorkout, planThisWeek, sessionOf } from '../config/goals';
import { weeklyMessages } from './weekly';
import { loadKey, loadLoads } from '../train/loads';
import { sleepMessages } from '../sleep/ask';
import { readHourFacts } from './dayFacts';
import { loadGuess, loadPrints, wifiPlaceNow } from './wifi';
import { checkIn, moodOf, summarizeDay } from './daySummary';
import { Harsh, Mood, seedOf, voice } from './voice';
import { waterText } from '../nutrition/water';
import { readSituation } from './situation';
import { categoryFor } from './category';
import { isDriving } from './car';
import { isDue } from '../progress/journey';
import { loadCheckpoints } from '../progress/store';
import { daysSinceWaist, loadWaist } from '../progress/waist';
import { followKey, FollowUp } from './followup';
import { syncDoneFromData } from './followupStore';
import { factsFrom } from './facts';
import { countLongVisit, countOnExit, logGym, resetOldGymDays } from './gymDays';
import { slotOf } from '../nutrition/meals';
import { waterExpectedByNow } from '../nutrition/water';
import { loadNightState, loadPlaces, loadSnoozes, loadUnlogged, nightKey } from './store';
import { interruptLabels } from '../profile/profile';
import { appendLog, claimRun, dayKey, loadLog, loggedIds, releaseRun, loadPlaceState, loadPrefs, PlaceId, savePlaceState } from './store';

import { t as tr } from '../i18n';
export const COACH_CHANNEL = 'coach';
export const NIGHT_CATEGORY = 'night';
export { categoryFor } from './category';

/**
 * One coach cycle: read the situation, decide, notify. Runs from the background
 * task, from geofence events, and from the "run now" button.
 */
export interface RunOptions {
  /** He is looking at the phone right now (app opened) */
  active?: boolean;
  /** "Run now" button: repeat what is still open, and always answer something */
  manual?: boolean;
  /** Woken by the phone being unlocked in the morning */
  unlock?: boolean;
}

export async function runCoach(
  event?: { type: 'enter' | 'exit'; place: PlaceId; via?: string },
  now = new Date(),
  opts: RunOptions = {},
): Promise<CoachMessage[]> {
  // Two runs at once send everything twice. A manual run waits its turn instead of skipping.
  if (!(await claimRun())) {
    if (!opts.manual && !opts.unlock) return [];
    await new Promise((r) => setTimeout(r, 4000));
    // An unlock waits for the run in progress, which may already have said it
    if (opts.unlock) {
      if (!(await claimRun())) return [];
    } else await claimRun(Date.now(), true);
  }
  try {
    return await runOnce(event, now, opts);
  } catch (e: any) {
    // A failure here means no message at all; keep it where the "learned" screen shows it
    await AsyncStorage.setItem(
      'coach.lastError.v1',
      JSON.stringify({ at: Date.now(), msg: String(e?.message ?? e), where: String(e?.stack ?? '').split('\n').slice(0, 4).join(' | ') }),
    ).catch(() => undefined);
    return [];
  } finally {
    await releaseRun();
  }
}

async function runOnce(
  event: { type: 'enter' | 'exit'; place: PlaceId; via?: string } | undefined,
  now: Date,
  opts: RunOptions,
): Promise<CoachMessage[]> {
  const { profile } = await loadAndApply();
  await refreshRemindersDaily(now);
  // Reports due since the last run, made quietly; the scheduled notification announces them
  await ensureReports(now.getTime()).catch(() => 0);
  runHow = opts.manual ? 'manual' : opts.unlock ? 'unlock' : event ? 'place' : 'bg';
  await noteBeat(runHow, now.getTime());
  // What was learned about him: his real wake time, and which messages move him
  await learn(now.getTime()).catch(() => null);
  const learned = await activeLearned().catch(() => ({ at: 0, facts: [], effects: [] }));
  const wake = learned.facts.find((f) => f.key === 'wake_time' && f.confidence >= 0.4);
  const basePrefs = await loadPrefs();
  const prefs = wake ? { ...basePrefs, wakeTime: wake.value } : basePrefs;
  const effectOf = new Map(learned.effects.map((e) => [e.topic, e]));
  const today = dayKey(now);

  const state = await loadPlaceState();
  let placeChanged = await resetOldGymDays(state);
  if (event) {
    if (event.type === 'enter') {
      // Arriving at the gym is not yet a workout: the day counts after a real stay
      if (event.place === 'gym' && state.place !== 'gym') await logGym({ at: now.getTime(), kind: 'enter', via: event.via });
      if (state.place !== event.place) state.since = now.getTime();
      state.place = event.place;
      state.via = event.via;
      if (event.place === 'gym') state.gymDay = today;
    } else if (state.place === event.place) {
      if (event.place === 'gym') await countOnExit(state, now.getTime(), event.via);
      state.place = null;
      state.via = undefined;
      state.since = now.getTime();
    }
    placeChanged = true;
  }
  if (await countLongVisit(state, now.getTime())) placeChanged = true;
  if (placeChanged) await savePlaceState(state);
  if (!prefs.enabled) return [];
  // Driving: nothing now. The run when the car disconnects says what is still relevant.
  // The car looks connected, but on a place's Wi-Fi he is not driving (a missed disconnect)
  if (!opts.manual && isDriving(now.getTime(), state.place ? state.since : undefined) && !(await wifiPlaceNow().catch(() => null))) {
    await noteRun(now, { why: 'driving' });
    return [];
  }

  // Health data is best effort: a failed read must not stop location based messages
  const sit = await readSituation(now, profile.weightKg);
  const data = sit.today;
  const mealList = sit.meals;
  const night = await loadNightState();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastMealAt = mealList.length ? mealList[mealList.length - 1].time : null;

  const candidates = evaluate({
    now,
    place: state.place,
    event,
    // At the gym now, or stayed there long enough today: an arrival alone is not a workout
    gymToday: state.place === 'gym' || (state.gymDays ?? []).includes(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()),
    canDetect: hasWatch(profile.watch) || !!(await loadPlaces().catch(() => ({} as Record<string, unknown>)))['gym'] || !!(await loadPrints().catch(() => ({} as Record<string, unknown>)))['gym'],
    meals: data?.nutrition.meals ?? 0,
    lastMealAt,
    kcal: data?.nutrition.kcal ?? 0,
    protein: data?.nutrition.protein ?? 0,
    steps: data?.steps ?? 0,
    sleepMinutes: data?.sleepMinutes ?? null,
    workoutLogged: sit.workedOutToday || (data?.workouts.count ?? 0) > 0,
    prefs,
    mealList,
    unloggedSlots: await loadUnlogged(now),
    checkpointDue: isDue(await loadCheckpoints(), now.getTime()),
    waistDaysAgo: daysSinceWaist(await loadWaist().catch(() => []), await loadCheckpoints().catch(() => []), now.getTime()),
    vegetarian: profile.diet.includes('vegetarian'),
    hcOk: sit.hcOk,
    weighedToday: sit.hcOk ? sit.weighedToday : undefined,
    daysSinceWeigh: sit.daysSinceWeigh,
    workoutDaysThisWeek: sit.workoutDaysThisWeek,
    daysSinceWorkout: sit.daysSinceWorkout,
    lastStepsAt: sit.hcOk ? sit.lastStepsAt : undefined,
    waterMl: sit.waterMl,
    waterTarget: sit.waterTarget,
    active: opts.active || opts.manual || opts.unlock,
    unlocked: opts.unlock,
    recentSteps: sit.recentSteps,
    nightAcked: night.acks.includes(nightKey(now)),
    brokenNight: night.babyNights.includes(dayKey(yesterday)),
    brokenNightLabel: interruptLabels(profile.kids).night,
    whyNow: profile.whyNow,
    stopReason: profile.stopReason,
    kidsToday: profile.relationship === 'separated' ? !!profile.kidsDays?.includes(now.getDay()) : false,
    hardTimes: profile.hardTimes,
    chronicCare: !!profile.chronic?.length,
    activityAppName: activityApp(profile.watch)?.name ?? null,
    foodAppName: profile.foodApp === 'other' ? null : foodApp(profile.foodApp)?.name ?? null,
    hasWatch: profile.watch === undefined ? undefined : hasWatch(profile.watch),
    outingPlan: night.outings?.includes(nightKey(now)) ? night.outingPlans?.[nightKey(now)] ?? { leaveAt: 20 * 60, returnAt: (prefs.bedTime + 120) % 1440, kind: 'other' } : undefined,
    outingLastNight: !!night.outings?.includes(dayKey(yesterday)),
  })
    .filter((m) => data || !/^(meal|protein|evening|short_sleep|steps)/.test(m.id)) // never judge food or sleep without data
    .map((m) => ({ ...m, priority: adjustPriority(m.priority, effectOf.get(baseId(m.id)), now.getTime()) as typeof m.priority }));

  // Right after the morning weigh-in: which way it went, against yesterday and the week
  if (sit.hcOk && sit.weighedToday) {
    const news = await (async () => {
      const r: any = await readRecords('Weight', {
        timeRangeFilter: { operator: 'between', startTime: new Date(now.getTime() - 10 * 86400000).toISOString(), endTime: now.toISOString() },
      });
      return weightNews(
        (r.records ?? []).map((x: any) => ({ time: new Date(x.time).getTime(), kg: x.weight?.inKilograms, source: x.metadata?.dataOrigin })).filter((p: any) => p.kg > 0),
        now.getTime(),
      );
    })().catch(() => null);
    if (news) candidates.push({ id: 'weight_news', priority: 2, title: news.title, body: news.body });
  }

  let mood: Mood = 'mixed';
  // The coach's own read of the day: a workout just done, check-ins at midday and late afternoon, the day's summary before bed
  if (data && sit.hcOk) try {
    const hf = await readHourFacts(now).catch(() => null);
    if (hf) {
      const m = now.getHours() * 60 + now.getMinutes();
      const plan = planThisWeek(now).find((p) => p.day === now.getDay());
      const lastDone = [...hf.workouts].reverse().find((w) => !w.run && w.minutes >= 10);
      if (lastDone && now.getTime() - lastDone.end < 3 * 3600000 && now.getTime() >= lastDone.end) {
        const planned = plan ? sessionOf(plan.session).minutes : null;
        const vsPlan = planned == null ? '' : lastDone.minutes >= planned + 10 ? tr(` ארוך מהתוכנית ב ${lastDone.minutes - planned} דקות.`, ` ${lastDone.minutes - planned} minutes longer than planned.`) : lastDone.minutes <= planned - 10 ? tr(` קצר מהתוכנית ב ${planned - lastDone.minutes} דקות, בפעם הבאה עד הסוף.`, ` ${planned - lastDone.minutes} minutes shorter than planned, next time all the way.`) : tr(' בדיוק לפי התוכנית.', ' Exactly as planned.');
        const vsPrev = hf.prevWorkout ? (lastDone.minutes > hf.prevWorkout.minutes + 5 ? tr(` ${lastDone.minutes - hf.prevWorkout.minutes} דקות יותר מהאימון הקודם.`, ` ${lastDone.minutes - hf.prevWorkout.minutes} minutes more than the last workout.`) : '') : '';
        candidates.push({
          id: `workout_done@${lastDone.start}`,
          priority: 2,
          title: plan ? tr('אימון בפנים', 'Workout in') : tr('אימון בונוס', 'Bonus workout'),
          body: tr(`${lastDone.minutes} דקות.${vsPlan}${vsPrev} עכשיו ארוחה עם 30 גרם חלבון בתוך שעתיים, והרבה מים.`, `${lastDone.minutes} minutes.${vsPlan}${vsPrev} Now a meal with 30 grams of protein within two hours, and plenty of water.`),
        });
        // How the weights felt, for the moves he set a weight for: his answers move the weights over time
        if (plan) {
          const loads = await loadLoads().catch(() => ({}) as Record<string, unknown>);
          if (sessionOf(plan.session).exercises.some((e) => loads[loadKey(e.name)]))
            candidates.push({
              id: `workout_feel@${lastDone.start}:${plan.session}`,
              priority: 1,
              title: tr('איך היו המשקלים?', 'How were the weights?'),
              body: tr('לכל תרגיל: קל, בדיוק או קשה. פעמיים ברצף אותה תשובה, ואציע לשנות את המשקל.', 'For each exercise: easy, right or hard. The same answer twice in a row, and I will suggest changing the weight.'),
            });
        }
      }
      const facts = {
        now,
        wake: prefs.wakeTime,
        bed: prefs.bedTime < prefs.wakeTime ? prefs.bedTime + 1440 : prefs.bedTime,
        weighed: !!sit.weighedToday,
        stepsByHour: hf.stepsByHour,
        stepsGoal: GOALS.steps,
        waterByHour: hf.waterByHour,
        waterTarget: sit.waterTarget,
        meals: mealList.map((x) => ({ time: x.time, kcal: x.kcal, protein: x.protein })),
        kcalTarget: caloriesFor(now),
        proteinGoal: GOALS.proteinG,
        plannedToday: !!plan,
        trainedToday: sit.workedOutToday || hf.workouts.length > 0,
        waterText: (ml: number) => waterText(ml, prefs.waterContainer),
      };
      const bed = facts.bed;
      // Before noon an empty day is just a morning, not a bad day
      mood = now.getHours() >= 12 ? moodOf(facts) : 'mixed';
      await AsyncStorage.setItem('coach.waterTarget.v1', JSON.stringify({ day: today, target: sit.waterTarget })).catch(() => undefined);
      if (prefs.level !== 'quiet' && m >= prefs.wakeTime + 240) {
        const slot = m >= 12 * 60 + 45 && m < 14 * 60 ? 'noon' : m >= 16 * 60 + 45 && m < 18 * 60 ? 'eve' : null;
        const ci = slot ? checkIn(facts) : null;
        if (ci) candidates.push({ id: `checkin@${slot}`, priority: 2, title: ci.title, body: ci.body });
      }
      if (m >= bed - 75 && m < bed - 15) {
        const sum = summarizeDay(facts);
        candidates.push({ id: 'day_summary', priority: 1, title: sum.title, body: sum.body });
      }
    }
  } catch {
    // the day's read is extra: without it the rest still goes out
  }

  // A strong network that looks like a gym: ask once if it is his
  const guess = await loadGuess(now.getTime()).catch(() => null);
  if (guess && state.place !== 'gym') {
    candidates.push({
      id: 'wifi_guess',
      priority: 2,
      title: tr('אתה בחדר כושר?', 'Are you at the gym?'),
      body: tr(`אני רואה רשת חזקה בשם "${guess.ssid}". זה חדר הכושר שלך? אם כן, מעכשיו אזהה אותו לבד. אם לא, לא אשאל עליה שוב.`, `I see a strong network called "${guess.ssid}". Is it your gym? If so, from now I will recognize it myself. If not, I will not ask about it again.`),
    });
  }

  // The week's focus, its evening check, and a proposed change to the plan; through the same caps
  candidates.push(
    ...(await weeklyMessages(now, {
      kcal: data?.nutrition.kcal ?? 0,
      protein: data?.nutrition.protein ?? 0,
      meals: data?.nutrition.meals ?? 0,
      steps: data?.steps ?? 0,
      targets: { calories: caloriesFor(now), proteinG: GOALS.proteinG, steps: GOALS.steps },
      bedTime: prefs.bedTime,
      level: prefs.level,
    }).catch(() => [])),
  );

  // A night the watch missed: asked once, in the morning
  candidates.push(...(await sleepMessages(now, prefs.wakeTime).catch(() => [])));

  // The evening sweet, said before it happens; it goes through the same caps as the rest
  if (data) {
    const crave = await cravingMessage(now).catch(() => null);
    if (crave) candidates.push(crave);
  }

  const log = (await loadLog()).filter((l) => l.day === today);
  // Manual run: whatever is still open is said again, the daily dedup does not apply
  // News that belongs to one moment (the weigh-in, a run, the evening sweet) is said once even then
  const sentTodayIds = opts.manual ? loggedIds(log).filter((id) => /^(meal|status)_\d+$/.test(id) || /^(weight_news|craving_evening|run@|day_summary|checkin@|workout_done@)/.test(id)) : loggedIds(log);
  // Topics he answered "got it" on stay quiet for a while. A manual run still says everything.
  const snoozes = opts.manual ? {} : await loadSnoozes();
  // The same topic within 25 minutes is a repeat, whatever bucket made its id (the unlock and the background check)
  const recentBase = new Set(log.filter((l) => now.getTime() - l.at < 25 * 60000).map((l) => baseId(l.id)));
  const awake = combineMeals(candidates, sentTodayIds).filter(
    (c) => !(snoozes[baseId(c.id)] > now.getTime()) && (opts.manual || /^(meal|status)_\d+$/.test(c.id) || c.id === 'water@close' || c.id === 'day_summary' || !recentBase.has(baseId(c.id))),
  );
  const chosen = select(awake, { now, prefs, sentTodayIds });
  await noteRun(now, {
    // Already said today is not "held": only what had something new and still did not go out
    why: chosen.length
      ? 'sent'
      : awake.some((c) => !sentTodayIds.includes(c.id))
        ? 'caps'
        : awake.length
          ? 'said'
          : candidates.length
            ? 'snoozed'
            : 'nothing',
    candidates: candidates.map((c) => c.id).slice(0, 8),
    held: awake.filter((c) => !chosen.includes(c) && !sentTodayIds.includes(c.id)).map((c) => c.id).slice(0, 8),
    sentToday: sentTodayIds.length,
    data: !!data,
    sent: chosen.map((c) => c.id).slice(0, 8),
  });

  // Follow-ups after "got it": close what the data shows done, and say so when he still did not
  const unlogged = await loadUnlogged(now);
  const pending = await syncDoneFromData(factsFrom(sit, now, prefs, unlogged, state.gymDay === today), now).catch(
    () => ({}) as Record<string, FollowUp>,
  );
  const ignoredOf = new Map<string, { count: number; at: string }>();
  for (let i = 0; i < chosen.length; i++) {
    const k = followKey(chosen[i].id);
    const f = k ? pending[k] : undefined;
    if (!f || now.getTime() < f.dueAt) continue;
    const t = new Date(f.ackAt);
    // The coach says it in his own voice below: who ignored it, how many times, since when
    ignoredOf.set(chosen[i].id, { count: Math.max(1, f.count), at: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` });
    chosen[i] = { ...chosen[i], level: f.count >= 2 ? 'urgent' : chosen[i].level };
  }

  // A dominant coach always has something to say when asked
  if (opts.manual && chosen.length === 0 && !isQuietTime(now, prefs)) {
    const open = checklist({
      now,
      hcOk: sit.hcOk,
      hcProblem: sit.hcProblem,
      weighedToday: sit.weighedToday,
      daysSinceWeigh: sit.daysSinceWeigh,
      workedOutToday: sit.workedOutToday,
      workoutDaysThisWeek: sit.workoutDaysThisWeek,
      waterMl: sit.waterMl,
      waterTarget: sit.waterTarget,
      wakeTime: prefs.wakeTime,
      bedTime: prefs.bedTime,
      mealTimes: mealList.map((x) => x.time),
      mealSlots: prefs.mealSlots,
      sleepMinutes: data?.sleepMinutes ?? null,
      lastStepsAt: sit.lastStepsAt,
      waterContainer: prefs.waterContainer,
      activityAppName: activityApp(profile.watch)?.name ?? null,
      foodAppName: profile.foodApp === 'other' ? null : foodApp(profile.foodApp)?.name ?? null,
      hasWatch: profile.watch === undefined ? undefined : hasWatch(profile.watch),
      unloggedSlots: unlogged,
    }).filter((i) => !i.done);
    const next = nextWorkout(now, !!sit.workedOutToday || (data?.workouts.count ?? 0) > 0);
    chosen.push(
      open.length
        ? {
            id: `status_${now.getTime()}`,
            priority: 1,
            title: tr(`${open.length} דברים עוד פתוחים`, `${open.length} things still open`),
            body: open.map((i) => `${i.label}: ${i.detail}`).join('. ') + '.',
          }
        : {
            id: `status_${now.getTime()}`,
            priority: 1,
            title: tr('הכל סגור כרגע', 'All closed for now'),
            body: tr(`האימון הבא: ${next.session.title} ${next.label}. אל תנוח על זרי הדפנה.`, `Next workout: ${next.session.title} ${next.label}. Don't rest on your laurels.`),
          },
    );
  }

  // A run that just synced gets its own message, outside the daily caps
  const run = await runMessage(profile.age, now, prefs).catch(() => null);
  if (run && !loggedIds(log).includes(run.id)) chosen.push(run);

  // Last check right before sending: another run may have said it a moment ago
  const justSent = new Set(loggedIds((await loadLog()).filter((l) => l.day === today)));
  for (const raw of chosen) {
    if (!opts.manual && justSent.has(raw.id)) continue;
    const harsh: Harsh = prefs.level === 'drill' ? (prefs.tone === 'encouraging' ? 'medium' : 'strong') : prefs.level === 'quiet' ? 'soft' : 'medium';
    const ig = ignoredOf.get(raw.id);
    const toned = applyTone(raw, prefs.tone);
    let m = toned;
    try {
      m = voice(toned, {
      name: profile.name?.trim() || undefined,
      whyNow: profile.whyNow,
      harsh,
      mood,
      ignored: ig?.count ?? 0,
      ackedAt: ig?.at,
      proteinLeft: Math.max(0, GOALS.proteinG - (data?.nutrition.protein ?? 0)),
      hour: now.getHours(),
      seed: seedOf(raw.id + today),
      });
    } catch {
      m = toned;
    }
    await Notifications.scheduleNotificationAsync({
      content: { title: m.title, body: m.body, categoryIdentifier: categoryFor(m.id), data: { topic: baseId(m.id) } },
      trigger: { channelId: CHANNELS[importanceOf(m)] },
    });
    await appendLog({ id: m.id, day: today, at: now.getTime(), title: m.title, body: m.body, also: m.also });
    await noteSent(baseId(m.id), now.getTime());
  }
  return chosen;
}

/** What the last run saw and why it said nothing, for the "learned" screen. */
let runHow: 'bg' | 'place' | 'manual' | 'unlock' = 'bg';
async function noteRun(now: Date, r: Record<string, unknown>) {
  const note = { at: now.getTime(), how: runHow, ...r };
  await AsyncStorage.setItem('coach.lastRun.v1', JSON.stringify(note)).catch(() => undefined);
  // Today's runs, for the "learned" screen: when the coach looked, and why it did or did not speak
  try {
    const all: any[] = JSON.parse((await AsyncStorage.getItem('coach.runLog.v1')) ?? '[]');
    const day0 = new Date(now);
    day0.setHours(0, 0, 0, 0);
    const keep = all.filter((x) => x.at >= day0.getTime() - 86400000);
    keep.push({ at: note.at, how: runHow, why: r.why, sent: r.sent ?? undefined, held: r.held ?? undefined });
    await AsyncStorage.setItem('coach.runLog.v1', JSON.stringify(keep.slice(-120)));
  } catch {
    // best effort
  }
}

const REMINDERS_DAY = 'coach.remindersDay.v1';

/** Workout reminders are scheduled 7 days ahead; top them up once a day. */
async function refreshRemindersDaily(now: Date) {
  try {
    const today = dayKey(now);
    if ((await AsyncStorage.getItem(REMINDERS_DAY)) === today) return;
    await applyReminders(await loadSettings());
    await AsyncStorage.setItem(REMINDERS_DAY, today);
  } catch {
    // best effort
  }
}
