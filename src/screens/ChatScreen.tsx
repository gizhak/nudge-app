import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Dimensions, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { runCoach } from '../coach/engine';
import { ackTopic, didIt, doneSince, loadActed } from '../coach/followupStore';
import { dayKey, loadLog, loadPrefs, loadSnoozes, markSkipped, SentMessage } from '../coach/store';
import { addWater, readWaterToday } from '../health/water';
import { Container, waterText } from '../nutrition/water';
import { Route, routeFor } from '../notifications/route';
import { Gear } from '../ui/gear';
import { C, T } from '../ui/theme';
import { topicLook } from './CoachJournal';
import { loadReplies, mergeReplies, Reply, WORKOUT_TOPICS } from '../coach/replies';
import React from 'react';
import { Meal, readMeals, readWeights } from '../health/history';
import { plateMeal, plates } from '../nutrition/meals';
import { readHourFacts } from '../coach/dayFacts';
import { drinkReply, seedOf } from '../coach/voice';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadProfile } from '../profile/profile';
import { acceptGuess, rejectGuess, wifiCheck } from '../coach/wifi';
import { lookNow } from '../coach/look';
import { markSeen } from '../coach/unread';
import { answerProposal } from '../coach/proposals';
import { noteChange } from '../coach/replies';
import SleepEntry, { hoursText } from './SleepEntry';
import WorkoutFeel from '../train/WorkoutFeel';
import { SLEEP_MISSING, SLEEP_MISSING2 } from '../sleep/ask';
import { checkFood, CheckResult } from '../diet/check';
import { loadMenu, todayPicks } from '../diet/store';
import { hideMeal, setPortion } from '../health/hiddenMeals';
import { openZepp } from '../apps/zepp';

import { ROW, SIDE_END, SIDE_START, START, LOCALE, t as tr } from '../i18n';
const WATCH_CHANGED =
  tr('ככה מחברים שעון חדש:\n1. באפליקציה של השעון החדש (ל Bip Max זו Zepp) מפעילים סנכרון ל Health Connect.\n2. ב Health Connect, בהרשאות של אותה אפליקציה, מאשרים לה לכתוב שינה, צעדים, דופק ואימונים.\n3. ב Nudge, בהגדרות, מעדכנים את סוג השעון.\nמהלילה הבא הנתונים אמורים להגיע.', 'This is how to connect a new watch:\n1. In the new watch\'s app (for the Bip Max it is Zepp), turn on sync to Health Connect.\n2. In Health Connect, in that app\'s permissions, allow it to write sleep, steps, heart rate and workouts.\n3. In Nudge, in settings, update the watch type.\nFrom tonight the data should arrive.');
const NOTHING_CHANGED =
  tr('אז כנראה הסנכרון נתקע.\n1. פתח את אפליקציית השעון ותן לה דקה לסנכרן מהשעון.\n2. ב Health Connect, בדוק שהיא עדיין מורשית לכתוב שינה.\nאם מחר בבוקר עדיין אין נתון, תגיד לי.', 'Then the sync is probably stuck.\n1. Open the watch app and give it a minute to sync from the watch.\n2. In Health Connect, check it is still allowed to write sleep.\nIf there is still no data tomorrow morning, tell me.');

/** "What I'm going to eat" and the coach's answer; kept for the day */
type Check = { at: number; text: string; src: 'text' | 'zepp'; result: CheckResult; mealId?: string; mealKey?: string; mealIds?: { id: string; key?: string }[]; mealName?: string; ate?: 'all' | 'half' | 'none'; reply?: string };
const CHECKS = 'chat.checks.v1';

type Mine = { at: number; icon: React.ComponentProps<typeof Ionicons>['name']; color: string; text: string; sub?: string; water?: boolean; reply?: string };

const drankText = (ml: number, container: number) =>
  container === 30
    ? Math.round(ml / 30) === 1
      ? tr('לגימה אחת', 'one sip')
      : tr(`${Math.round(ml / 30)} לגימות`, `${Math.round(ml / 30)} sips`)
    : container === 250
      ? ml <= 250
        ? tr('כוס', 'a glass')
        : tr(`${Math.round((ml / 250) * 10) / 10} כוסות`, `${Math.round((ml / 250) * 10) / 10} glasses`)
      : tr(`${Math.round(ml / 100) / 10} ליטר`, `${Math.round(ml / 100) / 10} liters`);

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** What he did today, from the data: meals, the weigh-in, workouts. Shown as his side of the chat. */
async function readDoings(): Promise<Mine[]> {
  const out: Mine[] = [];
  const [meals, weights, hf] = await Promise.all([
    readMeals().catch(() => [] as Meal[]),
    readWeights(2).catch(() => [] as { date: Date; kg: number }[]),
    readHourFacts().catch(() => null),
  ]);
  for (const plate of plates(meals)) {
    const p = plateMeal(plate);
    out.push({ at: plate[0].time.getTime(), icon: 'restaurant', color: '#E3B26B', text: tr(`אכלתי: ${p.name}`, `I ate: ${p.name}`), sub: tr(`${fmt(p.kcal)} קלוריות · ${fmt(p.protein)} ג' חלבון`, `${fmt(p.kcal)} calories · ${fmt(p.protein)} g protein`) });
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const w of weights) if (w.date.getTime() >= today.getTime()) out.push({ at: w.date.getTime(), icon: 'scale-outline', color: '#9FD3B0', text: tr(`נשקלתי: ${w.kg.toFixed(1)} ק"ג`, `I weighed in: ${w.kg.toFixed(1)} kg`) });
  for (const x of hf?.workouts ?? []) out.push({ at: x.end, icon: x.run ? 'walk' : 'barbell', color: '#F2A58E', text: tr(`${x.run ? 'רצתי' : 'התאמנתי'} ${x.minutes} דקות`, `${x.run ? 'I ran' : 'I trained'} ${x.minutes} minutes`) });
  return out;
}

