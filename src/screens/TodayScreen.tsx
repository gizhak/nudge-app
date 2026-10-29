import { workoutsOnly } from '../health/isWorkout';
import { ReactNode, useCallback, useEffect, useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { dayKey, loadLog, loadPlaceState, SentMessage } from '../coach/store';
import { freshNudge } from '../coach/journal';
import { checklistKeyOf, FollowUp } from '../coach/followup';
import { ackTopic, didIt, doneSince, loadActed, loadFollowUps, syncDoneFromData } from '../coach/followupStore';
import { factsFrom } from '../coach/facts';
import CoachJournal from './CoachJournal';
import SleepView from './SleepView';
import { Sheet } from '../ui/Sheet';
import { loadLastReadiness, Readiness } from '../setup/readiness';
import { GOALS, nextWorkout, caloriesFor, planThisWeek, sessionOf } from '../config/goals';
import PlaceChip from '../ui/PlaceChip';
import { confirmExits, verifyPlace } from '../coach/tasks';
import FocusCards from './FocusCards';
import { GYM_MIN } from '../coach/gymDays';
import { PlaceState } from '../coach/store';
import { setupHealthConnect } from '../health/permissions';
import { Quality, TodayData } from '../health/today';
import { readSituation, Situation } from '../coach/situation';
import { CheckAction, checklist, missingMeals } from '../coach/checklist';
import { isQuietTime } from '../coach/rules';
import { dm as vdm, onVacation } from '../coach/vacation';
import { ackNight, loadSnoozes, loadUnlogged, markAteUnlogged, markWorkoutDone, snoozeToday, declineOuting, setOutingPlan, dayKey as dk, loadNightState, NightState, nightKey, loadPrefs, DEFAULT_PREFS, CoachPrefs } from '../coach/store';
import { loadAndApply } from '../profile/bootstrap';
import { expectsBrokenNights, FoodAppKind, interruptLabels, Kids, WatchKind } from '../profile/profile';
import { graceEnd, nightMinutes, OUTING_KINDS, OUTING_LABEL, OUTING_TIP, OutingPlan } from '../coach/outing';
import { Choice, TimeStepper } from '../ui/inputs';
import { addWater, readWaterToday, undoWater } from '../health/water';
import WaterWave from '../ui/WaterWave';
import { drinkNow, sips, waterButtons, waterExpectedByNow, waterText } from '../nutrition/water';
import { openApp } from '../apps/zepp';
import { activityApp, foodApp, hasWatch } from '../setup/devices';
import { Ionicons } from '@expo/vector-icons';
import { readNutritionByDay, readSleepByNight } from '../health/history';
import { readRecords } from 'react-native-health-connect';
import { explainWeight, WeightWhy } from '../report/weightWhy';
import { sourceLabel } from '../config/sources';
import { derive } from '../profile/derive';
import { loadProfile } from '../profile/profile';
import { Card, OpenRow, PrimaryButton, RowsCard, Screen } from '../ui/components';
import { TargetBars, TrendLine } from '../ui/charts';
import { Chip, MiniRing, Sparkline, Tile, TileGrid } from '../ui/tiles';
import { DAY_LETTERS } from '../config/goals';
import { C, fmt, T } from '../ui/theme';

import { CHEVRON_ON, ROW, SIDE_START, t as tr, LOCALE } from '../i18n';
const QUALITY_COLOR: Record<Quality, string> = { ok: C.accent, partial: C.warn, missing: C.bad };

function greeting(now: Date) {
  const h = now.getHours();
  if (h < 12) return tr('בוקר טוב', 'Good morning');
  if (h < 17) return tr('צהריים טובים', 'Good afternoon');
  return tr('ערב טוב', 'Good evening');
}

const hhmmOf = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** From noon until bedtime, or until the planned return: when "going out tonight" makes sense. */
function eveningWindow(now: Date, prefs: CoachPrefs, night: NightState) {
  const m = now.getHours() * 60 + now.getMinutes();
  const plan = night.outings?.includes(nightKey(now)) ? night.outingPlans?.[nightKey(now)] : undefined;
  if (plan) return nightMinutes(m) >= 12 * 60 && nightMinutes(m) < graceEnd(plan);
  return m >= 12 * 60 && m < prefs.bedTime;
}

/** Tonight's plan, if any. */
const tonightPlan = (now: Date, night: NightState) =>
  night.outings?.includes(nightKey(now)) ? night.outingPlans?.[nightKey(now)] ?? null : null;

function OutingCard({
  plan,
  bedTime,
  onChanged,
  onOpenFood,
}: {
  plan: OutingPlan | null;
  bedTime: number;
  onChanged: () => void;
  onOpenFood: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState<OutingPlan>({ leaveAt: 20 * 60, returnAt: 0, kind: 'restaurant' });
  const [editing, setEditing] = useState(false);

  if (plan && !editing) {
    return (
      <Card>
        <Text style={[T.bold, { fontSize: 16 }]}>
          {tr('יוצא ב', 'Going out at ')}{hhmmO(plan.leaveAt)}: {OUTING_LABEL[plan.kind]}
        </Text>
        <Text style={[T.muted, { fontSize: 13 }]}>{tr('חוזר בערך ב', 'Back around ')}{hhmmO(plan.returnAt)}{tr('. לא אציק על שינה עד', '. I won\'t nag about sleep until')} {hhmmO(graceEnd(plan) % 1440)}.</Text>
        <Text style={[T.base, { fontSize: 14, lineHeight: 21 }]}>{OUTING_TIP[plan.kind]}</Text>
        <View style={s.outRow}>
          {plan.kind === 'restaurant' && (
            <Pressable style={s.nightBtn} onPress={onOpenFood}>
              <Text style={[T.bold, s.nightText]}>{tr('יועץ התפריט', 'Menu advisor')}</Text>
            </Pressable>
          )}
          <Pressable
            style={s.ghostBtn}
            onPress={() => {
              setDraft(plan);
              setEditing(true);
            }}
          >
            <Text style={[T.bold, { fontSize: 14 }]}>{tr('שינוי', 'Change')}</Text>
          </Pressable>
          <Pressable
            style={s.ghostBtn}
            onPress={async () => {
              await setOutingPlan(null);
              onChanged();
            }}
          >
            <Text style={[T.bold, { fontSize: 14, color: C.muted }]}>{tr('ביטול', 'Cancel')}</Text>
          </Pressable>
        </View>
      </Card>
    );
  }

  if (!asking && !editing) {
    return (
      <Card>
        <Text style={[T.bold, { fontSize: 16 }]}>{tr('יוצא הערב?', 'Going out tonight?')}</Text>
        <View style={s.outRow}>
          <Pressable
            style={s.nightBtn}
            onPress={() => {
              setDraft({ leaveAt: 20 * 60, returnAt: (bedTime + 60) % 1440, kind: 'restaurant' });
              setAsking(true);
            }}
          >
            <Text style={[T.bold, s.nightText]}>{tr('כן', 'Yes')}</Text>
          </Pressable>
          <Pressable
            style={s.ghostBtn}
            onPress={async () => {
              await declineOuting();
              onChanged();
            }}
          >
            <Text style={[T.bold, { fontSize: 14 }]}>{tr('לא', 'No')}</Text>
          </Pressable>
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <Text style={[T.bold, { fontSize: 16 }]}>{tr('מה מתוכנן?', 'What\'s the plan?')}</Text>
      <Choice options={OUTING_KINDS} value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind })} />
      <View style={s.outTime}>
        <Text style={[T.bold, { fontSize: 15 }]}>{tr('יוצא ב', 'Going out at ')}</Text>
        <TimeStepper value={draft.leaveAt} onChange={(leaveAt) => setDraft({ ...draft, leaveAt })} />
      </View>
      <View style={s.outTime}>
        <Text style={[T.bold, { fontSize: 15 }]}>{tr('חוזר בערך ב', 'Back around ')}</Text>
        <TimeStepper value={draft.returnAt} onChange={(returnAt) => setDraft({ ...draft, returnAt })} />
      </View>
      <View style={s.outRow}>
        <Pressable
          style={s.nightBtn}
          onPress={async () => {
            await setOutingPlan(draft);
            setAsking(false);
            setEditing(false);
            onChanged();
          }}
        >
          <Text style={[T.bold, s.nightText]}>{tr('שמור', 'Save')}</Text>
        </Pressable>
        <Pressable
          style={s.ghostBtn}
          onPress={() => {
            setAsking(false);
            setEditing(false);
          }}
        >
          <Text style={[T.bold, { fontSize: 14, color: C.muted }]}>{tr('חזרה', 'Back')}</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const hhmmO = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function isNightWindow(now: Date, prefs: CoachPrefs) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return isQuietTime(now, prefs) && (nowMin - prefs.bedTime + 1440) % 1440 < 300;
}

/** Morning after a short night that is not yet marked as a baby night. */
function askBaby(now: Date, d: TodayData, night: NightState) {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return now.getHours() >= 5 && now.getHours() < 12 && d.sleepMinutes !== null && d.sleepMinutes < 360 && !night.babyNights.includes(dk(y));
}

function coachLine(d: TodayData, now: Date, prefs: CoachPrefs, acked = false, outing: OutingPlan | null = null, water: { ml: number | null; target: number } | null = null): string {
  if (onVacation(now, prefs.vacation)) return tr(`חופשה עד ${vdm(prefs.vacation!.to)}. תהנה, תשתה מים ותזוז. אני כאן כשתחזור.`, `On vacation until ${vdm(prefs.vacation!.to)}. Enjoy, drink water and move. I am here when you are back.`);
  if (isNightWindow(now, prefs) && outing && nightMinutes(now.getHours() * 60 + now.getMinutes()) < graceEnd(outing)) return tr('תהנה. כוס מים בין משקה למשקה.', 'Enjoy. A glass of water between drinks.');
  if (isNightWindow(now, prefs) && acked) return tr('בסדר, לא מציק הלילה. לילה טוב.', 'OK, no nagging tonight. Good night.');
  if (isNightWindow(now, prefs)) {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const left = (prefs.wakeTime - (now.getHours() * 60 + now.getMinutes()) + 1440) % 1440;
    return tr(`מה אתה עושה ער? נשארו ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} שעות עד ההשכמה. סגור את האפליקציה ולך לישון.`, `What are you doing up? ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} hours left until you wake up. Close the app and go to sleep.`);
  }
  const kcalLeft = Math.max(0, caloriesFor(now) - d.nutrition.kcal);
  const proteinLeft = Math.max(0, GOALS.proteinG - d.nutrition.protein);
  // Behind on water by more than two cups: that is the thing to do now, until two hours before bed
  if (water && water.ml != null && water.target) {
    const m = now.getHours() * 60 + now.getMinutes();
    const wake = prefs.wakeTime;
    const bed = prefs.bedTime < wake ? prefs.bedTime + 1440 : prefs.bedTime;
    const mm = m < wake ? m + 1440 : m;
    const gap = waterExpectedByNow(water.target, m, wake, prefs.bedTime) - water.ml;
    if (mm >= wake + 90 && mm <= bed - 90 && gap > 500) {
      return mm >= bed - 150
        ? tr(`חסרים ${waterText(water.target - water.ml, prefs.waterContainer)} מים להיום. זו ההזדמנות האחרונה, שתה עכשיו.`, `${waterText(water.target - water.ml, prefs.waterContainer)} of water still to go today. This is the last chance, drink now.`)
        : tr(`חסרים לך ${waterText(gap, prefs.waterContainer)} מים לשעה הזו. ${drinkNow(250, prefs.waterContainer)} עכשיו, ולחץ על ה +.`, `You are ${waterText(gap, prefs.waterContainer)} of water behind for this hour. ${drinkNow(250, prefs.waterContainer)} now, and tap the +.`);
    }
  }
  if (d.nutrition.meals === 0) return tr('עוד לא נרשמה ארוחה היום. רשום את הארוחה הבאה, וכך אוכל לעקוב.', 'No meal logged today yet. Log the next one, so I can keep track.');
  if (now.getHours() >= 17 && d.nutrition.protein < GOALS.proteinG * 0.6) {
    return tr(`חסרים לך ${fmt(proteinLeft)} גרם חלבון. כדאי שארוחת הערב תהיה עשירה בחלבון.`, `You still need ${fmt(proteinLeft)} grams of protein. Make dinner rich in protein.`);
  }
  const over = d.nutrition.kcal - caloriesFor(now);
  if (over > 0) return proteinLeft > 0 ? tr(`עברת את הקלוריות ב ${fmt(over)}, ועדיין חסרים ${fmt(proteinLeft)} גרם חלבון. מכאן רק חלבון רזה.`, `You are ${fmt(over)} calories over, and still ${fmt(proteinLeft)} grams of protein short. Only lean protein from here.`) : tr(`עברת את הקלוריות ב ${fmt(over)}. החלבון ביעד. מכאן רק מים ותה.`, `You are ${fmt(over)} calories over. Protein is on target. Only water and tea from here.`);
  if (proteinLeft <= 0) return tr(`החלבון ביעד. נשארו לך ${fmt(kcalLeft)} קלוריות להיום.`, `Protein is on target. ${fmt(kcalLeft)} calories left for today.`);
  return tr(`נשארו לך ${fmt(kcalLeft)} קלוריות ו${fmt(proteinLeft)} גרם חלבון להיום.`, `${fmt(kcalLeft)} calories and ${fmt(proteinLeft)} grams of protein left for today.`);
}


const SLEEP_COLOR = C.data;

const WHY_SEEN = 'today.weightWhySeen.v1';
/** The explanation counts as new when its reasons change, not every time the screen loads */
const whySignature = (w: WeightWhy) => `${w.headline}|${w.reasons.join('|')}`;
/** A hint of the first reason for the collapsed row */
function shortReason(r: string): string {
  if (r.includes('שתי שקילות')) return tr('שקילה כפולה', 'Double weigh-in');
  if (r.includes('ישנת')) return tr('שינה קצרה', 'Short sleep');
  if (r.includes('אימון')) return tr('אימון', 'Workout');
  if (r.includes('אכלת מעט')) return tr('יום עם מעט אוכל', 'A day of little food');
  if (r.includes('אכלת')) return tr('ארוחה גדולה', 'A big meal');
  if (r.includes('מאוחר')) return tr('שקילה מאוחרת', 'Late weigh-in');
  if (r.includes('מוקדם')) return tr('שקילה מוקדמת', 'Early weigh-in');
  if (r.includes('קצב')) return tr('קצב בריא', 'A healthy pace');
  return tr('הסבר חדש', 'New explanation');
}

interface Week {
  kcal: number[];
  protein: number[];
  sleep: (number | null)[];
  labels: string[];
  /** The scale lately, measured on one scale, with likely reasons */
  why: WeightWhy | null;
}

async function readWeek(): Promise<Week> {
  const safe = async <X,>(fn: () => Promise<X>, fb: X) => {
    try {
      return await fn();
    } catch {
      return fb;
    }
  };
  const now = Date.now();
  const range = (days: number) => ({
    timeRangeFilter: { operator: 'between' as const, startTime: new Date(now - days * 86400000).toISOString(), endTime: new Date(now).toISOString() },
  });
  const [nut, sleep, weightRecs, sessions, place, profile] = await Promise.all([
    safe(() => readNutritionByDay(7), [] as Awaited<ReturnType<typeof readNutritionByDay>>),
    safe(() => readSleepByNight(7), [] as Awaited<ReturnType<typeof readSleepByNight>>),
    safe(async () => ((await readRecords('Weight', range(14))) as any).records ?? [], [] as any[]),
    safe(async () => workoutsOnly(((await readRecords('ExerciseSession', range(7))) as any).records), [] as any[]),
    safe(() => loadPlaceState(), { place: null, since: 0 } as Awaited<ReturnType<typeof loadPlaceState>>),
    safe(() => loadProfile(), null),
  ]);
  const sod = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const trained = new Set<number>([...sessions.map((r: any) => sod(new Date(r.startTime).getTime())), ...(place.gymDays ?? [])]);
  const lite = nut.map((d) => {
    const day = sod(d.date.getTime());
    const sl = sleep.find((x) => sod(x.date.getTime()) === day);
    return { day, kcal: d.kcal, meals: d.meals, sleepMin: sl?.minutes ?? null, workout: trained.has(day) };
  });
  const usable = profile && profile.completed && profile.heightCm > 0 && profile.weightKg > 0;
  const why = explainWeight(
    weightRecs.map((r: any) => ({ time: new Date(r.time).getTime(), kg: r.weight?.inKilograms, source: r.metadata?.dataOrigin })).filter((p: any) => p.kg > 0),
    lite,
    { target: GOALS.calories, maintenance: usable ? derive(profile!).maintenance : undefined, label: sourceLabel, now },
  );
  const days = nut.length ? nut.map((d) => d.date) : sleep.map((d) => d.date);
  return {
    kcal: nut.map((d) => Math.round(d.kcal)),
    protein: nut.map((d) => Math.round(d.protein)),
    sleep: sleep.map((d) => (d.minutes === null ? null : d.minutes / 60)),
    labels: days.map((d) => DAY_LETTERS[d.getDay()]),
    why,
  };
}

/** Average over days that have data, excluding today which is still in progress. */
function avgPast(values: (number | null)[]) {
  const past = values.slice(0, -1).filter((v): v is number => v !== null && v > 0);
  return past.length ? past.reduce((a, b) => a + b, 0) / past.length : null;
}

function weekVerdict(w: Week): string | null {
  const kcal = avgPast(w.kcal);
  const protein = avgPast(w.protein);
  const parts: string[] = [];
  if (kcal !== null) {
    if (kcal > GOALS.calories * 1.1) parts.push(tr(`ממוצע ${fmt(kcal)} קלוריות, מעל היעד`, `Average ${fmt(kcal)} calories, over the goal`));
    else if (kcal < GOALS.calories * 0.7) parts.push(tr(`ממוצע ${fmt(kcal)} קלוריות, כנראה לא כל הארוחות נרשמות`, `Average ${fmt(kcal)} calories, probably not every meal is logged`));
    else parts.push(tr(`ממוצע ${fmt(kcal)} קלוריות, בטווח`, `Average ${fmt(kcal)} calories, in range`));
  }
  if (protein !== null) {
    parts.push(protein >= GOALS.proteinG * 0.9 ? tr(`חלבון ${fmt(protein)} גרם, מצוין`, `Protein ${fmt(protein)} grams, excellent`) : tr(`חלבון ${fmt(protein)} גרם, חסר ${fmt(GOALS.proteinG - protein)}`, `Protein ${fmt(protein)} grams, ${fmt(GOALS.proteinG - protein)} short`));
  }
  return parts.length ? parts.join('. ') + '.' : null;
}

// Last data shown, so switching back to this tab does not start empty and jump
const todayCache: { data: TodayData | null; week: Week | null; sit: Situation | null } = { data: null, week: null, sit: null };

export default function TodayScreen({
  onOpenTraining,
  onReschedule,
  onOpenProgress,
  onOpenFood,
  onOpenReadiness,
  onOpenCoach,
  readinessTick,
  dataTick = 0,
}: {
  dataTick?: number;
  onOpenTraining: () => void;
  onReschedule: () => void;
  onOpenProgress: () => void;
  onOpenFood: () => void;
  onOpenReadiness: () => void;
  onOpenCoach: () => void;
  readinessTick: number;
}) {
  const [data, setData] = useState<TodayData | null>(todayCache.data);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Which drawer is open: details live there, the screen keeps numbers and one line */
  const [sleepOpen, setSleepOpen] = useState(0);
  const [sheet, setSheet] = useState<null | 'nudge' | 'journal' | 'week' | 'quality' | 'weight' | 'sleep' | { check: string }>(null);
  // The weight explanation: a dot until he has read this version of it
  const [whySeen, setWhySeen] = useState<string | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(WHY_SEEN).then(setWhySeen, () => undefined);
  }, []);
  const [coachToday, setCoachToday] = useState<SentMessage[]>([]);
  const [tick, setTick] = useState(0);
  const [unlogged, setUnlogged] = useState<string[]>([]);
  const [quiet, setQuiet] = useState<Record<string, number>>({});
  const [follow, setFollow] = useState<Record<string, FollowUp>>({});
  const [acted, setActed] = useState<Record<string, number>>({});
  /** After he does something: everything on screen reflects it at once */
  const refreshDone = async () => {
    setFollow(await loadFollowUps());
    setActed(await loadActed());
    setTick((t) => t + 1);
  };
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [week, setWeek] = useState<Week | null>(todayCache.week);
  const [sit, setSit] = useState<Situation | null>(todayCache.sit);
  // Where the coach thinks he is: read again every minute, the background updates it
  const [placeSt, setPlaceSt] = useState<PlaceState | null>(null);
  const loadPlace = useCallback(() => {
    loadPlaceState()
      .then(setPlaceSt)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    loadPlace();
    // Opening the app checks a place that may be stale, then shows the answer
    verifyPlace()
      .then(() => confirmExits())
      .then(loadPlace)
      .catch(() => undefined);
    const id = setInterval(loadPlace, 60_000);
    // While Home is open, the place is checked every three minutes
    const check = setInterval(() => {
      verifyPlace(Date.now(), 10 * 60000)
        .then(() => confirmExits())
        .then(loadPlace)
        .catch(() => undefined);
    }, 3 * 60_000);
    return () => {
      clearInterval(id);
      clearInterval(check);
    };
  }, [loadPlace]);
  // Taps on the water + and - in a row, shown as rising water until a moment after the last one
  const [burst, setBurst] = useState(0);
  const [bursting, setBursting] = useState(false);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapBurst = (n: number) => {
    setBurst((b) => b + n);
    setBursting(true);
    if (burstTimer.current) clearTimeout(burstTimer.current);
    burstTimer.current = setTimeout(() => {
      setBursting(false);
      setTimeout(() => setBurst(0), 450);
    }, 1600);
  };
  const [prefs, setPrefs] = useState<CoachPrefs>(DEFAULT_PREFS);
  const [night, setNight] = useState<NightState>({ acks: [], babyNights: [] });
  const [family, setFamily] = useState<{ kids: Kids; nightWakeups: boolean; watch?: WatchKind; foodApp?: FoodAppKind }>({ kids: 'none', nightWakeups: false });
  const labels = interruptLabels(family.kids);

  useEffect(() => {
    loadLastReadiness().then(setReadiness);
  }, [readinessTick]);
  const now = new Date();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const setup = await setupHealthConnect();
      if (!setup.ok) return setError(setup.reason);
      const { profile } = await loadAndApply();
      setFamily({ kids: profile.kids, nightWakeups: profile.nightWakeups, watch: profile.watch, foodApp: profile.foodApp });
      setPrefs(await loadPrefs());
      setUnlogged(await loadUnlogged());
      setQuiet(await loadSnoozes());
      setFollow(await loadFollowUps());
      setActed(await loadActed());
      setNight(await loadNightState());
      const situation = await readSituation(new Date(), profile.weightKg);
      setSit(situation);
      todayCache.sit = situation;
      // Done outside the app (a smart scale, the food app): the coach's messages on it close now
      const pf = await loadPrefs();
      const st = await loadPlaceState();
      setPlaceSt(st);
      await syncDoneFromData(factsFrom(situation, new Date(), pf, await loadUnlogged(), st.gymDay === dayKey())).catch(() => undefined);
      if (situation.today) setData((todayCache.data = situation.today));
      else setError(situation.hcProblem ?? tr('לא ניתן לקרוא נתונים', 'Can\'t read data'));
      readWeek().then((w) => setWeek((todayCache.week = w)));
      setCoachToday((await loadLog()).filter((m) => m.day === dayKey()));
      setTick((t) => t + 1);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, dataTick]);

  const next = nextWorkout(now);
  const dateLabel = now.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <View style={{ flex: 1 }}>
    <Screen
      brand
      enter="today"
      title={greeting(now)}
      subtitle={dateLabel}
      refreshing={loading}
      onRefresh={load}
      brandSide={placeSt ? <PlaceChip place={placeSt.place} since={placeSt.since} via={placeSt.via} onChanged={() => { loadPlace(); load(); }} /> : null}
    >
      {placeSt?.place === 'gym' && <GymNowCard since={placeSt.since} via={placeSt.via} counted={(placeSt.gymDays ?? []).includes(new Date(new Date().setHours(0, 0, 0, 0)).getTime())} onOpen={onOpenTraining} />}
      {data && placeSt?.place !== 'gym' && (
        <NowCard
          line={coachLine(data, now, prefs, night.acks.includes(nightKey(now)), tonightPlan(now, night), sit ? { ml: sit.waterMl ?? null, target: sit.waterTarget ?? 0 } : null)}
          nudge={freshNudge(coachToday.filter((m) => !((quiet[m.id.split('@')[0]] ?? 0) > Date.now()) && !doneSince(acted, m.id, m.at)), now)}
          onOpen={onOpenCoach}
          more={coachToday.length}
          onJournal={onOpenCoach}
          onGotIt={async (id) => {
            await ackTopic(id.split('@')[0]);
            setQuiet(await loadSnoozes());
            setFollow(await loadFollowUps());
            setTick((t) => t + 1);
          }}
        >
          {isNightWindow(now, prefs) && !night.acks.includes(nightKey(now)) && !(tonightPlan(now, night) && nightMinutes(now.getHours() * 60 + now.getMinutes()) < graceEnd(tonightPlan(now, night)!)) && (
            <View style={s.nightRow}>
              <Pressable style={s.nowBtn} onPress={async () => { await ackNight(false); setNight(await loadNightState()); }}>
                <Text style={[T.bold, s.nowBtnText]}>{tr('ידוע לי, זה בסדר', 'I know, it\'s fine')}</Text>
              </Pressable>
              {expectsBrokenNights(family) && (
                <Pressable style={s.nowBtn} onPress={async () => { await ackNight(true); setNight(await loadNightState()); }}>
                  <Text style={[T.bold, s.nowBtnText]}>{labels.button}</Text>
                </Pressable>
              )}
            </View>
          )}
        </NowCard>
      )}

      <FocusCards tick={dataTick} />

      {eveningWindow(now, prefs, night) && !night.notOut?.includes(nightKey(now)) && (
        <OutingCard
          plan={night.outings?.includes(nightKey(now)) ? night.outingPlans?.[nightKey(now)] ?? null : null}
          bedTime={prefs.bedTime}
          onChanged={async () => setNight(await loadNightState())}
          onOpenFood={onOpenFood}
        />
      )}

      {data && expectsBrokenNights(family) && askBaby(now, data, night) && (
        <Card>
          <Text style={[T.bold, { fontSize: 15 }]}>{labels.question}</Text>
          <Text style={[T.muted, { fontSize: 13 }]}>{tr('כך אדע לא להאשים אותך, ולהתאים את האימון של היום.', 'So I know not to blame you, and to adjust today\'s workout.')}</Text>
          <Pressable
            style={[s.nightBtn, { alignSelf: SIDE_START }]}
            onPress={async () => {
              const y = new Date(now);
              y.setDate(y.getDate() - 1);
              // The night that just ended belongs to yesterday's date
              await ackNight(true, dk(y));
              setNight(await loadNightState());
            }}
          >
            <Text style={[T.bold, s.nightText]}>{tr('כן, סמן את הלילה', 'Yes, mark the night')}</Text>
          </Pressable>
        </Card>
      )}

      {readiness && readiness.errors > 0 && (
        <Pressable onPress={onOpenReadiness}>
          <Card style={{ borderWidth: 1.5, borderColor: C.signal }}>
            <Text style={[T.bold, { fontSize: 16, color: C.ink }]}>{readiness.errors} {tr('חיבורים דורשים תיקון', 'Connections need fixing')}</Text>
            <Text style={[T.base, { fontSize: 14 }]}>
              {readiness.items
                .filter((i) => i.status === 'error')
                .map((i) => i.title)
                .join(', ')}
              {tr('. לחץ לתיקון.', '. Tap to fix.')}
            </Text>
          </Card>
        </Pressable>
      )}

      {error && (
        <Card>
          <Text style={[T.bold, { color: C.bad }]}>{error}</Text>
          <PrimaryButton label={tr("נסה שוב", 'Try again')} onPress={load} />
        </Card>
      )}

      {!data && loading && <ActivityIndicator style={{ marginTop: 48 }} color={C.accent} />}

      {data && (
        <>
          {(() => {
            const target = caloriesFor(now);
            const left = target - data.nutrition.kcal;
            const pLeft = Math.max(0, GOALS.proteinG - data.nutrition.protein);
            const ml = sit?.waterMl ?? null;
            const wTarget = sit?.waterTarget ?? 0;
            const cup = prefs.waterContainer ?? 250;
            const drink = async () => {
              if (!sit) return;
              // The count over the button shows at once; the save follows
              tapBurst(1);
              setSit((p) => (p ? { ...p, waterMl: (p.waterMl ?? 0) + cup } : p));
              try {
                await addWater(cup);
                await didIt(['water']);
                await refreshDone();
                setFollow(await loadFollowUps());
              } catch (e: any) {
                setSit((p) => (p ? { ...p, waterMl: Math.max(0, (p.waterMl ?? 0) - cup) } : p));
                setError(tr(`לא נשמר: ${String(e?.message ?? e)}. בדוק הרשאת מים בבדיקת מוכנות.`, `Not saved: ${String(e?.message ?? e)}. Check the water permission in Readiness.`));
              }
            };
            const undo = async () => {
              if (!sit || !(sit.waterMl ?? 0)) return;
              tapBurst(-1);
              if (await undoWater().catch(() => false)) {
                const fresh = await readWaterToday().catch(() => null);
                setSit((p) => (p ? { ...p, waterMl: fresh ?? p.waterMl } : p));
              }
            };
            return (
              <TileGrid>
                <Tile
                  mark={<MiniRing value={data.nutrition.kcal} max={target} color={left < 0 ? C.warn : C.kcal} icon={<Ionicons name="flame" size={16} color={C.kcal} />} />}
                  value={fmt(Math.abs(left))}
                  label={left >= 0 ? tr('קלוריות נשארו', 'calories left') : tr('קלוריות מעל היעד', 'calories over the goal')}
                  sub={tr(`מתוך ${fmt(target)}`, `of ${fmt(target)}`)}
                  onPress={onOpenFood}
                />
                <Tile
                  mark={<MiniRing value={data.nutrition.protein} max={GOALS.proteinG} color={C.protein} icon={<Ionicons name="egg" size={15} color={C.protein} />} />}
                  value={pLeft > 0 ? tr(`${fmt(pLeft)} ג'`, `${fmt(pLeft)} g`) : tr('ביעד', 'On target')}
                  label={pLeft > 0 ? tr('חלבון חסר', 'protein to go') : tr(`חלבון, ${fmt(data.nutrition.protein)} ג'`, `protein, ${fmt(data.nutrition.protein)} g`)}
                  onPress={onOpenFood}
                />
                <Tile
                  mark={<MiniRing value={ml ?? 0} max={wTarget || 1} color={C.water} replay={ml ?? 0} icon={<Ionicons name="water" size={16} color={C.water} />} />}
                  value={ml == null ? '—' : tr(`${(Math.round(ml / 100) / 10).toFixed(1)} ל'`, `${(Math.round(ml / 100) / 10).toFixed(1)} L`)}
                  label={!wTarget ? tr('מים', 'water') : tr(`מתוך ${(Math.round(wTarget / 100) / 10).toFixed(1)}`, `of ${(Math.round(wTarget / 100) / 10).toFixed(1)}`)}
                  sub={cup === 30 && ml != null ? tr(`${sips(ml)} לגימות`, `${sips(ml)} sips`) : undefined}
                  right={
                    ml != null ? (
                      <View style={{ gap: 6 }}>
                        <Pressable onPress={drink} style={s.plus} accessibilityLabel={cup === 30 ? tr('לגימה', 'Sip') : tr('שתיתי כוס', 'I drank a glass')} hitSlop={4}>
                          <Ionicons name="add" size={18} color="#fff" />
                        </Pressable>
                        {(ml > 0 || bursting) && (
                          <Pressable onPress={undo} style={s.minus} accessibilityLabel={tr("בטל את הכוס האחרונה", 'Undo the last glass')} hitSlop={4}>
                            <Ionicons name="remove" size={18} color={C.water} />
                          </Pressable>
                        )}
                      </View>
                    ) : null
                  }
                />
                <Tile mark={<MiniRing value={data.steps} max={GOALS.steps} color={C.good} icon={<Ionicons name="footsteps" size={15} color={C.good} />} />} value={fmt(data.steps)} label={tr(`צעדים מתוך ${fmt(GOALS.steps)}`, `steps of ${fmt(GOALS.steps)}`)} />
              </TileGrid>
            );
          })()}

          {sit && !onVacation(now, prefs.vacation) && (
            <Checklist
              devices={family}
              sit={sit}
              unlogged={unlogged}
              follow={follow}
              prefs={prefs}
              onAction={async (key) => {
                if (key === 'weigh') onOpenProgress();
                else if (key === 'training') onOpenTraining();
                else if (key === 'readiness') onOpenReadiness();
                else if (key === 'zepp') { const f = foodApp(family.foodApp); if (f) openApp(f.pkg); }
                else if (key === 'mifitness') { const a = activityApp(family.watch); if (a) openApp(a.pkg); }
                else if (key === 'ate') {
                  const slots = missingMeals(new Date(), sit.meals.map((x) => x.time), prefs.mealSlots, unlogged);
                  await markAteUnlogged(slots);
                  await didIt([...slots.map((x) => `meal_reminder_${x}`), 'food']);
                  await refreshDone();
                  setUnlogged(await loadUnlogged());
                  setFollow(await loadFollowUps());
                }
                else if (key === 'trained') {
                  await markWorkoutDone();
                  await didIt(['workout']);
                  await refreshDone();
                  setFollow(await loadFollowUps());
                  await Promise.all(['workout_today', 'workout_now', 'missed_workout'].map((t) => snoozeToday(t)));
                  setSit({ ...sit, workedOutToday: true, workoutDaysThisWeek: sit.workedOutToday ? sit.workoutDaysThisWeek : sit.workoutDaysThisWeek + 1 });
                }
                else if (key === 'water') {
                  try {
                    await addWater();
                    await didIt(['water']);
                  await refreshDone();
                    setSit({ ...sit, waterMl: (sit.waterMl ?? 0) + 250 });
                  } catch (e: any) {
                    setError(tr(`לא נשמר: ${String(e?.message ?? e)}. בדוק הרשאת מים בבדיקת מוכנות.`, `Not saved: ${String(e?.message ?? e)}. Check the water permission in Readiness.`));
                  }
                }
              }}
              onUndoWater={async () => {
                if (await undoWater().catch(() => false)) setSit({ ...sit, waterMl: await readWaterToday().catch(() => sit.waterMl) });
              }}
              onDrink={async (ml) => {
                try {
                  await addWater(ml);
                  await didIt(['water']);
                  await refreshDone();
                  setFollow(await loadFollowUps());
                  setSit({ ...sit, waterMl: (sit.waterMl ?? 0) + ml });
                } catch (e: any) {
                  setError(tr(`לא נשמר: ${String(e?.message ?? e)}. בדוק הרשאת מים בבדיקת מוכנות.`, `Not saved: ${String(e?.message ?? e)}. Check the water permission in Readiness.`));
                }
              }}
            />
          )}

          {(() => {
            const why = week?.why ?? null;
            const sig = why ? whySignature(why) : '';
            const fresh = !!why && why.reasons.length > 0 && whySeen !== sig;
            const past = week ? week.protein.slice(0, -1) : [];
            const pDays = past.filter((p) => p >= GOALS.proteinG * 0.9).length;
            const badQuality = data.quality.filter((q) => q.quality !== 'ok');
            return (
              <>
              {(() => {
                const open = () => {
                  if (!why) return onOpenProgress();
                  setSheet('weight');
                  setWhySeen(sig);
                  AsyncStorage.setItem(WHY_SEEN, sig).catch(() => undefined);
                };
                const down = !!why && (why.dir ? why.dir === 'down' : why.headline.startsWith('ירדת'));
                const up = !!why && (why.dir ? why.dir === 'up' : why.headline.startsWith('עלית'));
                const tone = down ? C.good : up ? C.kcal : C.muted;
                return (
                  <Pressable onPress={open} style={({ pressed }) => [s.weightCard, pressed && { opacity: 0.85 }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: ROW, alignItems: 'center', gap: 6 }}>
                        <Text style={[T.muted, { fontSize: 13 }]}>{tr('משקל', 'Weight')}</Text>
                        {fresh && <View style={s.whyDot} />}
                      </View>
                      <View style={{ flexDirection: ROW, alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={[T.bold, { fontSize: 26, lineHeight: 32 }]}>{data.weight ? fmt(data.weight.kg, 1) : '—'}</Text>
                        {why && (
                          <Text style={[T.bold, s.weightChip, { color: tone, backgroundColor: down ? '#E4EFE6' : up ? '#F8EEDC' : C.track }]} numberOfLines={1}>
                            {why.headline}
                          </Text>
                        )}
                      </View>
                    </View>
                    {why && why.values.length > 1 && <Sparkline values={why.values} color={down ? C.good : up ? C.kcal : C.ink} />}
                  </Pressable>
                );
              })()}
              <RowsCard>
                <OpenRow
                  first
                  title={tr("השבוע", 'This week')}
                  sub={[
                    sit ? tr(`${sit.workoutDaysThisWeek} מתוך ${GOALS.workoutsPerWeek} אימונים`, `${sit.workoutDaysThisWeek} of ${GOALS.workoutsPerWeek} workouts`) : null,
                    past.length ? tr(`חלבון ביעד ${pDays} מתוך ${past.length} ימים`, `Protein on target ${pDays} of ${past.length} days`) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  onPress={() => setSheet('week')}
                />
                {(() => {
                  const sl = week?.sleep ?? [];
                  const lastNight = sl.length ? sl[sl.length - 1] : null;
                  const got = sl.filter((v): v is number => v != null && v > 1);
                  const h = (v: number) => `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`;
                  const sub = !week
                    ? tr('טוען', 'Loading')
                    : !got.length
                      ? tr('לא הגיעו נתוני שינה. לחץ לבדיקה', 'No sleep data arrived. Tap to check')
                      : [lastNight != null && lastNight > 1 ? tr(`הלילה ${h(lastNight)}`, `Last night ${h(lastNight)}`) : tr('הלילה עוד לא הגיע', 'Last night has not come in yet'), tr(`ממוצע ${h(got.reduce((a, b) => a + b, 0) / got.length)}`, `Average ${h(got.reduce((a, b) => a + b, 0) / got.length)}`)].join(' · ');
                  return <OpenRow title={tr("שינה", 'Sleep')} sub={sub} dot={!!week && !got.length} onPress={() => {
                        setSleepOpen((n) => n + 1);
                        setSheet('sleep');
                      }} />;
                })()}
                <OpenRow
                  title={tr("האימון הבא", 'Next workout')}
                  sub={data.workouts.count > 0 ? tr(`התאמנת היום ${data.workouts.minutes} דקות`, `Trained today for ${data.workouts.minutes} minutes`) : `${next.session.title} · ${next.label}`}
                  onPress={onOpenTraining}
                />
                {badQuality.length > 0 && (
                  <OpenRow title={tr("איכות נתונים", 'Data quality')} sub={tr(`חסר: ${badQuality.map((q) => q.label).join(', ')}`, `Missing: ${badQuality.map((q) => q.label).join(', ')}`)} dot onPress={() => setSheet('quality')} />
                )}
              </RowsCard>
              </>
            );
          })()}
        </>
      )}

      <Sheet open={sheet === 'weight'} onClose={() => setSheet(null)} title={week?.why ? ((week.why.dir ? week.why.dir === 'up' : week.why.headline.startsWith('עלית')) ? tr('למה זה כנראה עלה', 'Why it probably went up') : (week.why.dir ? week.why.dir === 'down' : week.why.headline.startsWith('ירדת')) ? tr('למה זה כנראה ירד', 'Why it probably went down') : tr('המשקל', 'Weight')) : tr('המשקל', 'Weight')}>
        {week?.why && (
          <View style={{ gap: 10 }}>
            <Text style={[T.bold, { fontSize: 18 }]}>{week.why.headline}</Text>
            <Text style={[T.muted, { fontSize: 12 }]}>{week.why.basis}</Text>
            {week.why.values.length > 1 && <TrendLine values={week.why.values} ends={week.why.ends} />}
            {week.why.reasons.map((r) => (
              <Text key={r} style={[T.base, { fontSize: 14, lineHeight: 21 }]}>
                {r}
              </Text>
            ))}
            {week.why.reality && <Text style={[T.bold, { fontSize: 14, lineHeight: 21 }]}>{week.why.reality}</Text>}
            {week.why.otherScales && <Text style={[T.muted, { fontSize: 12, lineHeight: 18 }]}>{week.why.otherScales}</Text>}
          </View>
        )}
      </Sheet>

      <Sheet open={sheet === 'sleep'} onClose={() => setSheet(null)} title={tr("שינה", 'Sleep')}>
        {sleepOpen > 0 && <SleepView key={sleepOpen} />}
      </Sheet>

      <Sheet open={sheet === 'nudge'} onClose={() => setSheet(null)} title={tr("המאמן", 'The coach')}>
        {(() => {
          const n = freshNudge(coachToday.filter((m) => !((quiet[m.id.split('@')[0]] ?? 0) > Date.now()) && !doneSince(acted, m.id, m.at)), now);
          if (!n) return <Text style={[T.muted, { fontSize: 14 }]}>{tr('אין הודעה פתוחה.', 'No open message.')}</Text>;
          return (
            <Card>
              <Text style={[T.muted, { fontSize: 12 }]}>{new Date(n.at).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}</Text>
              <Text style={[T.bold, { fontSize: 17 }]}>{n.title}</Text>
              <Text style={[T.base, { fontSize: 15, lineHeight: 23 }]}>{n.body}</Text>
              <PrimaryButton
                label={tr("הבנתי", 'Got it')}
                onPress={async () => {
                  // Close first; the screen updates after the drawer is gone, so the next
                  // message does not flash inside the closing drawer
                  setSheet(null);
                  await ackTopic(n.id.split('@')[0]);
                  await new Promise((r) => setTimeout(r, 350));
                  setQuiet(await loadSnoozes());
                  setFollow(await loadFollowUps());
                  setTick((t) => t + 1);
                }}
              />
            </Card>
          );
        })()}
      </Sheet>

      <Sheet open={sheet === 'journal'} onClose={() => setSheet(null)}>
        <CoachJournal tick={tick} />
        <Pressable
          onPress={() => {
            setSheet(null);
            onOpenCoach();
          }}
          style={s.inlineLink}
        >
          <Text style={[T.bold, { fontSize: 13, color: C.muted }]}>{tr('הגדרות המאמן', 'Coach settings')}</Text>
        </Pressable>
      </Sheet>

      <Sheet open={sheet === 'week'} onClose={() => setSheet(null)} title={tr("השבוע", 'This week')}>
        {week && weekVerdict(week) && <Text style={[T.base, { fontSize: 15, lineHeight: 23 }]}>{weekVerdict(week)}</Text>}
        {week && week.labels.length > 0 && (
          <View style={{ gap: 6 }}>
            <Text style={[T.bold, s.small]}>{tr('קלוריות ביום', 'Calories a day')}</Text>
            <TargetBars values={week.kcal} labels={week.labels} target={GOALS.calories} height={70} />
            <Text style={[T.bold, s.small, { marginTop: 6 }]}>{tr('חלבון ביום', 'Protein a day')}</Text>
            <TargetBars values={week.protein} labels={week.labels} target={GOALS.proteinG} overIsBad={false} height={70} />
            <Text style={[T.bold, s.small, { marginTop: 6 }]}>{tr('שעות שינה', 'Hours of sleep')}</Text>
            <TargetBars values={week.sleep} labels={week.labels} target={GOALS.sleepHours} overIsBad={false} height={70} />
          </View>
        )}
        <Text style={[T.muted, { fontSize: 13, lineHeight: 20 }]}>{tr('הקו המקווקו בכל גרף הוא היעד. היום עצמו עוד לא נגמר, ולכן הוא לא נכנס לממוצע.', 'The dashed line in each chart is the goal. Today is not over yet, so it is not in the average.')}</Text>
      </Sheet>

      <Sheet open={sheet === 'quality'} onClose={() => setSheet(null)} title={tr("איכות נתונים", 'Data quality')}>
        {data?.quality.map((q) => (
          <View key={q.label} style={{ gap: 2 }}>
            <View style={s.qualityHead}>
              <View style={[s.dot, { backgroundColor: QUALITY_COLOR[q.quality] }]} />
              <Text style={[T.bold, s.small]}>{q.label}</Text>
              <Text style={[T.muted, s.small]}>{q.source}</Text>
            </View>
            {q.hint ? <Text style={[T.muted, s.hint]}>{q.hint}</Text> : null}
          </View>
        ))}
      </Sheet>
    </Screen>
    <WaterWave active={bursting} count={burst} ml={sit?.waterMl ?? 0} target={sit?.waterTarget ?? 0} cup={prefs.waterContainer ?? 250} />
    </View>
  );
}

function Checklist({
  sit,
  prefs,
  onAction,
  onUndoWater,
  onDrink,
  devices,
  unlogged,
  follow,
}: {
  follow: Record<string, FollowUp>;
  devices: { watch?: WatchKind; foodApp?: FoodAppKind };
  unlogged: string[];
  sit: Situation;
  prefs: CoachPrefs;
  onAction: (k: CheckAction) => void;
  onUndoWater: () => void;
  onDrink: (ml: number) => void;
}) {
  const items = checklist({
    now: new Date(),
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
    mealTimes: sit.meals.map((m) => m.time),
    mealSlots: prefs.mealSlots,
    sleepMinutes: sit.today?.sleepMinutes ?? null,
    lastStepsAt: sit.lastStepsAt,
    waterContainer: prefs.waterContainer,
    activityAppName: activityApp(devices.watch)?.name ?? null,
    foodAppName: devices.foodApp === 'other' ? null : foodApp(devices.foodApp)?.name ?? null,
    hasWatch: devices.watch === undefined ? undefined : hasWatch(devices.watch),
    unloggedSlots: unlogged,
  });
  const shown = items;
  const open = shown.filter((i) => !i.done);
  const doneCount = shown.length - open.length;
  // Only what is still open, three at most; the rest is one tap away
  const [all, setAll] = useState(false);
  const visible = all ? shown : open.slice(0, 3);
  // "Got it" on something still not done: when, and whether the time already passed
  const [detail, setDetail] = useState<string | null>(null);
  const flagOf = (key: string) => {
    const f = Object.values(follow).find((x) => checklistKeyOf(x.key) === key);
    if (!f) return null;
    const hm = (t: number) => new Date(t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
    return Date.now() >= f.dueAt
      ? { overdue: true, text: tr(`הבנתי ב${hm(f.ackAt)}, אבל לא בוצע`, `Got it at ${hm(f.ackAt)}, but not done`) }
      : { overdue: false, text: tr(`הבנתי ב${hm(f.ackAt)}, אבדוק שוב ב${hm(f.dueAt)}`, `Got it at ${hm(f.ackAt)}, I will check again at ${hm(f.dueAt)}`) };
  };
  // Short chips instead of a list: what is left first, done ones crossed out. Water has its own tile.
  const chipItems = [...open, ...shown.filter((i) => i.done)].filter((i) => i.key !== 'water');
  const shortOf = (d: string) => {
    const first = d.split(',')[0].trim();
    return first.length <= 14 ? first : '';
  };
  const icon = (key: string, done: boolean) =>
    done ? (
      <Ionicons name="checkmark" size={16} color={C.good} />
    ) : (
      <Ionicons
        name={key === 'train' ? 'barbell-outline' : key === 'weigh' ? 'scale-outline' : key === 'meals' ? 'restaurant-outline' : key === 'sync' ? 'sync-outline' : 'ellipse-outline'}
        size={16}
        color={C.ink}
      />
    );
  void all;
  void setAll;
  void doneCount;
  return (
    <View style={s.chips}>
      {chipItems.map((i) => {
        const extra = !i.done ? shortOf(i.detail) : '';
        return (
          <Chip
            key={i.key}
            label={extra ? `${i.label} · ${extra}` : i.label}
            done={i.done}
            urgent={!i.done && (!!flagOf(i.key)?.overdue || (i.key === 'train' && !!i.extra))}
            icon={icon(i.key, i.done)}
            onPress={() => (i.done || !i.action ? setDetail(i.key) : onAction(i.action.key))}
          />
        );
      })}
      <Sheet open={!!detail} onClose={() => setDetail(null)} title={shown.find((x) => x.key === detail)?.label}>
        {(() => {
          const i = shown.find((x) => x.key === detail);
          if (!i) return null;
          const f = flagOf(i.key);
          return (
            <Card>
              <Text style={[T.base, { fontSize: 15, lineHeight: 23 }]}>{i.detail}</Text>
              {!i.done && f && <Text style={[T.bold, { fontSize: 14, color: f.overdue ? C.signal : C.muted }]}>{f.text}</Text>}
              {i.action && i.key !== 'water' && (
                <PrimaryButton
                  label={i.action.label}
                  onPress={() => {
                    setDetail(null);
                    onAction(i.action!.key);
                  }}
                />
              )}
              {i.extra && (
                <PrimaryButton
                  label={i.extra.label}
                  onPress={() => {
                    setDetail(null);
                    onAction(i.extra!.key);
                  }}
                />
              )}
            </Card>
          );
        })()}
      </Sheet>
    </View>
  );
}

/** The one thing that matters right now, on top of the screen. The coach's message is one line; tap for all of it. */
function NowCard({
  line,
  nudge,
  onOpen,
  more = 0,
  onJournal,
  children,
}: {
  line: string;
  nudge: SentMessage | null;
  onOpen: () => void;
  onGotIt: (id: string) => void;
  /** Coach messages today; the journal is one tap away instead of its own row */
  more?: number;
  onJournal?: () => void;
  children?: ReactNode;
}) {
  const at = nudge ? new Date(nudge.at).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <View style={s.now}>
      <View style={s.nowHead}>
        <Text style={[T.muted, s.nowLabel]}>{tr('עכשיו', 'Now')}</Text>
        {more > 0 && onJournal && (
          <Pressable onPress={onJournal} hitSlop={8}>
            <Text style={[T.base, { fontSize: 12, color: '#BDB8B0' }]}>{more === 1 ? tr('הודעה אחת מהמאמן היום', 'One message from the coach today') : tr(`${more} הודעות מהמאמן היום`, `${more} messages from the coach today`)}</Text>
          </Pressable>
        )}
      </View>
      <Text style={[T.bold, s.nowLine]} numberOfLines={3}>
        {line}
      </Text>
      {nudge && nudge.body !== line && (
        <Pressable onPress={onOpen} style={s.nowNudgeRow} hitSlop={6}>
          <Text style={[T.base, s.nowNudge, { flex: 1 }]} numberOfLines={1}>
            {at} · {nudge.title}
          </Text>
          <Ionicons name={CHEVRON_ON} size={16} color="#C9C6C0" />
        </Pressable>
      )}
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  rowsCard: { backgroundColor: C.card, borderRadius: 20, paddingHorizontal: 18 },
  openLine: { flexDirection: ROW, alignItems: 'center', gap: 10, paddingVertical: 14 },
  openLineSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.track },
  openSub: { flexDirection: ROW, alignItems: 'center', gap: 6 },
  whyRow: { flexDirection: ROW, alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.track },
  whyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.signal },
  outRow: { flexDirection: ROW, gap: 10, flexWrap: 'wrap' },
  outTime: { flexDirection: ROW, justifyContent: 'space-between', alignItems: 'center' },
  ghostBtn: { borderWidth: 1, borderColor: C.track, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: C.card },
  nightRow: { flexDirection: ROW, gap: 10 },
  nightBtn: { backgroundColor: C.ink, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  nightText: { color: '#fff', fontSize: 14, textAlign: 'center' },
  checkHead: { flexDirection: ROW, alignItems: 'center', gap: 10 },
  mark: { width: 22, alignItems: 'center' },
  checkRow: { flexDirection: ROW, alignItems: 'center', gap: 10, paddingVertical: 4 },
  actBtn: { backgroundColor: C.ink, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10 },
  extraBtn: { borderWidth: 1.5, borderColor: C.ink, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 9 },
  openRow: { flexDirection: ROW, alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 18 },
  inlineLink: { flexDirection: ROW, alignItems: 'center', gap: 4, alignSelf: SIDE_START },
  undo: { borderWidth: 1, borderColor: C.track, borderRadius: 10, padding: 5 },
  rings: { flexDirection: ROW, justifyContent: 'space-between' },
  plus: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.water, alignItems: 'center', justifyContent: 'center' },
  minus: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: C.water, alignItems: 'center', justifyContent: 'center' },
  weightCard: { backgroundColor: C.card, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 18, flexDirection: ROW, alignItems: 'center', gap: 12 },
  weightChip: { fontSize: 13, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  chips: { flexDirection: ROW, flexWrap: 'wrap', gap: 8 },
  nowHead: { flexDirection: ROW, justifyContent: 'space-between', alignItems: 'center' },
  now: { backgroundColor: C.ink, borderRadius: 28, padding: 20, gap: 10 },
  nowLabel: { color: C.signal, fontSize: 12, letterSpacing: 1 },
  nowLine: { color: '#fff', fontSize: 21, lineHeight: 30 },
  nowNudge: { color: '#C9C6C0', fontSize: 14, lineHeight: 21 },
  nowNudgeRow: { flexDirection: ROW, alignItems: 'flex-start', gap: 10 },
  nowGotIt: { borderWidth: 1, borderColor: '#fff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  nowBtn: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  nowBtnText: { color: C.ink, fontSize: 14, textAlign: 'center' },
  small: { fontSize: 14 },
  qualityRow: { flexDirection: ROW, justifyContent: 'space-between', alignItems: 'center' },
  dots: { flexDirection: ROW, gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  qualityHead: { flexDirection: ROW, alignItems: 'center', gap: 8 },
  hint: { fontSize: 13, marginRight: 18 },
});

/** At the gym: how long he has been there, when the day counts as a workout, and today's exercises */
function GymNowCard({ since, via, counted, onOpen }: { since: number; via?: string; counted: boolean; onOpen: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const minutes = Math.max(0, Math.round((now - since) / 60000));
  const left = Math.max(0, GYM_MIN - minutes);
  const pct = Math.min(1, minutes / GYM_MIN);
  const d = new Date();
  const todays = planThisWeek(d).find((w) => w.day === d.getDay());
  const session = sessionOf(todays?.session ?? nextWorkout(d).workout.session);
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [gymS.card, pressed && { opacity: 0.9 }]}>
      <View style={{ flexDirection: ROW, justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={[T.bold, { fontSize: 13, color: C.signal }]}>{tr('בחדר הכושר ·', 'At the gym ·')} {minutes} {tr('דק\'', 'min')}</Text>
        {via ? <Text style={[T.base, { fontSize: 12, color: '#B8B1A7' }]}>{tr('לפי', 'by')} {via}</Text> : null}
      </View>
      <Text style={[T.bold, { fontSize: 22, color: '#fff' }]}>{session.title}</Text>
      <View style={{ gap: 6 }}>
        <View style={gymS.track}>
          <View style={[gymS.fill, { width: `${(counted ? 1 : pct) * 100}%` }]} />
        </View>
        <Text style={[T.base, { fontSize: 13, color: '#D6D2CC' }]}>
          {counted || left === 0 ? tr('האימון נספר. תמשיך כמה שצריך.', 'The workout counts. Keep going as long as you need.') : tr(`עוד ${left} דקות והיום נספר כאימון`, `${left} more minutes and today counts as a workout`)}
        </Text>
      </View>
      <View style={{ flexDirection: ROW, flexWrap: 'wrap', gap: 6 }}>
        {session.exercises.slice(0, 3).map((e) => (
          <Text key={e.name} style={gymS.move}>
            {e.name} {e.sets}×{e.reps}
          </Text>
        ))}
        {session.exercises.length > 3 && <Text style={gymS.move}>{tr('ועוד', 'and')} {session.exercises.length - 3}</Text>}
      </View>
    </Pressable>
  );
}

const gymS = StyleSheet.create({
  card: { backgroundColor: C.ink, borderRadius: 26, padding: 18, gap: 12 },
  track: { height: 6, borderRadius: 3, backgroundColor: '#3A3733', overflow: 'hidden', flexDirection: ROW },
  fill: { height: 6, borderRadius: 3, backgroundColor: C.signal },
  move: { fontFamily: T.base.fontFamily, fontSize: 13, color: '#fff', backgroundColor: '#2C2A27', borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10, overflow: 'hidden' },
});