const time = (at: number) => new Date(at).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
const baseOf = (id: string) => id.split('@')[0];
const keyOf = (id: string) => (/^meal_\d+$/.test(id) ? 'food' : /^status_\d+$/.test(id) ? 'status' : baseOf(id));

/** What the button inside a message does, by topic. */
function actionOf(m: SentMessage, container = 250): { label: string; kind: 'water' | 'route' | 'gym' | 'proposal' | 'sleep' | 'sleep2'; ml?: number } | null {
  const k = baseOf(m.id);
  if (k === 'proposal') return { label: tr('כן, לעדכן', 'Yes, update'), kind: 'proposal' };
  if (k === SLEEP_MISSING) return { label: tr('לא ענדתי', 'I didn\'t wear it'), kind: 'sleep' };
  if (k === SLEEP_MISSING2) return { label: tr('החלפתי שעון', 'I changed watches'), kind: 'sleep2' };
  if (k === 'wifi_guess') return { label: tr('כן, זה חדר הכושר', 'Yes, that\'s the gym'), kind: 'gym' };
  if (k === 'water' || k === 'water_morning') {
    if (container === 30) return { label: tr('10 לגימות', '10 sips'), kind: 'water', ml: 300 };
    if (container > 250) return { label: tr('חצי בקבוק', 'Half a bottle'), kind: 'water', ml: container / 2 };
    return { label: tr('שתיתי כוס', 'I drank a glass'), kind: 'water', ml: 250 };
  }
  if (/^(weigh_in|weigh_reminder)/.test(k)) return { label: tr('לשקילה', 'To weigh-in'), kind: 'route' };
  if (k === 'workout_done') return null;
  if (/^(workout_|missed_workout|week_behind|long_break|home_before_workout)/.test(k)) return { label: tr('לאימון', 'To the workout'), kind: 'route' };
  if (/^(food_none|protein_evening|leave_office_protein|pre_workout_snack|meal_reminder)/.test(k)) return { label: tr('לתזונה', 'To food'), kind: 'route' };
  if (k === 'run') return { label: tr('לריצה', 'To the run'), kind: 'route' };
  if (k === 'craving_evening') return { label: tr('בא לי משהו', 'I feel like something'), kind: 'route' };
  return null;
}

/** A conversation with the coach: his messages on the right, your answers on the left, today. */
export default function ChatScreen({ onRoute, tick = 0 }: { onRoute: (r: Route) => void; tick?: number }) {
  const [log, setLog] = useState<SentMessage[] | null>(null);
  const [quiet, setQuiet] = useState<Record<string, number>>({});
  const [acted, setActed] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [doings, setDoings] = useState<Mine[]>([]);
  const [who, setWho] = useState<{ name?: string; target: number }>({ target: 0 });
  const [container, setContainer] = useState(250);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  /** The message whose night is being entered by hand */
  const [sleepFor, setSleepFor] = useState<SentMessage | null>(null);
  const scroll = useRef<ScrollView>(null);
  // What was new when the chat opened: outlined once, then it counts as seen
  const [newSince, setNewSince] = useState<number | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [draft, setDraft] = useState('');
  const [checking, setChecking] = useState(false);
  const saveChecks = async (next: Check[]) => {
    setChecks(next);
    await AsyncStorage.setItem(CHECKS, JSON.stringify({ day: dayKey(), checks: next })).catch(() => undefined);
  };
  /** A food check: typed words, or the last meal Zepp read from a photo */
  const wasChecked = (id: string) => checks.some((c) => c.mealId === id || c.mealIds?.some((x) => x.id === id));
  const runCheck = async (src: 'text' | 'zepp', given?: Meal) => {
    if (checking) return;
    const text = draft.trim();
    if (src === 'text' && !text) return;
    setChecking(true);
    try {
      const [menu, picks, meals] = await Promise.all([loadMenu().catch(() => null), todayPicks().catch(() => ({})), readMeals().catch(() => [] as Meal[])]);
      const now = new Date();
      let item: Check;
      if (src === 'zepp') {
        const last = given ?? [...meals].reverse().find((m) => now.getTime() - m.time.getTime() < 90 * 60000);
        if (!last) return;
        // One photo can come from Zepp as a record per food (rice, beans), all at the same minute: one plate
        const plate = meals.filter((m) => Math.abs(m.time.getTime() - last.time.getTime()) <= 3 * 60000 && !wasChecked(m.id));
        if (!plate.some((m) => m.id === last.id)) plate.push(last);
        const ids = new Set(plate.map((m) => m.id));
        const others = meals.filter((m) => !ids.has(m.id));
        const name = plate.map((m) => m.name).join(', ');
        const kcal = plate.reduce((a, m) => a + m.kcal, 0);
        const protein = plate.reduce((a, m) => a + m.protein, 0);
        const result = checkFood(name, { menu, picks, now, eatenKcal: others.reduce((a, m) => a + m.kcal, 0), eatenProtein: others.reduce((a, m) => a + m.protein, 0), logged: { kcal, protein } });
        item = { at: now.getTime(), text: tr('צילמתי ב Zepp, תבדוק', 'I snapped it in Zepp, check it'), src, result, mealId: last.id, mealKey: last.key, mealIds: plate.map((m) => ({ id: m.id, key: m.key })), mealName: `${name} · ${Math.round(kcal)} ${tr("קל'", 'kcal')}` };
      } else {
        const result = checkFood(text, { menu, picks, now, eatenKcal: meals.reduce((a, m) => a + m.kcal, 0), eatenProtein: meals.reduce((a, m) => a + m.protein, 0) });
        item = { at: now.getTime(), text, src, result };
        setDraft('');
      }
      await saveChecks([...checks, item]);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 200);
    } finally {
      setChecking(false);
    }
  };
  // ---- The camera: a fresh Zepp meal not checked yet is checked now; otherwise Zepp opens, and the
  // meal is waited for when he comes back (every 20 seconds, for 3 minutes after the return)
  // The keyboard covers the bottom of the screen: the chat ends above it, so the input stays in view.
  // The tab bar under the chat is covered anyway; when the window itself shrank, only the rest.
  const rootRef = useRef<View>(null);
  const below = useRef(0);
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const shrunk = Math.max(0, WIN0 - Dimensions.get('window').height);
      setKb(Math.max(0, e.endCoordinates.height - shrunk - below.current));
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 120);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const measure = () => {
    if (kb) return;
    rootRef.current?.measureInWindow((_x, y, _w, h) => {
      below.current = Math.max(0, Dimensions.get('window').height - (y + h));
    });
  };
  const [wait, setWait] = useState<{ since: number; back?: number; failed?: boolean } | null>(null);
  const freshMeal = async (since: number): Promise<Meal | undefined> => {
    const meals = await readMeals().catch(() => [] as Meal[]);
    return [...meals].reverse().find((m) => m.time.getTime() >= since && !wasChecked(m.id));
  };
  const camera = async () => {
    if (checking) return;
    const ready = await freshMeal(Date.now() - 90 * 60000);
    if (ready) {
      setWait(null);
      await runCheck('zepp', ready);
      return;
    }
    // A photo is dated when it is taken, a little before the return; five minutes of slack
    setWait({ since: Date.now() - 5 * 60000 });
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 200);
    await openZepp();
  };
  useEffect(() => {
    if (!wait || wait.failed) return;
    let stop = false;
    // The 3 minutes start when he comes back from Zepp, not when the camera was tapped
    let back = wait.back;
    const look = async () => {
      if (stop || AppState.currentState !== 'active') return;
      const m = await freshMeal(wait.since);
      if (stop) return;
      const from = back ?? wait.since + 5 * 60000 + 7 * 60000;
      if (m) {
        setWait(null);
        await runCheck('zepp', m);
      } else if (Date.now() - from > 3 * 60000) setWait((w) => (w ? { ...w, failed: true } : w));
    };
    const id = setInterval(look, 20000);
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      if (back == null) {
        back = Date.now();
        setWait((w) => (w ? { ...w, back } : w));
      }
      look();
    });
    return () => {
      stop = true;
      clearInterval(id);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wait?.since, wait?.failed, checks.length]);

  /** After a Zepp check: all of it, half, or none (left out here; Zepp keeps its record) */
  const ate = async (c: Check, how: 'all' | 'half' | 'none') => {
    // Every record of the plate: "I did not eat it" takes the beans off along with the rice
    for (const m of c.mealIds ?? (c.mealId ? [{ id: c.mealId, key: c.mealKey }] : [])) {
      if (how === 'none') await hideMeal(m.id, Date.now(), m.key).catch(() => undefined);
      else await setPortion(m.id, how === 'half' ? 0.5 : 1, m.key).catch(() => undefined);
    }
    const reply =
      how === 'all'
        ? tr('נספר כמו שנרשם.', 'Counted as logged.')
        : how === 'half'
          ? tr('נספר אצלי חצי. ב Zepp רשומה המנה המלאה, אם תרצה שיתאים גם שם, תתקן שם.', 'I count half. Zepp has the full meal; to match there too, fix it in Zepp.')
          : tr('הסרתי את זה מהחשבון אצלי. ב Zepp זה עדיין רשום כמנה שנאכלה, כדאי למחוק שם.', 'I took it off the count here. Zepp still has it as eaten, worth deleting it there.');
    await saveChecks(checks.map((x) => (x.at === c.at ? { ...x, ate: how, reply } : x)));
  };
  useEffect(() => {
    AsyncStorage.getItem(CHECKS)
      .then((raw) => {
        const d = JSON.parse(raw ?? 'null');
        if (d && d.day === dayKey()) setChecks(d.checks ?? []);
      })
      .catch(() => undefined);
  }, [tick]);
  useEffect(() => {
    markSeen().then((before) => setNewSince(before || null));
  }, []);

  const load = useCallback(async () => {
    const [l, q, a] = await Promise.all([loadLog(), loadSnoozes(), loadActed()]);
    setLog(l.filter((m) => m.day === dayKey()).sort((x, y) => x.at - y.at));
    setQuiet(q);
    setActed(a);
    setReplies(await loadReplies());
    // Looking at the chat: what just came in is seen too
    markSeen().catch(() => 0);
    readDoings().then(setDoings).catch(() => undefined);
    try {
      const t = JSON.parse((await AsyncStorage.getItem('coach.waterTarget.v1')) ?? 'null');
      const pr = await loadProfile();
      setWho({ name: pr.name?.trim() || undefined, target: t && t.day === dayKey() ? t.target : 0 });
    } catch {
      // the reply works without them
    }
    setContainer((await loadPrefs()).waterContainer ?? 250);
  }, []);
  useEffect(() => {
    load();
    // Opening the chat looks for anything new (a meal just logged) and shows the answer
    lookNow().then((n) => {
      if (n > 0) load();
    });
    const sub = AppState.addEventListener('change', (st) => st === 'active' && load());
    return () => sub.remove();
  }, [load, tick]);

  if (!log) return <ActivityIndicator style={{ marginTop: 80 }} color={C.ink} />;

  // Only the latest message of a topic carries the answer and the buttons
  const latestOf = new Map<string, number>();
  for (const m of log) latestOf.set(keyOf(m.id), m.at);

  const answer = async (m: SentMessage) => {
    await ackTopic(baseOf(m.id));
    await load();
  };
  /** His answer and the coach's reply, kept in the chat */
  const say = async (m: SentMessage, text: string, reply: string) => {
    await noteChange(text, reply).catch(() => undefined);
    await ackTopic(baseOf(m.id)).catch(() => undefined);
    await load();
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 200);
  };
  const act = async (m: SentMessage) => {
    const a = actionOf(m, container);
    if (!a) return;
    if (a.kind === 'water') {
      try {
        await addWater(a.ml);
        await didIt(['water']);
        const total = await readWaterToday().catch(() => null);
        setNote({ text: tr(`נרשם: ${a.label}.${total != null ? ` היום ${waterText(total, container as Container)}.` : ''}`, `Logged: ${a.label}.${total != null ? ` Today ${waterText(total, container as Container)}.` : ''}`) });
      } catch (e: any) {
        setNote({ text: tr(`לא נשמר: ${String(e?.message ?? e)}. בדוק את הרשאת המים בבדיקת מוכנות.`, `Not saved: ${String(e?.message ?? e)}. Check the water permission in Readiness.`), bad: true });
      }
      setTimeout(() => setNote(null), 4000);
      return load();
    }
    if (a.kind === 'proposal') {
      const reply = await answerProposal(true).catch(() => '');
      await ackTopic('proposal').catch(() => undefined);
      if (reply) setNote({ text: reply });
      setTimeout(() => setNote(null), 4000);
      return load();
    }
    if (a.kind === 'sleep') {
      setSleepFor(m);
      return;
    }
    if (a.kind === 'sleep2') return say(m, tr('החלפתי שעון', 'I changed watches'), WATCH_CHANGED);
    if (a.kind === 'gym') {
      const ok = await acceptGuess().catch(() => false);
      await ackTopic('wifi_guess').catch(() => undefined);
      setNote(ok ? { text: tr('שמרתי. מעכשיו אזהה את חדר הכושר לפי הרשת.', 'Saved. From now I will recognize the gym by its network.') } : { text: tr('הרשת כבר לא נראית. אפשר להגדיר אותה בהגדרות, תחת Wi-Fi.', 'The network is no longer in range. You can set it in settings, under Wi-Fi.'), bad: true });
      setTimeout(() => setNote(null), 4000);
      if (ok) {
        const arrived = await wifiCheck().catch(() => null);
        if (arrived) await runCoach(arrived).catch(() => undefined);
      }
      return load();
    }
    onRoute(routeFor(baseOf(m.id)));
  };
  const ask = async () => {
    setBusy(true);
    try {
      await runCoach(undefined, new Date(), { manual: true });
    } finally {
      setBusy(false);
      await load();
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 200);
    }
  };

  return (
    <View ref={rootRef} onLayout={measure} style={{ flex: 1, backgroundColor: C.bg, paddingBottom: kb }}>
      <View style={s.head}>
        <View style={s.avatar}>
          <View style={s.avatarDot} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[T.bold, { fontSize: 22 }]}>{tr('המאמן', 'The coach')}</Text>
          <Text style={[T.muted, { fontSize: 13 }]}>{log.length ? tr(`${log.length} הודעות היום`, `${log.length} messages today`) : tr('עוד לא היו הודעות היום', 'No messages today yet')}</Text>
        </View>
        <Gear />
      </View>

      <ScrollView ref={scroll} contentContainerStyle={s.list} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        {(() => {
          const coachTimes = log.map((x) => x.at);
          const drinks = mergeReplies(replies, coachTimes);
          const mineItems: Mine[] = [
            ...(() => {
              // Each reply knows the one before it, so two in a row never read the same
              const prev: string[] = [];
              return [...drinks].sort((a, b) => a.at - b.at).map((r) => {
                const reply = r.total != null ? drinkReply(r.total, who.target, seedOf(`drink${r.at}`), who.name, prev.slice(-2)) : undefined;
                if (reply) prev.push(reply);
                return { at: r.at, icon: 'water' as const, color: '#9CC3EA', text: tr(`שתיתי ${drankText(r.ml, container)}`, `I drank ${drankText(r.ml, container)}`), sub: r.total != null ? tr(`היום ${Math.round(r.total / 100) / 10} ליטר`, `Today ${Math.round(r.total / 100) / 10} liters`) : undefined, water: true, reply };
              });
            })(),
            ...doings,
            // His changes to the workout, each with the coach's answer
            ...replies
              .filter((r) => r.kind === 'plan' && r.text)
              .map((r) => ({ at: r.at, icon: 'calendar' as const, color: '#E9B872', text: r.text!, reply: r.reply })),
          ];
          // Workout messages sent before his last change to the plan are moot now
          const lastChange = Math.max(0, ...replies.filter((r) => r.kind === 'plan').map((r) => r.at));
          type Item = { at: number; coach?: SentMessage; me?: Mine; check?: Check };
          const items: Item[] = [...log.map((m) => ({ at: m.at, coach: m })), ...mineItems.map((x) => ({ at: x.at, me: x })), ...checks.map((c) => ({ at: c.at, check: c }))].sort((a, b) => a.at - b.at);
          let lastStamp = 0;
          return items.map((it, i) => {
            const stamp = it.at - lastStamp > 15 * 60000;
            if (stamp) lastStamp = it.at;
            const stampEl = stamp ? <Text style={s.stamp}>{time(it.at)}</Text> : null;
            if (it.check) {
              const c = it.check;
              const r = c.result;
              const good = r.verdict === 'on' || r.verdict === 'fits';
              return (
                <View key={'check' + c.at} style={{ gap: 8 }}>
                  {stampEl}
                  <View style={s.me}>
                    <Ionicons name={c.src === 'zepp' ? 'camera' : 'restaurant'} size={15} color="#E9B872" />
                    <Text style={[T.bold, { fontSize: 15, color: '#fff', flexShrink: 1 }]}>{c.text}</Text>
                  </View>
                  <View style={s.coach}>
                    {c.mealName && <Text style={[T.muted, { fontSize: 12.5 }]}>{tr(`Zepp זיהה: ${c.mealName}`, `Zepp read: ${c.mealName}`)}</Text>}
                    <View style={{ flexDirection: ROW, gap: 6, flexWrap: 'wrap' }}>
                      <Text style={[s.pill, { backgroundColor: good ? '#E6F0E9' : '#FDF1EC', color: good ? '#3E7A55' : '#B4532A' }]}>{r.pill}</Text>
                      {r.where && <Text style={[s.pill, { backgroundColor: C.bg, color: C.muted }]}>{r.where}</Text>}
                    </View>
                    <Text style={[T.bold, { fontSize: 16, lineHeight: 22 }]}>{r.headline}</Text>
                    {r.rows.map((row, k) => (
                      <View key={k} style={{ flexDirection: ROW, gap: 8, alignItems: 'baseline' }}>
                        <Text style={[T.bold, { fontSize: 14, minWidth: 16, textAlign: 'center', color: row.mark === '✓' ? '#3E7A55' : row.mark === '+' ? '#B4532A' : C.muted }]}>{row.mark}</Text>
                        <Text style={[T.base, { fontSize: 14, flex: 1, lineHeight: 20 }]}>{row.text}</Text>
                        {row.kcal != null && <Text style={[T.muted, { fontSize: 12.5 }]}>{tr(`${Math.round(row.kcal)} קל'`, `${Math.round(row.kcal)} kcal`)}</Text>}
                      </View>
                    ))}
                    {r.total && <Text style={[T.muted, { fontSize: 13 }]}>{r.total}</Text>}
                    {r.note && <Text style={[T.base, { fontSize: 14, lineHeight: 20 }]}>{r.note}</Text>}
                    {c.src === 'zepp' && !c.ate && (
                      <View style={s.btns}>
                        <Pressable onPress={() => ate(c, 'all')} style={({ pressed }) => [s.btnDark, pressed && { opacity: 0.8 }]}>
                          <Text style={[T.bold, { fontSize: 14, color: '#fff' }]}>{tr('אכלתי הכל', 'Ate all of it')}</Text>
                        </Pressable>
                        <Pressable onPress={() => ate(c, 'half')} style={({ pressed }) => [s.btnLight, pressed && { opacity: 0.8 }]}>
                          <Text style={[T.bold, { fontSize: 14, color: C.ink }]}>{tr('אכלתי חצי', 'Ate half')}</Text>
                        </Pressable>
                        <Pressable onPress={() => ate(c, 'none')} style={({ pressed }) => [s.btnLight, pressed && { opacity: 0.8 }]}>
                          <Text style={[T.bold, { fontSize: 14, color: C.ink }]}>{tr('לא אכלתי את זה', 'Did not eat it')}</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                  {c.reply && (
                    <View style={s.coachShort}>
                      <Text style={[T.base, { fontSize: 15, lineHeight: 21 }]}>{c.reply}</Text>
                    </View>
                  )}
                </View>
              );
            }
            if (it.me) {
              const x = it.me;
              return (
                <View key={'me' + x.at + x.text} style={{ gap: 8 }}>
                  {stampEl}
                  <View style={s.me}>
                    <Ionicons name={x.icon} size={15} color={x.color} />
                    <View style={{ flexShrink: 1 }}>
                      <Text style={[T.bold, { fontSize: 15, color: '#fff' }]}>{x.text}</Text>
                      {x.sub ? <Text style={[T.base, { fontSize: 12, color: '#C9C6C0' }]}>{x.sub}</Text> : null}
                    </View>
                  </View>
                  {x.reply ? (
                    <View style={s.coachShort}>
                      <Text style={[T.base, { fontSize: 15, lineHeight: 21 }]}>{x.reply}</Text>
                    </View>
                  ) : null}
                </View>
              );
            }
            const m = it.coach!;
            const key = keyOf(m.id);
            const latest = latestOf.get(key) === m.at;
            const done = doneSince(acted, key, m.at);
            const acked = (quiet[baseOf(m.id)] ?? 0) > Date.now();
            const moot = lastChange > m.at && WORKOUT_TOPICS.includes(baseOf(m.id));
            const answerable = key !== 'food' && key !== 'status' && key !== 'workout_feel';
            const look = topicLook(m.id);
            const a = actionOf(m, container);
            const drankAfter = key.startsWith('water') && drinks.some((r) => r.at >= m.at);
            return (
              <View key={m.id + m.at} style={{ gap: 8 }}>
                {stampEl}
                <View style={[s.coach, newSince != null && m.at > newSince && s.coachNew]}>
                  <View style={s.tag}>
                    <Ionicons name={look.icon} size={13} color={look.color} />
                    <Text style={[T.bold, { fontSize: 12, color: C.muted }]}>{look.label}</Text>
                  </View>
                  <Text style={[T.bold, { fontSize: 16, lineHeight: 22 }]}>{m.title}</Text>
                  <Text style={[T.base, { fontSize: 15, lineHeight: 22, color: '#4A453F' }]}>{m.body}</Text>
                  {key === 'workout_feel' && <WorkoutFeel id={m.id} />}
                  {moot && <Text style={[T.muted, { fontSize: 13 }]}>{tr('עדכנת את האימון אחרי ההודעה הזו.', 'You updated the workout after this message.')}</Text>}
                  {latest && answerable && !done && !acked && !moot && (
                    <View style={s.btns}>
                      {a && (
                        <Pressable onPress={() => act(m)} style={({ pressed }) => [s.btnDark, pressed && { opacity: 0.8 }]}>
                          <Text style={[T.bold, { fontSize: 14, color: '#fff' }]}>{a.label}</Text>
                        </Pressable>
                      )}
                      {baseOf(m.id).startsWith('meal_reminder_') && (
                        <Pressable
                          onPress={async () => {
                            await markSkipped(baseOf(m.id).replace('meal_reminder_', '')).catch(() => undefined);
                            await say(m, tr('דילגתי', 'I skipped it'), tr('רשמתי. לא אזכיר עליה שוב היום, ולא צריך להשלים קלוריות.', 'Noted. I will not remind you about it again today, and there is no need to make up the calories.'));
                          }}
                          style={({ pressed }) => [s.btnLight, pressed && { opacity: 0.8 }]}
                        >
                          <Text style={[T.bold, { fontSize: 14, color: C.ink }]}>{tr('דילגתי', 'I skipped it')}</Text>
                        </Pressable>
                      )}
                      {a?.kind === 'proposal' ? (
                        <Pressable
                          onPress={async () => {
                            const reply = await answerProposal(false).catch(() => '');
                            await ackTopic('proposal').catch(() => undefined);
                            if (reply) setNote({ text: reply });
                            setTimeout(() => setNote(null), 4000);
                            load();
                          }}
                          style={({ pressed }) => [s.btnLight, pressed && { opacity: 0.8 }]}
                        >
                          <Text style={[T.bold, { fontSize: 14, color: C.ink }]}>{tr('לא עכשיו', 'Not now')}</Text>
                        </Pressable>
                      ) : a?.kind === 'sleep' ? (
                        <Pressable onPress={() => say(m, tr('לא יודע', 'I don\'t know'), tr('בסדר. הלילה הזה לא ייספר, לא לטובה ולא לרעה.', 'OK. This night will not count, for better or worse.'))} style={({ pressed }) => [s.btnLight, pressed && { opacity: 0.8 }]}>
                          <Text style={[T.bold, { fontSize: 14, color: C.ink }]}>{tr('לא יודע', 'I don\'t know')}</Text>
                        </Pressable>
                      ) : a?.kind === 'sleep2' ? (
                        <>
                          <Pressable onPress={() => say(m, tr('לא שיניתי כלום', 'I changed nothing'), NOTHING_CHANGED)} style={({ pressed }) => [s.btnLight, pressed && { opacity: 0.8 }]}>
                            <Text style={[T.bold, { fontSize: 14, color: C.ink }]}>{tr('לא שיניתי כלום', 'I changed nothing')}</Text>
                          </Pressable>
                          <Pressable onPress={() => setSleepFor(m)} style={({ pressed }) => [s.btnLight, pressed && { opacity: 0.8 }]}>
                            <Text style={[T.bold, { fontSize: 14, color: C.ink }]}>{tr('לא ענדתי', 'I didn\'t wear it')}</Text>
                          </Pressable>
                        </>
                      ) : a?.kind === 'gym' ? (
                        // A question gets its two answers, not "got it"
                        <Pressable
                          onPress={async () => {
                            await rejectGuess().catch(() => undefined);
                            await ackTopic('wifi_guess', new Date(), 24 * 3600 * 1000).catch(() => undefined);
                            setNote({ text: tr('בסדר, לא אשאל על הרשת הזו שוב.', 'OK, I will not ask about this network again.') });
                            setTimeout(() => setNote(null), 4000);
                            load();
                          }}
                          style={({ pressed }) => [s.btnLight, pressed && { opacity: 0.8 }]}
                        >
                          <Text style={[T.bold, { fontSize: 14, color: C.ink }]}>{tr('לא, זה לא חדר הכושר', 'No, that\'s not the gym')}</Text>
                        </Pressable>
                      ) : (
                        <Pressable onPress={() => answer(m)} style={({ pressed }) => [a ? s.btnLight : s.btnDark, pressed && { opacity: 0.8 }]}>
                          <Text style={[T.bold, { fontSize: 14, color: a ? C.ink : '#fff' }]}>{tr('הבנתי', 'Got it')}</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
                {latest && answerable && (done || acked) && !drankAfter && !moot && !key.startsWith('sleep_missing') && (
                  <View style={s.me}>
                    <Text style={[T.bold, { fontSize: 15, color: '#fff' }]}>{done ? tr('בוצע', 'Done') : tr('הבנתי', 'Got it')}</Text>
                    {done && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </View>
                )}
              </View>
            );
          });
        })()}
        {wait && (
          <View style={{ gap: 8 }}>
            <View style={s.me}>
              <Ionicons name="camera" size={15} color="#E9B872" />
              <Text style={[T.bold, { fontSize: 15, color: '#fff', flexShrink: 1 }]}>{tr('צילמתי ב Zepp, תבדוק', 'I snapped it in Zepp, check it')}</Text>
            </View>
            <View style={s.coach}>
              <View style={{ flexDirection: ROW, gap: 8, alignItems: 'center' }}>
                {!wait.failed && <ActivityIndicator color={C.ink} size="small" />}
                <Text style={[T.bold, { fontSize: 16, lineHeight: 22, flexShrink: 1, textAlign: START }]}>
                  {wait.failed ? tr('לא הגיעה ארוחה מ Zepp', 'No meal came from Zepp') : tr('מחכה ש Zepp ישלח את הארוחה', 'Waiting for Zepp to send the meal')}
                </Text>
              </View>
              <Text style={[T.base, { fontSize: 14, lineHeight: 20, textAlign: START }]}>
                {wait.failed
                  ? tr('אולי הצילום לא נשמר, או ש Zepp לא מסנכרן ל Health Connect. פתח את Zepp לכמה שניות ונסה שוב.', 'Maybe the photo was not saved, or Zepp is not syncing to Health Connect. Open Zepp for a few seconds and try again.')
                  : tr('אני בודק שוב כל 20 שניות, עד 3 דקות. אם זה לא מגיע, פתח את Zepp לכמה שניות כדי שיסנכרן.', 'I check again every 20 seconds, for up to 3 minutes. If it does not come, open Zepp for a few seconds so it syncs.')}
              </Text>
              <View style={s.btns}>
                {wait.failed ? (
                  <Pressable onPress={() => setWait({ since: wait.since, back: Date.now() })} style={({ pressed }) => [s.btnDark, pressed && { opacity: 0.8 }]}>
                    <Text style={[T.bold, { fontSize: 14, color: '#fff' }]}>{tr('לנסות שוב', 'Try again')}</Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={() => openZepp()} style={({ pressed }) => [s.btnLight, pressed && { opacity: 0.8 }]}>
                    <Text style={[T.bold, { fontSize: 14 }]}>{tr('לפתוח את Zepp', 'Open Zepp')}</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => setWait(null)} style={({ pressed }) => [s.btnLight, pressed && { opacity: 0.8 }]}>
                  <Text style={[T.bold, { fontSize: 14 }]}>{tr('ביטול', 'Cancel')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
        {!log.length && !checks.length && !wait && <Text style={[T.muted, { fontSize: 14, textAlign: 'center', marginTop: 40 }]}>{tr('כשהמאמן יגיד משהו, זה יופיע כאן.', 'When the coach says something, it will show up here.')}</Text>}
      </ScrollView>

      {note && (
        <View style={[s.note, note.bad && { backgroundColor: C.signal }]}>
          <Text style={[T.bold, { fontSize: 14, color: '#fff', textAlign: START }]}>{note.text}</Text>
        </View>
      )}
      <View style={s.ask}>
        <Pressable onPress={camera} hitSlop={6} style={s.askIcon} accessibilityLabel={tr('לצלם ב Zepp ולבדוק', 'Snap it in Zepp and check')}>
          <Ionicons name="camera-outline" size={20} color={C.ink} />
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={tr('מה אתה הולך לאכול?', 'What are you going to eat?')}
          placeholderTextColor={C.muted}
          style={s.askInput}
          returnKeyType="send"
          onSubmitEditing={() => runCheck('text')}
        />
        <Pressable onPress={() => runCheck('text')} disabled={!draft.trim() || checking} style={[s.send, (!draft.trim() || checking) && { opacity: 0.35 }]} accessibilityLabel={tr('לבדוק', 'Check')}>
          {checking ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
        </Pressable>
      </View>
      <View style={[s.bottom, kb > 0 && { display: 'none' }]}>
        <Pressable onPress={() => onRoute({ tab: 'food', focus: 'craving' })} style={({ pressed }) => [s.quick, { backgroundColor: C.signal }, pressed && { opacity: 0.85 }]}>
          <Text style={[T.bold, { fontSize: 15, color: '#fff', textAlign: 'center' }]}>{tr('בא לי משהו', 'I feel like something')}</Text>
        </Pressable>
        <Pressable onPress={ask} disabled={busy} style={({ pressed }) => [s.quick, pressed && { opacity: 0.85 }]}>
          {busy ? <ActivityIndicator color={C.ink} /> : <Text style={[T.bold, { fontSize: 15, textAlign: 'center' }]}>{tr('מה עכשיו?', 'What now?')}</Text>}
        </Pressable>
      </View>
      <SleepEntry
        open={!!sleepFor}
        morning={sleepFor?.at ?? Date.now()}
        onClose={() => setSleepFor(null)}
        onSaved={(n) => {
          const m = sleepFor;
          setSleepFor(null);
          if (m) say(m, tr(`לא ענדתי. ישנתי בערך ${hoursText(n.minutes)}`, `I didn't wear it. I slept about ${hoursText(n.minutes)}`), n.minutes >= 6.5 * 60 ? tr('רשמתי. לילה סביב היעד.', 'Logged. A night around the goal.') : tr(`רשמתי. זה פחות מהיעד, אז היום הרעב יהיה חזק מהרגיל. תכנן מראש ארוחה עם חלבון.`, `Logged. That is under the goal, so today your hunger will be stronger than usual. Plan a meal with protein ahead.`));
        }}
      />
    </View>
  );
}

// The window's height before any keyboard, like the drawer measures it
const WIN0 = Dimensions.get('window').height;

const s = StyleSheet.create({
  coachNew: { borderWidth: 2, borderColor: C.signal },
  head: { flexDirection: ROW, alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  avatarDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.signal },
  list: { paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  stamp: { textAlign: 'center', fontSize: 12, color: '#8A847B' },
  // The coach on the right, its tail corner small; your answers on the left, dark
  coach: { alignSelf: SIDE_START, width: '86%', backgroundColor: C.card, borderRadius: 22, borderBottomRightRadius: 8, padding: 14, gap: 6 },
  coachShort: { alignSelf: SIDE_START, maxWidth: '80%', backgroundColor: C.card, borderRadius: 18, borderBottomRightRadius: 6, paddingVertical: 9, paddingHorizontal: 14 },
  tag: { flexDirection: ROW, alignItems: 'center', gap: 5 },
  btns: { flexDirection: ROW, flexWrap: 'wrap', gap: 8, paddingTop: 4 },
  btnDark: { backgroundColor: C.ink, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 },
  btnLight: { borderWidth: 1, borderColor: '#D9D2C7', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14 },
  me: { alignSelf: SIDE_END, flexDirection: ROW, alignItems: 'center', gap: 6, backgroundColor: C.ink, borderRadius: 22, borderBottomLeftRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  note: { marginHorizontal: 16, marginBottom: 6, backgroundColor: C.water, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  bottom: { flexDirection: ROW, gap: 8, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6 },
  ask: { flexDirection: ROW, alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 4, backgroundColor: C.card, borderRadius: 18, paddingVertical: 5, paddingHorizontal: 6 },
  askIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  askInput: { flex: 1, fontSize: 15, textAlign: START, fontFamily: T.base.fontFamily, color: C.ink, paddingVertical: 6 },
  send: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  pill: { fontSize: 12, fontFamily: T.bold.fontFamily, paddingVertical: 2, paddingHorizontal: 9, borderRadius: 999, overflow: 'hidden' },
  quick: { flex: 1, height: 50, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
});
